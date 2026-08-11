import app from "./gc-seal-market-wrapper.js";
import { sanitizeGrandCompanyAnalysis } from "./grand-company-deliveries.js";

export const GC_SUPPLY_DUTY_PARSER_VERSION = "supply-duty-v2";

const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash";
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_PROFILE_ANALYSES_PER_DAY = 12;
const MAX_GLOBAL_ANALYSES_PER_DAY = 50;
const ALLOWED_IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
let schemaReady = null;

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff"
    }
  });
}

async function sha256Hex(value) {
  const bytes = typeof value === "string" ? new TextEncoder().encode(value) : value;
  const buffer = bytes instanceof ArrayBuffer
    ? bytes
    : bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, "0")).join("");
}

async function profileHashFromRequest(request) {
  const token = request.headers.get("x-profile-token") || "";
  if (!/^[A-Za-z0-9_-]{43,128}$/.test(token)) return null;
  return sha256Hex(token);
}

function japanDateKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  const get = type => parts.find(part => part.type === type)?.value || "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

async function ensureSchema(env) {
  if (!schemaReady) {
    schemaReady = env.DB.batch([
      env.DB.prepare(`
        CREATE TABLE IF NOT EXISTS grand_company_image_cache (
          profile_hash TEXT NOT NULL,
          image_sha256 TEXT NOT NULL,
          analysis_json TEXT NOT NULL,
          observed_at TEXT NOT NULL,
          PRIMARY KEY (profile_hash, image_sha256)
        )
      `),
      env.DB.prepare(`
        CREATE TABLE IF NOT EXISTS decision_context_usage (
          usage_date TEXT NOT NULL,
          profile_hash TEXT NOT NULL,
          analyses INTEGER NOT NULL DEFAULT 0,
          PRIMARY KEY (usage_date, profile_hash)
        )
      `),
      env.DB.prepare(`
        CREATE TABLE IF NOT EXISTS decision_context_global_usage (
          usage_date TEXT PRIMARY KEY,
          analyses INTEGER NOT NULL DEFAULT 0
        )
      `)
    ]).catch(error => {
      schemaReady = null;
      throw error;
    });
  }
  return schemaReady;
}

function grandCompanySchema() {
  return {
    type: "object",
    additionalProperties: false,
    properties: {
      recognized: { type: "boolean" },
      confidence: { type: "number", minimum: 0, maximum: 1 },
      company_name: { type: ["string", "null"] },
      deliveries: {
        type: "array",
        maxItems: 50,
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            class_or_job: { type: ["string", "null"] },
            item_name: { type: "string" },
            requested_quantity: { type: ["integer", "null"] },
            owned_quantity: { type: ["integer", "null"] },
            starred: { type: "boolean" },
            bonus_text: { type: ["string", "null"] },
            reward_text: { type: ["string", "null"] },
            confidence: { type: "number", minimum: 0, maximum: 1 }
          },
          required: [
            "class_or_job",
            "item_name",
            "requested_quantity",
            "owned_quantity",
            "starred",
            "bonus_text",
            "reward_text",
            "confidence"
          ]
        }
      }
    },
    required: ["recognized", "confidence", "company_name", "deliveries"]
  };
}

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, Math.min(i + chunkSize, bytes.length)));
  }
  return btoa(binary);
}

export function buildSupplyDutyPrompt() {
  return [
    "FINAL FANTASY XIV日本語クライアントのグランドカンパニー『調達任務』一覧を判定・抽出してください。",
    "重要: 画面上部に『SUPPLY DUTY』または『調達任務』があり、『軍需品調達』『補給品調達』『希少品調達』のタブ、または『調達依頼品』『調達単位』『報酬経験値』『報酬軍票』『所持数』の列が見える画面は、所属グランドカンパニー名が表示されていなくても recognized=true としてください。",
    "この画面では『双蛇党』『黒渦団』『不滅隊』という会社名が見えないことがあります。会社名が見えないことを理由に recognized=false にしないでください。company_name は見えている時だけ記録し、見えなければ null にしてください。",
    "deliveries は現在選択中のタブに見えている納品行だけを上から順番に抽出してください。",
    "item_name は『調達依頼品』列の日本語表示名をそのまま。requested_quantity は同じ行の『調達単位』の数値です。",
    "owned_quantity は『所持数』欄で現在所持している個数が1つの整数として明確に読める時だけ入れてください。複数の品質別数値など意味が曖昧なら null にし、推測や合算はしないでください。",
    "class_or_job はクラス/ジョブ名が文字で明示されている時だけ入れてください。行頭のクラス/ジョブアイコンだけからジョブ名を推測してはいけません。",
    "starred は行頭などに金色の★が明確に見える行だけ true。★はボーナス対象の可視証拠として扱います。",
    "bonus_text はボーナスを示す文字が実際に見える時だけ記録してください。★だけが見える場合は starred=true、bonus_text=null で構いません。",
    "reward_text は同じ行に見える『報酬経験値』『報酬軍票』を、読める範囲で日本語の短い文字列にまとめてください。例: 『経験値 3085500 / 軍票 1738』。",
    "画面に見える文字と数値だけを使い、ゲーム知識、アイコン知識、外部データ、過去の一覧から品名・数量・ジョブ・所持数を補完しないでください。",
    "『SUPPLY DUTY / 調達任務』ではない別画面、一覧行が1件も読めない画面、判読不能な画像だけ recognized=false、deliveries=[] としてください。"
  ].join("\n");
}

function tagAnalysis(analysis) {
  return {
    ...analysis,
    parser_version: GC_SUPPLY_DUTY_PARSER_VERSION
  };
}

export function shouldReuseSupplyDutyCache(analysis) {
  if (!analysis || typeof analysis !== "object") return false;
  if (analysis.page_type === "grand_company_deliveries") return true;
  return analysis.parser_version === GC_SUPPLY_DUTY_PARSER_VERSION;
}

async function analyzeSupplyDutyImage(file, bytes, env) {
  if (!env.GEMINI_API_KEY) {
    const error = new Error("Gemini APIキーが設定されていません。");
    error.status = 503;
    throw error;
  }
  const model = env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL;
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-goog-api-key": env.GEMINI_API_KEY
      },
      body: JSON.stringify({
        contents: [{
          role: "user",
          parts: [
            { text: buildSupplyDutyPrompt() },
            { inline_data: { mime_type: file.type, data: arrayBufferToBase64(bytes) } }
          ]
        }],
        generationConfig: {
          temperature: 0.02,
          responseMimeType: "application/json",
          responseJsonSchema: grandCompanySchema()
        }
      })
    }
  );
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data?.error?.message || `Gemini HTTP ${response.status}`);
    error.status = 502;
    throw error;
  }
  const text = (data?.candidates?.[0]?.content?.parts || [])
    .map(part => typeof part.text === "string" ? part.text : "")
    .join("")
    .trim();
  if (!text) {
    const error = new Error("調達任務の画像解析結果が返りませんでした。");
    error.status = 502;
    throw error;
  }
  let parsed;
  try { parsed = JSON.parse(text); }
  catch {
    const error = new Error("調達任務の画像解析結果を読み取れませんでした。");
    error.status = 502;
    throw error;
  }
  return tagAnalysis(sanitizeGrandCompanyAnalysis(parsed, model));
}

async function cachedAnalysis(env, profileHash, imageSha) {
  await ensureSchema(env);
  const row = await env.DB.prepare(`
    SELECT analysis_json
    FROM grand_company_image_cache
    WHERE profile_hash=? AND image_sha256=?
    LIMIT 1
  `).bind(profileHash, imageSha).first();
  if (!row?.analysis_json) return null;
  try { return JSON.parse(row.analysis_json); }
  catch { return null; }
}

async function cacheAnalysis(env, profileHash, imageSha, analysis) {
  await ensureSchema(env);
  await env.DB.prepare(`
    INSERT INTO grand_company_image_cache (profile_hash, image_sha256, analysis_json, observed_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(profile_hash, image_sha256) DO UPDATE SET
      analysis_json=excluded.analysis_json,
      observed_at=excluded.observed_at
  `).bind(profileHash, imageSha, JSON.stringify(analysis), new Date().toISOString()).run();
}

async function reserveAnalysisBudget(env, profileHash) {
  await ensureSchema(env);
  const day = japanDateKey();
  const [profileRow, globalRow] = await Promise.all([
    env.DB.prepare(`SELECT analyses FROM decision_context_usage WHERE usage_date=? AND profile_hash=?`).bind(day, profileHash).first(),
    env.DB.prepare(`SELECT analyses FROM decision_context_global_usage WHERE usage_date=?`).bind(day).first()
  ]);
  const profileCount = Number(profileRow?.analyses || 0);
  const globalCount = Number(globalRow?.analyses || 0);
  if (profileCount >= MAX_PROFILE_ANALYSES_PER_DAY) {
    const error = new Error(`今日のスクショ解析は${MAX_PROFILE_ANALYSES_PER_DAY}回までです。同じ画像の貼り直しは回数に含まれません。`);
    error.status = 429;
    throw error;
  }
  if (globalCount >= MAX_GLOBAL_ANALYSES_PER_DAY) {
    const error = new Error("今日の画像解析枠を使い切りました。時間を置いて試してください。");
    error.status = 429;
    throw error;
  }
  await env.DB.batch([
    env.DB.prepare(`
      INSERT INTO decision_context_usage (usage_date, profile_hash, analyses)
      VALUES (?, ?, 1)
      ON CONFLICT(usage_date, profile_hash) DO UPDATE SET analyses=analyses+1
    `).bind(day, profileHash),
    env.DB.prepare(`
      INSERT INTO decision_context_global_usage (usage_date, analyses)
      VALUES (?, 1)
      ON CONFLICT(usage_date) DO UPDATE SET analyses=analyses+1
    `).bind(day)
  ]);
}

async function gcImageInput(request) {
  const contentType = request.headers.get("content-type") || "";
  if (!contentType.includes("multipart/form-data")) return null;
  let form;
  try { form = await request.formData(); }
  catch { return null; }
  if (String(form.get("workflow_context") || "").trim() !== "grand-company") return null;
  const file = form.get("image");
  if (!(file instanceof File)) return { error: json({ error: "クリップボード画像がありません。" }, 400) };
  if (!ALLOWED_IMAGE_TYPES.has(file.type)) return { error: json({ error: "PNG / JPEG / WebP の画像だけ使えます。" }, 415) };
  if (file.size <= 0 || file.size > MAX_IMAGE_BYTES) return { error: json({ error: "画像は8MB以下にしてください。" }, 413) };
  const profileHash = await profileHashFromRequest(request);
  if (!profileHash) return { error: json({ error: "profile token required" }, 401) };
  const bytes = await file.arrayBuffer();
  return {
    profileHash,
    file,
    bytes,
    imageSha: await sha256Hex(bytes)
  };
}

function unknownResponse(analysis, duplicate = false) {
  return json({
    ok: true,
    duplicate,
    context_saved: false,
    analysis,
    grand_company_context_saved: false,
    image_saved: false
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname !== "/api/context/image" || request.method !== "POST") {
      return app.fetch(request, env);
    }

    const input = await gcImageInput(request.clone());
    if (!input) return app.fetch(request, env);
    if (input.error) return input.error;

    const cached = await cachedAnalysis(env, input.profileHash, input.imageSha);
    if (shouldReuseSupplyDutyCache(cached)) {
      if (cached.page_type === "grand_company_deliveries") {
        return app.fetch(request, env);
      }
      return unknownResponse(cached, true);
    }

    try {
      await reserveAnalysisBudget(env, input.profileHash);
      const analysis = await analyzeSupplyDutyImage(input.file, input.bytes, env);
      await cacheAnalysis(env, input.profileHash, input.imageSha, analysis);
      if (analysis.page_type === "grand_company_deliveries") {
        return app.fetch(request, env);
      }
      return unknownResponse(analysis, false);
    } catch (error) {
      return json({ error: error.message || "調達任務の画像解析に失敗しました。" }, Number(error.status) || 500);
    }
  }
};

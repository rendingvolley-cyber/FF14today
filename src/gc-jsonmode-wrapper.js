import app from "./gc-supply-duty-recognition-wrapper.js";
import { sanitizeGrandCompanyAnalysis } from "./grand-company-deliveries.js";

const PARSER_VERSION = "supply-duty-json-v3";
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
        CREATE TABLE IF NOT EXISTS grand_company_delivery_context (
          profile_hash TEXT NOT NULL,
          delivery_date TEXT NOT NULL,
          payload_json TEXT NOT NULL,
          confidence REAL NOT NULL,
          observed_at TEXT NOT NULL,
          source TEXT NOT NULL DEFAULT 'clipboard_image',
          PRIMARY KEY (profile_hash, delivery_date)
        )
      `),
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

function buildPrompt() {
  return [
    "FINAL FANTASY XIV日本語クライアントのグランドカンパニー『調達任務』一覧を画像から読み取ってください。",
    "画面上部に『SUPPLY DUTY』または『調達任務』があり、『軍需品調達』『補給品調達』『希少品調達』のタブ、または『調達依頼品』『調達単位』『報酬経験値』『報酬軍票』『所持数』の列が見えるなら、所属グランドカンパニー名が見えなくても recognized=true としてください。",
    "必ずJSONオブジェクトだけを返してください。キーは recognized, confidence, company_name, deliveries の4つです。",
    "deliveries は配列で、各要素は class_or_job, item_name, requested_quantity, owned_quantity, starred, bonus_text, reward_text, confidence を持ちます。",
    "company_name、class_or_job、requested_quantity、owned_quantity、bonus_text、reward_text は読めない場合 null にしてください。",
    "confidence は0から1。starred は金色の★が明確に見える行だけ true にしてください。",
    "item_name は『調達依頼品』の日本語表示名をそのまま、requested_quantity は同じ行の『調達単位』です。",
    "owned_quantity は『所持数』が単一の整数として明確に読める時だけ入れ、0/6 0 のように意味が複数あり得る表示は null にしてください。",
    "class_or_job は文字で表示されている時だけ。行頭アイコンからジョブ名を推測しないでください。",
    "reward_text は見える『報酬経験値』『報酬軍票』を短くまとめてください。",
    "画面に見える事実だけを使い、ゲーム知識や外部データで補完しないでください。",
    "別画面、一覧行を1件も読めない画像、判読不能な画像だけ recognized=false, deliveries=[] としてください。"
  ].join("\n");
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

function tagAnalysis(analysis) {
  return { ...analysis, parser_version: PARSER_VERSION };
}

function normalizeAnalysis(parsed, model) {
  const sanitized = sanitizeGrandCompanyAnalysis(parsed, model);
  if (sanitized.page_type === "grand_company_deliveries" && sanitized.confidence >= 0.6) {
    return tagAnalysis(sanitized);
  }
  return tagAnalysis(sanitizeGrandCompanyAnalysis({
    recognized: false,
    confidence: Number.isFinite(Number(parsed?.confidence)) ? Number(parsed.confidence) : 0,
    company_name: null,
    deliveries: []
  }, model));
}

async function analyzeImage(file, bytes, env) {
  if (!env.GEMINI_API_KEY) {
    const error = new Error("画像解析の設定がありません。");
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
            { text: buildPrompt() },
            { inline_data: { mime_type: file.type, data: arrayBufferToBase64(bytes) } }
          ]
        }],
        generationConfig: {
          temperature: 0.02,
          responseMimeType: "application/json"
        }
      })
    }
  );

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error("画像解析側で一時的なエラーが発生しました。少し待って同じスクショをもう一度貼ってください。");
    error.status = 502;
    error.provider_status = response.status;
    throw error;
  }

  const text = (data?.candidates?.[0]?.content?.parts || [])
    .map(part => typeof part.text === "string" ? part.text : "")
    .join("")
    .trim();
  if (!text) {
    const error = new Error("画像解析結果が空でした。同じスクショをもう一度貼ってください。");
    error.status = 502;
    throw error;
  }

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    const error = new Error("画像解析結果を安全に読み取れませんでした。同じスクショをもう一度貼ってください。");
    error.status = 502;
    throw error;
  }
  return normalizeAnalysis(parsed, model);
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

async function storeContext(env, profileHash, analysis) {
  if (analysis?.page_type !== "grand_company_deliveries" || analysis.confidence < 0.6) return false;
  await ensureSchema(env);
  await env.DB.prepare(`
    INSERT INTO grand_company_delivery_context (
      profile_hash, delivery_date, payload_json, confidence, observed_at, source
    ) VALUES (?, ?, ?, ?, ?, 'clipboard_image')
    ON CONFLICT(profile_hash, delivery_date) DO UPDATE SET
      payload_json=excluded.payload_json,
      confidence=excluded.confidence,
      observed_at=excluded.observed_at,
      source=excluded.source
  `).bind(
    profileHash,
    japanDateKey(),
    JSON.stringify(analysis.grand_company_deliveries),
    analysis.confidence,
    new Date().toISOString()
  ).run();
  return true;
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
    const error = new Error(`今日のスクショ解析は${MAX_PROFILE_ANALYSES_PER_DAY}回までです。`);
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

async function readGcInput(request) {
  const contentType = request.headers.get("content-type") || "";
  if (!contentType.includes("multipart/form-data")) return null;
  let form;
  try { form = await request.formData(); }
  catch { return null; }
  if (String(form.get("workflow_context") || "").trim() !== "grand-company") return null;

  const profileHash = await profileHashFromRequest(request);
  if (!profileHash) return { error: json({ error: "profile token required" }, 401) };
  const file = form.get("image");
  if (!(file instanceof File)) return { error: json({ error: "クリップボード画像がありません。" }, 400) };
  if (!ALLOWED_IMAGE_TYPES.has(file.type)) return { error: json({ error: "PNG / JPEG / WebP の画像だけ使えます。" }, 415) };
  if (file.size <= 0 || file.size > MAX_IMAGE_BYTES) return { error: json({ error: "画像は8MB以下にしてください。" }, 413) };
  const bytes = await file.arrayBuffer();
  return { profileHash, file, bytes, imageSha: await sha256Hex(bytes) };
}

function analysisResponse(analysis, saved, duplicate) {
  return json({
    ok: true,
    duplicate,
    context_saved: false,
    analysis,
    grand_company_context_saved: saved,
    image_saved: false
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname !== "/api/context/image" || request.method !== "POST") {
      return app.fetch(request, env);
    }

    const input = await readGcInput(request.clone());
    if (!input) return app.fetch(request, env);
    if (input.error) return input.error;

    const cached = await cachedAnalysis(env, input.profileHash, input.imageSha);
    if (cached?.parser_version === PARSER_VERSION) {
      const saved = await storeContext(env, input.profileHash, cached);
      return analysisResponse(cached, saved, true);
    }
    if (cached?.page_type === "grand_company_deliveries") {
      const saved = await storeContext(env, input.profileHash, cached);
      return analysisResponse(cached, saved, true);
    }

    try {
      await reserveAnalysisBudget(env, input.profileHash);
      const analysis = await analyzeImage(input.file, input.bytes, env);
      await cacheAnalysis(env, input.profileHash, input.imageSha, analysis);
      const saved = await storeContext(env, input.profileHash, analysis);
      return analysisResponse(analysis, saved, false);
    } catch (error) {
      return json({
        error: error?.message || "画像解析に失敗しました。",
        error_code: "gc_image_analysis_failed"
      }, Number(error?.status || 500));
    }
  }
};

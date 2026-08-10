import app from "./retainer-first-wrapper.js";
import {
  chooseGrandCompanyDelivery,
  decorateGrandCompanyDelivery,
  sanitizeGrandCompanyAnalysis
} from "./grand-company-deliveries.js";

const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash";
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
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
        CREATE INDEX IF NOT EXISTS idx_grand_company_delivery_time
        ON grand_company_delivery_context(profile_hash, observed_at DESC)
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

async function analyzeGrandCompanyImage(file, bytes, env) {
  if (!env.GEMINI_API_KEY) return null;
  const model = env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL;
  const prompt = [
    "FINAL FANTASY XIV日本語クライアントのスクリーンショットが、グランドカンパニーへ納品する今日の調達品一覧か判定してください。",
    "一覧ではなければ recognized=false、deliveries=[]。",
    "画面に見える事実だけ抽出し、ゲーム知識・過去の日付・外部データから品名や必要数を補完しないでください。",
    "company_nameは画面に所属グランドカンパニー名が見える時だけ記録し、見えなければnull。",
    "deliveriesは画面に見える納品行だけを上から順番に入れてください。",
    "class_or_jobは行に見えるクラス/ジョブ名、item_nameは表示名、requested_quantityは必要数、owned_quantityは所持数。見えなければnull。",
    "starredはその行に星・ボーナスを示す明確な表示がある時だけtrue。bonus_textとreward_textも文字が見える時だけ記録。",
    "HQ/NQ、報酬、所持数などを推測しないでください。文字が怪しい行はconfidenceを下げてください。"
  ].join("\n");

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
            { text: prompt },
            { inline_data: { mime_type: file.type, data: arrayBufferToBase64(bytes) } }
          ]
        }],
        generationConfig: {
          temperature: 0.05,
          responseMimeType: "application/json",
          responseJsonSchema: grandCompanySchema()
        }
      })
    }
  );
  if (!response.ok) return null;
  const data = await response.json();
  const text = (data?.candidates?.[0]?.content?.parts || [])
    .map(part => typeof part.text === "string" ? part.text : "")
    .join("")
    .trim();
  if (!text) return null;
  let parsed;
  try { parsed = JSON.parse(text); }
  catch { return null; }
  return sanitizeGrandCompanyAnalysis(parsed, model);
}

async function storeGrandCompanyContext(env, profileHash, analysis) {
  if (!profileHash || analysis?.page_type !== "grand_company_deliveries" || analysis.confidence < 0.6) return false;
  await ensureSchema(env);
  const payload = analysis.grand_company_deliveries;
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
    JSON.stringify(payload),
    analysis.confidence,
    new Date().toISOString()
  ).run();
  return true;
}

async function fallbackGrandCompanyImage(request, response, env) {
  if (!response.ok || !(response.headers.get("content-type") || "").includes("application/json")) return response;
  let data;
  try { data = await response.clone().json(); }
  catch { return response; }
  if (data?.analysis?.page_type !== "unknown") return response;

  const profileHash = await profileHashFromRequest(request);
  if (!profileHash) return response;
  let form;
  try { form = await request.formData(); }
  catch { return response; }
  const file = form.get("image");
  if (!(file instanceof File) || !ALLOWED_IMAGE_TYPES.has(file.type) || file.size <= 0 || file.size > MAX_IMAGE_BYTES) return response;

  const bytes = await file.arrayBuffer();
  const analysis = await analyzeGrandCompanyImage(file, bytes, env);
  if (!analysis || analysis.page_type !== "grand_company_deliveries") return response;
  const saved = await storeGrandCompanyContext(env, profileHash, analysis);
  return json({
    ...data,
    duplicate: false,
    analysis,
    grand_company_context_saved: saved,
    image_saved: false
  }, response.status);
}

async function handleDeliveries(request, env) {
  const profileHash = await profileHashFromRequest(request);
  if (!profileHash) return json({ error: "profile token required" }, 401);
  await ensureSchema(env);
  const row = await env.DB.prepare(`
    SELECT payload_json, confidence, observed_at
    FROM grand_company_delivery_context
    WHERE profile_hash=? AND delivery_date=?
    LIMIT 1
  `).bind(profileHash, japanDateKey()).first();

  if (!row?.payload_json) {
    return json({
      ok: true,
      setup_required: true,
      message: "今日の双蛇党納品一覧のスクショをCtrl+Vしてください。見えている必要数・所持数・ボーナス表示だけで最初の1件を決めます。",
      deliveries: [],
      recommended: null
    });
  }

  let payload;
  try { payload = JSON.parse(row.payload_json); }
  catch {
    return json({ error: "保存済みの納品一覧を読み取れませんでした。" }, 500);
  }
  const deliveries = (Array.isArray(payload?.deliveries) ? payload.deliveries : []).map(decorateGrandCompanyDelivery);
  return json({
    ok: true,
    setup_required: false,
    company_name: payload?.company_name || null,
    observed_at: row.observed_at,
    confidence: Number(row.confidence || 0),
    deliveries,
    recommended: chooseGrandCompanyDelivery(deliveries)
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/api/context/image" && request.method === "POST") {
      const response = await app.fetch(request.clone(), env);
      return fallbackGrandCompanyImage(request, response, env);
    }
    if (url.pathname === "/api/grand-company/deliveries" && request.method === "GET") {
      return handleDeliveries(request, env);
    }

    const response = await app.fetch(request, env);
    if (url.pathname === "/api/health" && request.method === "GET" && response.ok) {
      let data;
      try { data = await response.clone().json(); }
      catch { return response; }
      return json({
        ...data,
        grand_company_daily_flow: true,
        grand_company_screenshot_evidence: true,
        grand_company_today_only_context: true
      }, response.status);
    }
    return response;
  }
};

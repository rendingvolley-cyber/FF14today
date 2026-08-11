const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash";
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const JOURNAL_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const STATS_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;
const ALLOWED_IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

let schemaReady = null;

function normalizeText(value, max = 300) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

function clampConfidence(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0;
}

function nullableInt(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isInteger(n) && n >= 0 ? n : null;
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

async function sha256Hex(value) {
  const bytes = typeof value === "string" ? new TextEncoder().encode(value) : value;
  const buffer = bytes instanceof ArrayBuffer
    ? bytes
    : bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, "0")).join("");
}

async function requireProfileHash(request) {
  const token = request.headers.get("x-profile-token") || "";
  if (!/^[A-Za-z0-9_-]{43,128}$/.test(token)) {
    const error = new Error("匿名プロフィールを確認できません。ページを再読み込みしてください。");
    error.status = 401;
    throw error;
  }
  return sha256Hex(token);
}

async function ensureSchema(env) {
  if (!schemaReady) {
    const statements = [
      `CREATE TABLE IF NOT EXISTS decision_context (
        profile_hash TEXT NOT NULL,
        context_type TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        confidence REAL NOT NULL,
        observed_at TEXT NOT NULL,
        source TEXT NOT NULL DEFAULT 'clipboard_image',
        PRIMARY KEY (profile_hash, context_type)
      )`,
      `CREATE TABLE IF NOT EXISTS decision_context_image_cache (
        profile_hash TEXT NOT NULL,
        image_sha256 TEXT NOT NULL,
        analysis_json TEXT NOT NULL,
        observed_at TEXT NOT NULL,
        PRIMARY KEY (profile_hash, image_sha256)
      )`
    ];
    schemaReady = env.DB.batch(statements.map(sql => env.DB.prepare(sql))).catch(error => {
      schemaReady = null;
      throw error;
    });
  }
  return schemaReady;
}

function contextSchema() {
  return {
    type: "object",
    additionalProperties: false,
    properties: {
      page_type: {
        type: "string",
        enum: ["journal", "crafter_stats", "gatherer_stats", "unknown"]
      },
      confidence: { type: "number", minimum: 0, maximum: 1 },
      journal_entries: {
        type: "array",
        maxItems: 12,
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            title: { type: "string" },
            objective: { type: ["string", "null"] },
            progress: { type: ["string", "null"] },
            location: { type: ["string", "null"] },
            deadline_text: { type: ["string", "null"] },
            level: { type: ["integer", "null"] },
            confidence: { type: "number", minimum: 0, maximum: 1 }
          },
          required: ["title", "objective", "progress", "location", "deadline_text", "level", "confidence"]
        }
      },
      crafter_stats: {
        type: ["object", "null"],
        properties: {
          job_name: { type: ["string", "null"] },
          level: { type: ["integer", "null"] },
          craftsmanship: { type: ["integer", "null"] },
          control: { type: ["integer", "null"] },
          cp: { type: ["integer", "null"] }
        },
        required: ["job_name", "level", "craftsmanship", "control", "cp"]
      },
      gatherer_stats: {
        type: ["object", "null"],
        properties: {
          job_name: { type: ["string", "null"] },
          level: { type: ["integer", "null"] },
          gathering: { type: ["integer", "null"] },
          perception: { type: ["integer", "null"] },
          gp: { type: ["integer", "null"] }
        },
        required: ["job_name", "level", "gathering", "perception", "gp"]
      }
    },
    required: ["page_type", "confidence", "journal_entries", "crafter_stats", "gatherer_stats"]
  };
}

function sanitizeAnalysis(parsed, model) {
  const pageType = ["journal", "crafter_stats", "gatherer_stats", "unknown"].includes(parsed?.page_type)
    ? parsed.page_type
    : "unknown";
  const journalEntries = (Array.isArray(parsed?.journal_entries) ? parsed.journal_entries : [])
    .slice(0, 12)
    .map(entry => ({
      title: normalizeText(entry?.title, 180),
      objective: entry?.objective == null ? null : normalizeText(entry.objective, 300),
      progress: entry?.progress == null ? null : normalizeText(entry.progress, 120),
      location: entry?.location == null ? null : normalizeText(entry.location, 160),
      deadline_text: entry?.deadline_text == null ? null : normalizeText(entry.deadline_text, 120),
      level: nullableInt(entry?.level),
      confidence: clampConfidence(entry?.confidence)
    }))
    .filter(entry => entry.title && entry.confidence >= 0.55);

  const crafter = parsed?.crafter_stats && typeof parsed.crafter_stats === "object"
    ? {
        job_name: parsed.crafter_stats.job_name == null ? null : normalizeText(parsed.crafter_stats.job_name, 80),
        level: nullableInt(parsed.crafter_stats.level),
        craftsmanship: nullableInt(parsed.crafter_stats.craftsmanship),
        control: nullableInt(parsed.crafter_stats.control),
        cp: nullableInt(parsed.crafter_stats.cp)
      }
    : null;

  const gatherer = parsed?.gatherer_stats && typeof parsed.gatherer_stats === "object"
    ? {
        job_name: parsed.gatherer_stats.job_name == null ? null : normalizeText(parsed.gatherer_stats.job_name, 80),
        level: nullableInt(parsed.gatherer_stats.level),
        gathering: nullableInt(parsed.gatherer_stats.gathering),
        perception: nullableInt(parsed.gatherer_stats.perception),
        gp: nullableInt(parsed.gatherer_stats.gp)
      }
    : null;

  return {
    page_type: pageType,
    confidence: clampConfidence(parsed?.confidence),
    model,
    journal_entries: journalEntries,
    crafter_stats: crafter,
    gatherer_stats: gatherer
  };
}

async function analyzeWithGemini(env, file, bytes) {
  if (!env.GEMINI_API_KEY) {
    const error = new Error("Gemini APIキーがCloudflare Secretに未設定です。");
    error.status = 503;
    throw error;
  }

  const model = env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL;
  const prompt = [
    "FINAL FANTASY XIVの日本語クライアントのスクリーンショットを、意思決定支援用の事実として構造化してください。",
    "画面に見えている文字と数値だけを抽出し、推測・補完・攻略知識による穴埋めは禁止です。",
    "page_type は journal / crafter_stats / gatherer_stats / unknown のどれかです。",
    "journal: ジャーナルに見えているクエストやリーヴ等を上から抽出。titleは表示名、objective/progress/location/deadline_text/levelは明示されている場合のみ。",
    "crafter_stats: 製作系のステータス画面なら、ジョブ名・レベル・作業精度・加工精度・CPを読み取る。見えなければnull。",
    "gatherer_stats: 採集系のステータス画面なら、ジョブ名・レベル・獲得力・技術力・GPを読み取る。見えなければnull。",
    "別種の画面や判読不能ならunknown。confidenceは画面種別と主要値の読み取り確信度です。",
    "英語へ翻訳せず、名前や場所は画面の日本語表記を優先してください。"
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
          temperature: 0.1,
          responseMimeType: "application/json",
          responseJsonSchema: contextSchema()
        }
      })
    }
  );

  const data = await response.json();
  if (!response.ok) throw new Error(data?.error?.message || `Gemini HTTP ${response.status}`);
  const text = (data?.candidates?.[0]?.content?.parts || [])
    .map(part => typeof part.text === "string" ? part.text : "")
    .join("")
    .trim();
  if (!text) throw new Error("画像解析結果が返りませんでした。");
  let parsed;
  try { parsed = JSON.parse(text); }
  catch { throw new Error("画像解析結果のJSONを読み取れませんでした。"); }
  return sanitizeAnalysis(parsed, model);
}

async function storeContext(env, profileHash, analysis) {
  await ensureSchema(env);
  if (analysis.page_type === "unknown" || analysis.confidence < 0.6) return false;
  const observedAt = new Date().toISOString();
  const payload = {
    page_type: analysis.page_type,
    journal_entries: analysis.journal_entries,
    crafter_stats: analysis.crafter_stats,
    gatherer_stats: analysis.gatherer_stats,
    model: analysis.model
  };
  await env.DB.prepare(`
    INSERT INTO decision_context (profile_hash, context_type, payload_json, confidence, observed_at, source)
    VALUES (?, ?, ?, ?, ?, 'clipboard_image')
    ON CONFLICT(profile_hash, context_type) DO UPDATE SET
      payload_json=excluded.payload_json,
      confidence=excluded.confidence,
      observed_at=excluded.observed_at,
      source=excluded.source
  `).bind(profileHash, analysis.page_type, JSON.stringify(payload), analysis.confidence, observedAt).run();
  return true;
}

async function cachedAnalysis(env, profileHash, imageSha) {
  const row = await env.DB.prepare(`
    SELECT analysis_json FROM decision_context_image_cache
    WHERE profile_hash=? AND image_sha256=?
    LIMIT 1
  `).bind(profileHash, imageSha).first();
  if (!row?.analysis_json) return null;
  try { return JSON.parse(row.analysis_json); }
  catch { return null; }
}

async function cacheAnalysis(env, profileHash, imageSha, analysis) {
  await env.DB.prepare(`
    INSERT INTO decision_context_image_cache (profile_hash, image_sha256, analysis_json, observed_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(profile_hash, image_sha256) DO UPDATE SET
      analysis_json=excluded.analysis_json,
      observed_at=excluded.observed_at
  `).bind(profileHash, imageSha, JSON.stringify(analysis), new Date().toISOString()).run();
}

export async function analyzeDecisionContextImage(request, env) {
  const profileHash = await requireProfileHash(request);
  await ensureSchema(env);
  let form;
  try { form = await request.formData(); }
  catch {
    const error = new Error("画像データを読み取れませんでした。");
    error.status = 400;
    throw error;
  }
  const file = form.get("image");
  if (!(file instanceof File)) {
    const error = new Error("クリップボード画像がありません。");
    error.status = 400;
    throw error;
  }
  if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
    const error = new Error("PNG / JPEG / WebP の画像だけ使えます。");
    error.status = 415;
    throw error;
  }
  if (file.size <= 0 || file.size > MAX_IMAGE_BYTES) {
    const error = new Error("画像は8MB以下にしてください。");
    error.status = 413;
    throw error;
  }

  const bytes = await file.arrayBuffer();
  const imageSha = await sha256Hex(bytes);
  const duplicate = await cachedAnalysis(env, profileHash, imageSha);
  if (duplicate) {
    const saved = await storeContext(env, profileHash, duplicate);
    return {
      ok: true,
      duplicate: true,
      image_saved: false,
      context_saved: saved,
      analysis: duplicate
    };
  }

  const analysis = await analyzeWithGemini(env, file, bytes);
  await cacheAnalysis(env, profileHash, imageSha, analysis);
  const saved = await storeContext(env, profileHash, analysis);
  return {
    ok: true,
    duplicate: false,
    image_saved: false,
    context_saved: saved,
    analysis
  };
}

function maxAgeForContext(type) {
  return type === "journal" ? JOURNAL_MAX_AGE_MS : STATS_MAX_AGE_MS;
}

export async function getDecisionContext(request, env) {
  const profileHash = await requireProfileHash(request);
  await ensureSchema(env);
  const result = await env.DB.prepare(`
    SELECT context_type, payload_json, confidence, observed_at
    FROM decision_context
    WHERE profile_hash=?
    ORDER BY observed_at DESC
  `).bind(profileHash).all();

  const context = {};
  const now = Date.now();
  for (const row of result.results || []) {
    const observed = new Date(row.observed_at).getTime();
    if (!Number.isFinite(observed) || now - observed > maxAgeForContext(row.context_type)) continue;
    let payload;
    try { payload = JSON.parse(row.payload_json); }
    catch { continue; }
    context[row.context_type] = {
      ...payload,
      confidence: Number(row.confidence) || 0,
      observed_at: row.observed_at
    };
  }
  return context;
}

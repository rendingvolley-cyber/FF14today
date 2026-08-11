const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash";
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_PROFILE_ANALYSES_PER_DAY = 12;
const MAX_GLOBAL_ANALYSES_PER_DAY = 50;
const ALLOWED_IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

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

function normalizeText(value, max = 240) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

function nullableInt(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isInteger(n) && n >= 0 ? n : null;
}

function clampConfidence(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0;
}

function normalizeKey(value) {
  return normalizeText(value, 300).normalize("NFKC").toLocaleLowerCase("ja-JP");
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

async function profileHashFromRequest(request) {
  const token = request.headers.get("x-profile-token") || "";
  if (!/^[A-Za-z0-9_-]{43,128}$/.test(token)) {
    const error = new Error("プロフィールを確認できません。ページを再読み込みしてください。");
    error.status = 401;
    throw error;
  }
  return sha256Hex(token);
}

async function ensureSchema(env) {
  await env.DB.batch([
    env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS retainer_venture_context (
        profile_hash TEXT NOT NULL,
        subject_key TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        confidence REAL NOT NULL,
        observed_at TEXT NOT NULL,
        source TEXT NOT NULL DEFAULT 'clipboard_image',
        PRIMARY KEY (profile_hash, subject_key)
      )
    `),
    env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS retainer_workflow_image_cache (
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
  ]);
}

async function reserveBudget(env, profileHash) {
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

function schema() {
  return {
    type: "object",
    additionalProperties: false,
    properties: {
      screen_type: { type: "string", enum: ["venture_item_list", "retainer_overview", "other"] },
      confidence: { type: "number", minimum: 0, maximum: 1 },
      retainer_name: { type: ["string", "null"] },
      job_name: { type: ["string", "null"] },
      level: { type: ["integer", "null"] },
      ventures: {
        type: "array",
        maxItems: 30,
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            item_name: { type: "string" },
            quantity: { type: ["integer", "null"] },
            venture_level: { type: ["integer", "null"] },
            duration_minutes: { type: ["integer", "null"] },
            confidence: { type: "number", minimum: 0, maximum: 1 }
          },
          required: ["item_name", "quantity", "venture_level", "duration_minutes", "confidence"]
        }
      }
    },
    required: ["screen_type", "confidence", "retainer_name", "job_name", "level", "ventures"]
  };
}

export function sanitizeRetainerWorkflowAnalysis(parsed, model = "test") {
  const screenType = ["venture_item_list", "retainer_overview", "other"].includes(parsed?.screen_type)
    ? parsed.screen_type
    : "other";
  const ventures = (Array.isArray(parsed?.ventures) ? parsed.ventures : [])
    .slice(0, 30)
    .map(entry => ({
      item_name: normalizeText(entry?.item_name, 160),
      quantity: nullableInt(entry?.quantity),
      venture_level: nullableInt(entry?.venture_level),
      duration_minutes: nullableInt(entry?.duration_minutes),
      confidence: clampConfidence(entry?.confidence)
    }))
    .filter(entry => entry.item_name && entry.confidence >= 0.65);
  if (screenType === "venture_item_list" && ventures.length) {
    return {
      page_type: "retainer_ventures",
      confidence: clampConfidence(parsed?.confidence),
      model,
      retainer_ventures: {
        retainer_name: parsed?.retainer_name == null ? null : normalizeText(parsed.retainer_name, 100),
        job_name: parsed?.job_name == null ? null : normalizeText(parsed.job_name, 80),
        level: nullableInt(parsed?.level),
        ventures
      },
      journal_entries: [],
      crafter_stats: null,
      gatherer_stats: null
    };
  }
  if (screenType === "retainer_overview") {
    return {
      page_type: "retainer_overview",
      confidence: clampConfidence(parsed?.confidence),
      model,
      retainer_ventures: null,
      journal_entries: [],
      crafter_stats: null,
      gatherer_stats: null
    };
  }
  return {
    page_type: "unknown",
    confidence: clampConfidence(parsed?.confidence),
    model,
    retainer_ventures: null,
    journal_entries: [],
    crafter_stats: null,
    gatherer_stats: null
  };
}

async function analyze(file, bytes, env) {
  if (!env.GEMINI_API_KEY) {
    const error = new Error("Gemini APIキーがCloudflare Secretに未設定です。");
    error.status = 503;
    throw error;
  }
  const model = env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL;
  const prompt = [
    "FINAL FANTASY XIV日本語クライアントのリテイナー画面を分類してください。",
    "screen_type は venture_item_list / retainer_overview / other のどれかです。",
    "venture_item_list は、1人のリテイナーを開き、ベンチャー → 調達依頼へ進んだ後に、派遣可能なアイテム名が複数行並んでいる候補一覧画面です。",
    "retainer_overview は、複数のリテイナー名・クラス/ジョブ・レベル・現在の依頼状況などが並ぶリテイナー一覧/選択画面です。この画面だけでは派遣アイテム候補は分かりません。",
    "other は上記以外です。",
    "画面に見えている事実だけを抽出し、ゲーム知識で補完しないでください。",
    "venture_item_list の場合だけ ventures に表示中の調達可能アイテムを上から入れてください。item_nameは日本語表示名そのまま。",
    "quantity、venture_level、duration_minutesはその行に明示されている時だけ数字を入れ、見えなければnull。",
    "retainer_overview や other の場合 ventures=[]。推測禁止です。"
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
          responseJsonSchema: schema()
        }
      })
    }
  );
  const data = await response.json();
  if (!response.ok) {
    const error = new Error(data?.error?.message || `Gemini HTTP ${response.status}`);
    error.status = 502;
    throw error;
  }
  const text = (data?.candidates?.[0]?.content?.parts || [])
    .map(part => typeof part.text === "string" ? part.text : "")
    .join("")
    .trim();
  if (!text) throw new Error("リテイナー画像の解析結果が返りませんでした。");
  let parsed;
  try { parsed = JSON.parse(text); }
  catch { throw new Error("リテイナー画像の解析結果を読み取れませんでした。"); }
  return sanitizeRetainerWorkflowAnalysis(parsed, model);
}

function subjectKey(retainer) {
  const name = normalizeKey(retainer?.retainer_name);
  if (name) return `name:${name}`;
  return `job:${normalizeKey(retainer?.job_name) || "unknown"}:lv:${nullableInt(retainer?.level) ?? "unknown"}`;
}

async function store(env, profileHash, analysis) {
  if (analysis?.page_type !== "retainer_ventures" || analysis.confidence < 0.6) return false;
  const incoming = analysis.retainer_ventures;
  const key = subjectKey(incoming);
  const row = await env.DB.prepare(`
    SELECT payload_json FROM retainer_venture_context
    WHERE profile_hash=? AND subject_key=? LIMIT 1
  `).bind(profileHash, key).first();
  let previous = null;
  try { previous = row?.payload_json ? JSON.parse(row.payload_json) : null; }
  catch { previous = null; }
  const map = new Map();
  for (const entry of [...(previous?.ventures || []), ...(incoming?.ventures || [])]) {
    const itemKey = normalizeKey(entry?.item_name);
    if (itemKey) map.set(itemKey, { ...(map.get(itemKey) || {}), ...entry });
  }
  const payload = {
    retainer_name: incoming.retainer_name || previous?.retainer_name || null,
    job_name: incoming.job_name || previous?.job_name || null,
    level: incoming.level ?? previous?.level ?? null,
    ventures: [...map.values()].slice(0, 100),
    model: analysis.model
  };
  await env.DB.prepare(`
    INSERT INTO retainer_venture_context (
      profile_hash, subject_key, payload_json, confidence, observed_at, source
    ) VALUES (?, ?, ?, ?, ?, 'clipboard_image')
    ON CONFLICT(profile_hash, subject_key) DO UPDATE SET
      payload_json=excluded.payload_json,
      confidence=excluded.confidence,
      observed_at=excluded.observed_at,
      source=excluded.source
  `).bind(profileHash, key, JSON.stringify(payload), analysis.confidence, new Date().toISOString()).run();
  return true;
}

async function cached(env, profileHash, imageSha) {
  const row = await env.DB.prepare(`
    SELECT analysis_json FROM retainer_workflow_image_cache
    WHERE profile_hash=? AND image_sha256=? LIMIT 1
  `).bind(profileHash, imageSha).first();
  if (!row?.analysis_json) return null;
  try { return JSON.parse(row.analysis_json); }
  catch { return null; }
}

async function cache(env, profileHash, imageSha, analysis) {
  await env.DB.prepare(`
    INSERT INTO retainer_workflow_image_cache (profile_hash, image_sha256, analysis_json, observed_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(profile_hash, image_sha256) DO UPDATE SET
      analysis_json=excluded.analysis_json,
      observed_at=excluded.observed_at
  `).bind(profileHash, imageSha, JSON.stringify(analysis), new Date().toISOString()).run();
}

export async function handleRetainerWorkflowImage(request, env) {
  const profileHash = await profileHashFromRequest(request);
  await ensureSchema(env);
  let form;
  try { form = await request.formData(); }
  catch {
    const error = new Error("画像データを読み取れませんでした。");
    error.status = 400;
    throw error;
  }
  const file = form.get("image");
  if (!(file instanceof File) || !ALLOWED_IMAGE_TYPES.has(file.type) || file.size <= 0 || file.size > MAX_IMAGE_BYTES) {
    const error = new Error("PNG/JPEG/WebPの8MB以下の画像を貼り付けてください。");
    error.status = 400;
    throw error;
  }
  const bytes = await file.arrayBuffer();
  const imageSha = await sha256Hex(bytes);
  let analysis = await cached(env, profileHash, imageSha);
  let duplicate = Boolean(analysis);
  if (!analysis) {
    await reserveBudget(env, profileHash);
    analysis = await analyze(file, bytes, env);
    await cache(env, profileHash, imageSha, analysis);
  }
  const saved = await store(env, profileHash, analysis);
  const expectedScreen = "リテイナーを1人開く → ベンチャー → 調達依頼 → アイテム候補が複数行並ぶ画面";
  return json({
    ok: true,
    duplicate,
    analysis,
    context_saved: saved,
    retainer_context_saved: saved,
    image_saved: false,
    expected_screen: expectedScreen,
    message: analysis.page_type === "retainer_overview"
      ? `リテイナー一覧は確認できました。ただし派遣先比較にはアイテム候補が必要です。${expectedScreen}を貼ってください。`
      : analysis.page_type === "retainer_ventures"
        ? "調達依頼のアイテム候補を保存しました。市場比較を更新します。"
        : `この画像から調達依頼の候補一覧を確認できませんでした。${expectedScreen}を貼ってください。`
  });
}

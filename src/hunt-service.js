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

function cleanText(value, max = 180) {
  return String(value ?? "").replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
}

function clampConfidence(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0;
}

function nullableInt(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Math.floor(Number(value));
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function positiveInt(value, fallback = 1) {
  const n = Math.floor(Number(value));
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function japanDateKey(now = new Date()) {
  const parts = new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(now);
  const get = type => parts.find(part => part.type === type)?.value || "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

async function sha256Hex(value) {
  const bytes = typeof value === "string" ? new TextEncoder().encode(value) : value;
  const buffer = bytes instanceof ArrayBuffer
    ? bytes
    : bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, "0")).join("");
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

export async function profileHashFromRequest(request) {
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
      `CREATE TABLE IF NOT EXISTS daily_hunt_targets (
        profile_hash TEXT NOT NULL,
        game_date TEXT NOT NULL,
        target_key TEXT NOT NULL,
        bill_label TEXT,
        mob_name TEXT NOT NULL,
        area_name TEXT,
        required_count INTEGER NOT NULL DEFAULT 1,
        completed_count INTEGER NOT NULL DEFAULT 0,
        exp_reward INTEGER,
        currency_reward INTEGER,
        source_confidence REAL NOT NULL DEFAULT 0,
        verification_status TEXT NOT NULL DEFAULT 'image_read',
        source_image_sha256 TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (profile_hash, game_date, target_key)
      )`,
      `CREATE TABLE IF NOT EXISTS daily_hunt_image_cache (
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

function recognitionSchema() {
  return {
    type: "object",
    additionalProperties: false,
    properties: {
      page_type: { type: "string", enum: ["hunt_bill", "unknown"] },
      confidence: { type: "number", minimum: 0, maximum: 1 },
      bill_label: { type: ["string", "null"] },
      expansion_label: { type: ["string", "null"] },
      targets: {
        type: "array",
        maxItems: 15,
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            mob_name: { type: "string" },
            area_name: { type: ["string", "null"] },
            required_count: { type: "integer", minimum: 1, maximum: 20 },
            progress_current: { type: ["integer", "null"], minimum: 0, maximum: 20 },
            exp_reward: { type: ["integer", "null"], minimum: 0 },
            currency_reward: { type: ["integer", "null"], minimum: 0 },
            confidence: { type: "number", minimum: 0, maximum: 1 }
          },
          required: ["mob_name", "area_name", "required_count", "progress_current", "exp_reward", "currency_reward", "confidence"]
        }
      }
    },
    required: ["page_type", "confidence", "bill_label", "expansion_label", "targets"]
  };
}

function sanitizeAnalysis(parsed, model) {
  const pageType = parsed?.page_type === "hunt_bill" ? "hunt_bill" : "unknown";
  const targets = (Array.isArray(parsed?.targets) ? parsed.targets : [])
    .slice(0, 15)
    .map(target => ({
      mob_name: cleanText(target?.mob_name, 120),
      area_name: target?.area_name == null ? null : cleanText(target.area_name, 120),
      required_count: positiveInt(target?.required_count, 1),
      progress_current: nullableInt(target?.progress_current),
      exp_reward: nullableInt(target?.exp_reward),
      currency_reward: nullableInt(target?.currency_reward),
      confidence: clampConfidence(target?.confidence)
    }))
    .filter(target => target.mob_name && target.confidence >= 0.55);
  return {
    page_type: pageType,
    confidence: clampConfidence(parsed?.confidence),
    bill_label: parsed?.bill_label == null ? null : cleanText(parsed.bill_label, 120),
    expansion_label: parsed?.expansion_label == null ? null : cleanText(parsed.expansion_label, 80),
    targets,
    model
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
    "FINAL FANTASY XIV日本語クライアントの『モブ手配書 / デイリーモブハント』画面を読み取ってください。",
    "画面に実際に見えている文字と数値だけを抽出し、ゲーム知識でモブ名・エリア・座標・報酬を推測してはいけません。",
    "モブ手配書ではない、または判読不能なら page_type=unknown にしてください。",
    "bill_label は画面に見える手配書名やランク名。見えなければnull。",
    "targets は見えている各討伐対象。mob_name、area_name、必要討伐数、現在進捗、EXP報酬、通貨/戦利品報酬を、明示されている場合だけ入れてください。",
    "required_count が読めない場合だけ1。progress_current、exp_reward、currency_reward は見えなければnull。",
    "日本語名は翻訳せず、画面表記をそのまま保持してください。"
  ].join("\n");

  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": env.GEMINI_API_KEY },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [
        { text: prompt },
        { inline_data: { mime_type: file.type, data: arrayBufferToBase64(bytes) } }
      ] }],
      generationConfig: {
        temperature: 0.1,
        responseMimeType: "application/json",
        responseJsonSchema: recognitionSchema()
      }
    })
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data?.error?.message || `Gemini HTTP ${response.status}`);
  const text = (data?.candidates?.[0]?.content?.parts || []).map(part => typeof part.text === "string" ? part.text : "").join("").trim();
  if (!text) throw new Error("モブ手配書の解析結果が返りませんでした。");
  let parsed;
  try { parsed = JSON.parse(text); }
  catch { throw new Error("モブ手配書の解析JSONを読み取れませんでした。"); }
  return sanitizeAnalysis(parsed, model);
}

function targetKey(target, billLabel) {
  return [cleanText(billLabel || "hunt", 80), cleanText(target.area_name || "unknown", 100), cleanText(target.mob_name, 120)].join("|");
}

async function cachedAnalysis(env, profileHash, imageSha) {
  const row = await env.DB.prepare(`SELECT analysis_json FROM daily_hunt_image_cache WHERE profile_hash=? AND image_sha256=? LIMIT 1`)
    .bind(profileHash, imageSha).first();
  if (!row?.analysis_json) return null;
  try { return JSON.parse(row.analysis_json); }
  catch { return null; }
}

async function cacheAnalysis(env, profileHash, imageSha, analysis) {
  await env.DB.prepare(`
    INSERT INTO daily_hunt_image_cache (profile_hash, image_sha256, analysis_json, observed_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(profile_hash, image_sha256) DO UPDATE SET analysis_json=excluded.analysis_json, observed_at=excluded.observed_at
  `).bind(profileHash, imageSha, JSON.stringify(analysis), new Date().toISOString()).run();
}

async function upsertAnalysis(env, profileHash, imageSha, analysis) {
  if (analysis.page_type !== "hunt_bill" || analysis.confidence < 0.6 || !analysis.targets.length) return 0;
  const date = japanDateKey();
  const now = new Date().toISOString();
  const bill = analysis.bill_label || analysis.expansion_label || "モブ手配書";
  let count = 0;
  for (const target of analysis.targets) {
    const key = targetKey(target, bill);
    const initialProgress = Math.min(target.required_count, Math.max(0, target.progress_current ?? 0));
    await env.DB.prepare(`
      INSERT INTO daily_hunt_targets (
        profile_hash, game_date, target_key, bill_label, mob_name, area_name,
        required_count, completed_count, exp_reward, currency_reward,
        source_confidence, verification_status, source_image_sha256, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'image_read', ?, ?, ?)
      ON CONFLICT(profile_hash, game_date, target_key) DO UPDATE SET
        bill_label=excluded.bill_label,
        mob_name=excluded.mob_name,
        area_name=excluded.area_name,
        required_count=excluded.required_count,
        completed_count=CASE
          WHEN daily_hunt_targets.completed_count > excluded.required_count THEN excluded.required_count
          ELSE daily_hunt_targets.completed_count
        END,
        exp_reward=COALESCE(excluded.exp_reward, daily_hunt_targets.exp_reward),
        currency_reward=COALESCE(excluded.currency_reward, daily_hunt_targets.currency_reward),
        source_confidence=excluded.source_confidence,
        source_image_sha256=excluded.source_image_sha256,
        updated_at=excluded.updated_at
    `).bind(
      profileHash, date, key, bill, target.mob_name, target.area_name,
      target.required_count, initialProgress, target.exp_reward, target.currency_reward,
      target.confidence, imageSha, now, now
    ).run();
    count += 1;
  }
  return count;
}

function summarizeRows(rows, date = japanDateKey()) {
  const targets = (Array.isArray(rows) ? rows : []).map(row => ({
    target_key: row.target_key,
    bill_label: row.bill_label || "モブ手配書",
    mob_name: row.mob_name,
    area_name: row.area_name || "エリア未読取",
    required_count: positiveInt(row.required_count, 1),
    completed_count: Math.max(0, Number(row.completed_count) || 0),
    exp_reward: nullableInt(row.exp_reward),
    currency_reward: nullableInt(row.currency_reward),
    verification_status: row.verification_status || "image_read",
    confidence: clampConfidence(row.source_confidence)
  }));
  const total = targets.reduce((sum, target) => sum + target.required_count, 0);
  const completed = targets.reduce((sum, target) => sum + Math.min(target.required_count, target.completed_count), 0);
  const remaining = Math.max(0, total - completed);
  const areaSet = new Set(targets.filter(target => target.completed_count < target.required_count).map(target => target.area_name));
  const totalExp = targets.reduce((sum, target) => sum + (target.exp_reward || 0), 0);
  const totalCurrency = targets.reduce((sum, target) => sum + (target.currency_reward || 0), 0);
  const groupsMap = new Map();
  for (const target of targets) {
    const key = target.area_name;
    if (!groupsMap.has(key)) groupsMap.set(key, []);
    groupsMap.get(key).push(target);
  }
  const groups = [...groupsMap.entries()].map(([area_name, items]) => ({
    area_name,
    completed_count: items.reduce((sum, target) => sum + Math.min(target.required_count, target.completed_count), 0),
    required_count: items.reduce((sum, target) => sum + target.required_count, 0),
    targets: items
  }));
  return {
    game_date: date,
    total_targets: targets.length,
    total_count: total,
    completed_count: completed,
    remaining_count: remaining,
    remaining_areas: areaSet.size,
    total_exp_reward: totalExp || null,
    total_currency_reward: totalCurrency || null,
    estimated_minutes: remaining ? Math.max(8, Math.round(areaSet.size * 3 + remaining * 0.7)) : 0,
    complete: total > 0 && remaining === 0,
    groups,
    targets
  };
}

export async function getTodayHunts(env, profileHash) {
  await ensureSchema(env);
  const date = japanDateKey();
  const result = await env.DB.prepare(`
    SELECT target_key, bill_label, mob_name, area_name, required_count, completed_count,
           exp_reward, currency_reward, source_confidence, verification_status
    FROM daily_hunt_targets
    WHERE profile_hash=? AND game_date=?
    ORDER BY COALESCE(area_name, ''), mob_name
  `).bind(profileHash, date).all();
  return summarizeRows(result?.results || [], date);
}

export async function recognizeHuntImage(request, env) {
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
  if (!(file instanceof File)) {
    const error = new Error("モブ手配書の画像がありません。");
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
  let analysis = await cachedAnalysis(env, profileHash, imageSha);
  const duplicate = Boolean(analysis);
  if (!analysis) {
    analysis = await analyzeWithGemini(env, file, bytes);
    await cacheAnalysis(env, profileHash, imageSha, analysis);
  }
  const savedCount = await upsertAnalysis(env, profileHash, imageSha, analysis);
  return {
    ok: true,
    duplicate,
    analysis,
    saved_count: savedCount,
    today: await getTodayHunts(env, profileHash)
  };
}

export async function updateHuntProgress(request, env) {
  const profileHash = await profileHashFromRequest(request);
  await ensureSchema(env);
  let body;
  try { body = await request.json(); }
  catch { body = {}; }
  const key = cleanText(body?.target_key, 360);
  const delta = Number(body?.delta);
  if (!key || ![-1, 1].includes(delta)) {
    const error = new Error("target_key と delta(+1/-1) が必要です。");
    error.status = 400;
    throw error;
  }
  const date = japanDateKey();
  await env.DB.prepare(`
    UPDATE daily_hunt_targets
    SET completed_count = MIN(required_count, MAX(0, completed_count + ?)), updated_at=?
    WHERE profile_hash=? AND game_date=? AND target_key=?
  `).bind(delta, new Date().toISOString(), profileHash, date, key).run();
  return { ok: true, today: await getTodayHunts(env, profileHash) };
}

export async function completeAllHunts(request, env) {
  const profileHash = await profileHashFromRequest(request);
  await ensureSchema(env);
  const date = japanDateKey();
  await env.DB.prepare(`
    UPDATE daily_hunt_targets SET completed_count=required_count, updated_at=?
    WHERE profile_hash=? AND game_date=?
  `).bind(new Date().toISOString(), profileHash, date).run();
  return { ok: true, today: await getTodayHunts(env, profileHash) };
}

function huntMethod(summary, plan) {
  const focus = plan?.focus_job || null;
  const expText = summary.total_exp_reward ? ` 画面で確認できたEXP合計は${Number(summary.total_exp_reward).toLocaleString("ja-JP")}。` : "";
  return {
    task_key: `hunt:daily:${summary.game_date}`,
    daily_key: null,
    badge: "デイリー・モブハント",
    title: `モブ手配書をまとめて回る（残り${summary.remaining_count}/${summary.total_count}体）`,
    minutes: summary.estimated_minutes,
    reason: `今日登録した手配書は残り${summary.remaining_count}体・${summary.remaining_areas}エリア。別画面の「今日のモブハント」で進捗を付けながらまとめて消化できます。${expText}`,
    condition: "目的：手配書スクショから確認できた対象だけをまとめて消化する。未読取の座標や攻略情報は推測しません。",
    steps: [
      "ページ内の「今日のモブハント」セクションを開く",
      "同じエリアの対象をまとめて討伐し、+1討伐で進捗を付ける",
      "残り0体になったら完了"
    ],
    source_kind: "hunt_daily",
    efficiency_source: "daily_hunt_bill",
    job_code: focus?.code || null,
    job_name: focus?.name || null,
    job_level: focus?.level || null,
    job_role: focus?.role || null
  };
}

export async function augmentPlanWithHunts(request, response, env) {
  if (!response.ok || !(response.headers.get("content-type") || "").includes("application/json")) return response;
  let data;
  try { data = await response.clone().json(); }
  catch { return response; }
  if (!data?.plan || data.plan.selected_mode !== "efficient" || data.plan.session_complete) return response;
  let profileHash;
  try { profileHash = await profileHashFromRequest(request); }
  catch { return response; }
  const summary = await getTodayHunts(env, profileHash);
  if (!summary.remaining_count) return response;
  const hunt = huntMethod(summary, data.plan);
  const existing = Array.isArray(data.plan.methods) ? data.plan.methods.filter(method => method?.source_kind !== "hunt_daily") : [];
  const methods = existing.length ? [existing[0], hunt, ...existing.slice(1)].slice(0, 3) : [hunt];
  const plan = {
    ...data.plan,
    methods: methods.map((method, index) => ({ ...method, rank: index + 1 })),
    hunt_daily_available: true,
    hunt_daily_summary: summary
  };
  return json({ ...data, plan }, response.status);
}

export function errorResponse(error) {
  return json({ ok: false, error: error?.message || "モブハント処理に失敗しました。" }, Number(error?.status) || 500);
}

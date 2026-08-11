const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash";
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
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

function normalizeKey(value) {
  return normalizeText(value, 300).normalize("NFKC").toLocaleLowerCase("ja-JP");
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
    `)
  ]);
}

function sanitizeOverviewRows(rows) {
  return (Array.isArray(rows) ? rows : [])
    .slice(0, 20)
    .map(row => ({
      retainer_name: normalizeText(row?.retainer_name, 100),
      job_name: normalizeText(row?.job_name, 80),
      level: nullableInt(row?.level),
      confidence: clampConfidence(row?.confidence)
    }))
    .filter(row => row.job_name && row.level !== null && row.confidence >= 0.6);
}

function sanitizeVentures(rows) {
  return (Array.isArray(rows) ? rows : [])
    .slice(0, 30)
    .map(entry => ({
      item_name: normalizeText(entry?.item_name, 160),
      quantity: nullableInt(entry?.quantity),
      venture_level: nullableInt(entry?.venture_level),
      duration_minutes: nullableInt(entry?.duration_minutes),
      confidence: clampConfidence(entry?.confidence)
    }))
    .filter(entry => entry.item_name && entry.confidence >= 0.65);
}

export function sanitizeRetainerWorkflowAnalysis(parsed, model = "test") {
  const screenType = ["venture_item_list", "retainer_overview", "other"].includes(parsed?.screen_type)
    ? parsed.screen_type
    : "other";
  const overview = sanitizeOverviewRows(parsed?.retainers);
  const ventures = sanitizeVentures(parsed?.ventures);

  if (screenType === "retainer_overview" && overview.length) {
    return {
      page_type: "retainer_overview",
      confidence: clampConfidence(parsed?.confidence),
      model,
      retainer_overview: { retainers: overview },
      retainer_ventures: null,
      journal_entries: [],
      crafter_stats: null,
      gatherer_stats: null
    };
  }

  if (screenType === "venture_item_list" && ventures.length) {
    return {
      page_type: "retainer_ventures",
      confidence: clampConfidence(parsed?.confidence),
      model,
      retainer_overview: null,
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

  return {
    page_type: "unknown",
    confidence: clampConfidence(parsed?.confidence),
    model,
    retainer_overview: null,
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
    "FINAL FANTASY XIV日本語クライアントのリテイナー画面を分類し、JSONだけ返してください。",
    "最優先で読みたいのは retainer_overview: 複数リテイナーが並び、それぞれの名前・クラス/ジョブ・Lvが見える一覧/選択画面です。",
    "この一覧だけで十分です。アイテム候補ページを何枚も読む必要はありません。",
    "screen_type は retainer_overview / venture_item_list / other のどれか。",
    "retainer_overview の場合 retainers に画面で読める各行を入れる。retainer_name, job_name, level, confidence。見えない値は推測しない。",
    "venture_item_list は互換用。1人の調達依頼アイテム一覧なら ventures に表示中の行だけ入れる。",
    "other は上記以外。",
    "返却形: {\"screen_type\":\"retainer_overview\",\"confidence\":0.0,\"retainers\":[{\"retainer_name\":\"\",\"job_name\":\"\",\"level\":0,\"confidence\":0.0}],\"retainer_name\":null,\"job_name\":null,\"level\":null,\"ventures\":[]}",
    "ゲーム知識でジョブ名やLvを補完しない。画面に見える事実だけ。"
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
          responseMimeType: "application/json"
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

function subjectKey(retainer, index = 0) {
  const name = normalizeKey(retainer?.retainer_name);
  if (name) return `name:${name}`;
  return `overview:${index}:job:${normalizeKey(retainer?.job_name) || "unknown"}:lv:${nullableInt(retainer?.level) ?? "unknown"}`;
}

async function storeOverview(env, profileHash, analysis) {
  const rows = analysis?.retainer_overview?.retainers || [];
  if (analysis?.page_type !== "retainer_overview" || !rows.length || analysis.confidence < 0.5) return false;
  const now = new Date().toISOString();
  await env.DB.prepare(`DELETE FROM retainer_venture_context WHERE profile_hash=? AND source='retainer_overview'`).bind(profileHash).run();
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    const payload = {
      retainer_name: row.retainer_name || null,
      job_name: row.job_name || null,
      level: row.level,
      ventures: [],
      model: analysis.model,
      candidate_source: "level_band"
    };
    await env.DB.prepare(`
      INSERT INTO retainer_venture_context (
        profile_hash, subject_key, payload_json, confidence, observed_at, source
      ) VALUES (?, ?, ?, ?, ?, 'retainer_overview')
      ON CONFLICT(profile_hash, subject_key) DO UPDATE SET
        payload_json=excluded.payload_json,
        confidence=excluded.confidence,
        observed_at=excluded.observed_at,
        source=excluded.source
    `).bind(profileHash, subjectKey(row, index), JSON.stringify(payload), row.confidence, now).run();
  }
  return true;
}

async function storeVentureList(env, profileHash, analysis) {
  if (analysis?.page_type !== "retainer_ventures" || analysis.confidence < 0.6) return false;
  const incoming = analysis.retainer_ventures;
  const key = subjectKey(incoming, 0);
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
    model: analysis.model,
    candidate_source: "visible_rows"
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
  const duplicate = Boolean(analysis);
  if (!analysis) {
    analysis = await analyze(file, bytes, env);
    await cache(env, profileHash, imageSha, analysis);
  }

  const saved = analysis.page_type === "retainer_overview"
    ? await storeOverview(env, profileHash, analysis)
    : await storeVentureList(env, profileHash, analysis);
  const expectedScreen = "リテイナー一覧（複数リテイナーの名前・ジョブ/クラス・Lvが見える画面）";
  const count = analysis?.retainer_overview?.retainers?.length || 0;
  return json({
    ok: true,
    duplicate,
    analysis,
    context_saved: saved,
    retainer_context_saved: saved,
    image_saved: false,
    expected_screen: expectedScreen,
    message: analysis.page_type === "retainer_overview"
      ? `リテイナー一覧から${count}人のジョブ/クラスとLvを保存しました。各Lv帯で派遣可能な調達品をXIVAPIから絞り、市場比較を更新します。`
      : analysis.page_type === "retainer_ventures"
        ? "表示中の調達依頼も保存しました。次回からはリテイナー一覧1枚だけでLv帯から候補を作れます。"
        : `この画像ではリテイナーのジョブ/クラスとLvを確認できませんでした。${expectedScreen}を貼ってください。`
  });
}
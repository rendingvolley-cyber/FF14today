import app from "./gc-supply-duty-entry.js";

const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash";
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
const VALID_JOB_CODES = new Set([
  "GLA","PGL","MRD","LNC","ARC","CNJ","THM","ACN","ROG",
  "PLD","MNK","WAR","DRG","BRD","WHM","BLM","SMN","SCH","NIN","MCH","DRK","AST","SAM","RDM","GNB","DNC","RPR","SGE","VPR","PCT",
  "MIN","BTN","FSH"
]);

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

function normalizeText(value, max = 160) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

function clampConfidence(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0;
}

function nullableInt(value) {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 && n <= 100 ? n : null;
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

async function profileHashFromRequest(request) {
  const token = request.headers.get("x-profile-token") || "";
  if (!/^[A-Za-z0-9_-]{43,128}$/.test(token)) return null;
  return sha256Hex(token);
}

async function retainerForm(request) {
  try {
    const form = await request.clone().formData();
    if (String(form.get("workflow_context") || "").trim() !== "retainer") return null;
    const file = form.get("image");
    if (!(file instanceof File)) return null;
    if (!ALLOWED_IMAGE_TYPES.has(file.type) || file.size <= 0 || file.size > MAX_IMAGE_BYTES) return null;
    return { file, bytes: await file.arrayBuffer() };
  } catch {
    return null;
  }
}

function sanitizeRows(parsed) {
  return (Array.isArray(parsed?.retainers) ? parsed.retainers : [])
    .slice(0, 20)
    .map(row => {
      const code = normalizeText(row?.job_code, 8).toUpperCase();
      return {
        retainer_name: normalizeText(row?.retainer_name, 100),
        job_name: VALID_JOB_CODES.has(code) ? code : "",
        level: nullableInt(row?.level),
        confidence: clampConfidence(row?.confidence)
      };
    })
    .filter(row => row.retainer_name && row.job_name && row.level !== null && row.confidence >= 0.55);
}

async function analyzeIconOverview(env, file, bytes) {
  if (!env.GEMINI_API_KEY) return null;
  const model = env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL;
  const prompt = [
    "FINAL FANTASY XIVのリテイナー一覧画面を解析してください。JSONだけ返してください。",
    "対象画面はリテイナー呼び出し時の一覧で、Name / Class・Job / Item / Gil / Market / Venture の列があります。",
    "重要: 実際のClass/Job列はジョブ名の文字ではなく『ジョブ/クラスのアイコン + レベル数字』だけで表示される場合があります。これは正しい対象画面です。",
    "Class/Jobのアイコンそのものを視覚的に識別して、job_code を3文字コードで返してください。アイコン認識は許可され、ここでは必須です。名前や所持品など別の列からジョブを推測してはいけません。",
    "job_code は GLA,PGL,MRD,LNC,ARC,CNJ,THM,ACN,ROG,PLD,MNK,WAR,DRG,BRD,WHM,BLM,SMN,SCH,NIN,MCH,DRK,AST,SAM,RDM,GNB,DNC,RPR,SGE,VPR,PCT,MIN,BTN,FSH のいずれか。",
    "各行について retainer_name, job_code, level, confidence を返してください。行が暗く表示されていても文字とアイコンが読めるなら含めます。",
    "アイコンを判別できない行はjob_codeを空文字にし、confidenceを下げてください。",
    "返却形: {\"screen_type\":\"retainer_overview\",\"confidence\":0.0,\"retainers\":[{\"retainer_name\":\"\",\"job_code\":\"\",\"level\":80,\"confidence\":0.0}]}"
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
        contents: [{ role: "user", parts: [
          { text: prompt },
          { inline_data: { mime_type: file.type, data: arrayBufferToBase64(bytes) } }
        ] }],
        generationConfig: { temperature: 0.05, responseMimeType: "application/json" }
      })
    }
  );
  if (!response.ok) return null;
  let data;
  try { data = await response.json(); } catch { return null; }
  const text = (data?.candidates?.[0]?.content?.parts || [])
    .map(part => typeof part.text === "string" ? part.text : "")
    .join("")
    .trim();
  if (!text) return null;
  let parsed;
  try { parsed = JSON.parse(text); } catch { return null; }
  const rows = sanitizeRows(parsed);
  if (parsed?.screen_type !== "retainer_overview" || !rows.length) return null;
  return {
    page_type: "retainer_overview",
    confidence: clampConfidence(parsed?.confidence),
    model,
    retainer_overview: { retainers: rows },
    retainer_ventures: null,
    journal_entries: [],
    crafter_stats: null,
    gatherer_stats: null
  };
}

async function saveOverview(env, request, bytes, analysis) {
  const profileHash = await profileHashFromRequest(request);
  if (!profileHash || !analysis?.retainer_overview?.retainers?.length) return false;
  const now = new Date().toISOString();
  try {
    await env.DB.prepare(`DELETE FROM retainer_venture_context WHERE profile_hash=? AND source='retainer_overview'`).bind(profileHash).run();
    for (let index = 0; index < analysis.retainer_overview.retainers.length; index += 1) {
      const row = analysis.retainer_overview.retainers[index];
      const subjectKey = row.retainer_name
        ? `name:${row.retainer_name.normalize("NFKC").toLocaleLowerCase("ja-JP")}`
        : `overview:${index}:job:${row.job_name}:lv:${row.level}`;
      const payload = {
        retainer_name: row.retainer_name || null,
        job_name: row.job_name,
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
      `).bind(profileHash, subjectKey, JSON.stringify(payload), row.confidence, now).run();
    }
    const imageSha = await sha256Hex(bytes);
    await env.DB.prepare(`
      INSERT INTO retainer_workflow_image_cache (profile_hash, image_sha256, analysis_json, observed_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(profile_hash, image_sha256) DO UPDATE SET
        analysis_json=excluded.analysis_json,
        observed_at=excluded.observed_at
    `).bind(profileHash, imageSha, JSON.stringify(analysis), now).run();
    return true;
  } catch {
    return false;
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname !== "/api/context/image" || request.method !== "POST") {
      return app.fetch(request, env);
    }

    const input = await retainerForm(request);
    if (!input) return app.fetch(request, env);

    const response = await app.fetch(request, env);
    if (!response.ok || !(response.headers.get("content-type") || "").includes("application/json")) return response;
    let data;
    try { data = await response.clone().json(); } catch { return response; }
    if (data?.analysis?.page_type === "retainer_overview" && data?.analysis?.retainer_overview?.retainers?.length) return response;

    const analysis = await analyzeIconOverview(env, input.file, input.bytes);
    if (!analysis) return response;
    const saved = await saveOverview(env, request, input.bytes, analysis);
    const count = analysis.retainer_overview.retainers.length;
    return json({
      ...data,
      ok: true,
      duplicate: false,
      analysis,
      context_saved: saved,
      retainer_context_saved: saved,
      image_saved: false,
      expected_screen: "リテイナー一覧（Name / Class・Job / Item / Gil / Market / Venture が見える画面）",
      message: `リテイナー一覧から${count}人のジョブアイコンとLvを認識して保存しました。Lv帯から派遣候補を更新します。`
    }, response.status);
  }
};

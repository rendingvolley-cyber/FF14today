import app from "./grounded-discovery-wrapper.js";

const WORLD = "Chocobo";
const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash";
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const CONTEXT_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const ITEM_CACHE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
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

async function ensureSchema(env) {
  if (!schemaReady) {
    schemaReady = env.DB.batch([
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
        CREATE TABLE IF NOT EXISTS retainer_item_resolution_cache (
          item_name_key TEXT PRIMARY KEY,
          item_name TEXT NOT NULL,
          item_id INTEGER,
          canonical_name TEXT,
          resolved_at TEXT NOT NULL
        )
      `),
      env.DB.prepare(`
        CREATE INDEX IF NOT EXISTS idx_retainer_context_profile_time
        ON retainer_venture_context(profile_hash, observed_at DESC)
      `)
    ]).catch(error => {
      schemaReady = null;
      throw error;
    });
  }
  return schemaReady;
}

function retainerSchema() {
  return {
    type: "object",
    additionalProperties: false,
    properties: {
      recognized: { type: "boolean" },
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
    required: ["recognized", "confidence", "retainer_name", "job_name", "level", "ventures"]
  };
}

function sanitizeRetainerAnalysis(parsed, model) {
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
  const recognized = Boolean(parsed?.recognized) && ventures.length > 0;
  return {
    page_type: recognized ? "retainer_ventures" : "unknown",
    confidence: clampConfidence(parsed?.confidence),
    model,
    retainer_ventures: recognized ? {
      retainer_name: parsed?.retainer_name == null ? null : normalizeText(parsed.retainer_name, 100),
      job_name: parsed?.job_name == null ? null : normalizeText(parsed.job_name, 80),
      level: nullableInt(parsed?.level),
      ventures
    } : null,
    journal_entries: [],
    crafter_stats: null,
    gatherer_stats: null
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

async function analyzeRetainerImage(file, bytes, env) {
  if (!env.GEMINI_API_KEY) return null;
  const model = env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL;
  const prompt = [
    "FINAL FANTASY XIV日本語クライアントのスクリーンショットが、リテイナーベンチャーの『調達依頼』候補一覧か判定してください。",
    "調達依頼の候補一覧でなければ recognized=false、ventures=[]。",
    "画面に見える事実だけ抽出し、ゲーム知識から候補や数量を補完しないでください。",
    "retainer_name=画面に見えるリテイナー名、job_name=リテイナーのクラス/ジョブ、level=レベル。見えなければnull。",
    "venturesには画面に見えている調達可能アイテムだけを上から入れます。item_nameは日本語表示名をそのまま。",
    "quantity、venture_level、duration_minutesはその行に明示されている時だけ数字を入れ、見えなければnull。",
    "メニュー名、カテゴリ名、通貨、所持品、出品物をventuresに混ぜないでください。",
    "推測禁止。文字が怪しい行はconfidenceを下げてください。"
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
          responseJsonSchema: retainerSchema()
        }
      })
    }
  );
  const data = await response.json();
  if (!response.ok) return null;
  const text = (data?.candidates?.[0]?.content?.parts || [])
    .map(part => typeof part.text === "string" ? part.text : "")
    .join("")
    .trim();
  if (!text) return null;
  let parsed;
  try { parsed = JSON.parse(text); }
  catch { return null; }
  return sanitizeRetainerAnalysis(parsed, model);
}

function subjectKey(retainer) {
  const name = normalizeKey(retainer?.retainer_name);
  if (name) return `name:${name}`;
  const job = normalizeKey(retainer?.job_name) || "unknown";
  const level = nullableInt(retainer?.level) ?? "unknown";
  return `job:${job}:lv:${level}`;
}

function mergeVentures(existing, incoming) {
  const map = new Map();
  for (const entry of [...(existing || []), ...(incoming || [])]) {
    const key = normalizeKey(entry?.item_name);
    if (!key) continue;
    const previous = map.get(key);
    map.set(key, previous ? {
      ...previous,
      ...entry,
      quantity: entry.quantity ?? previous.quantity ?? null,
      venture_level: entry.venture_level ?? previous.venture_level ?? null,
      duration_minutes: entry.duration_minutes ?? previous.duration_minutes ?? null,
      confidence: Math.max(Number(previous.confidence || 0), Number(entry.confidence || 0))
    } : entry);
  }
  return [...map.values()].slice(0, 100);
}

async function storeRetainerContext(env, profileHash, analysis) {
  if (!profileHash || analysis?.page_type !== "retainer_ventures" || analysis.confidence < 0.6) return false;
  await ensureSchema(env);
  const incoming = analysis.retainer_ventures;
  const key = subjectKey(incoming);
  const row = await env.DB.prepare(`
    SELECT payload_json FROM retainer_venture_context
    WHERE profile_hash=? AND subject_key=?
    LIMIT 1
  `).bind(profileHash, key).first();
  let previous = null;
  try { previous = row?.payload_json ? JSON.parse(row.payload_json) : null; }
  catch { previous = null; }
  const merged = {
    retainer_name: incoming.retainer_name || previous?.retainer_name || null,
    job_name: incoming.job_name || previous?.job_name || null,
    level: incoming.level ?? previous?.level ?? null,
    ventures: mergeVentures(previous?.ventures, incoming.ventures),
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
  `).bind(profileHash, key, JSON.stringify(merged), analysis.confidence, new Date().toISOString()).run();
  return true;
}

async function fallbackRetainerImage(request, response, env) {
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
  const analysis = await analyzeRetainerImage(file, bytes, env);
  if (!analysis || analysis.page_type !== "retainer_ventures") return response;
  const saved = await storeRetainerContext(env, profileHash, analysis);
  return json({
    ...data,
    duplicate: false,
    analysis,
    context_saved: saved,
    retainer_context_saved: saved,
    image_saved: false
  }, response.status);
}

async function getRetainerContexts(env, profileHash) {
  await ensureSchema(env);
  const cutoff = new Date(Date.now() - CONTEXT_MAX_AGE_MS).toISOString();
  const result = await env.DB.prepare(`
    SELECT subject_key, payload_json, confidence, observed_at
    FROM retainer_venture_context
    WHERE profile_hash=? AND observed_at>=?
    ORDER BY observed_at DESC
    LIMIT 20
  `).bind(profileHash, cutoff).all();
  const contexts = [];
  for (const row of result.results || []) {
    try {
      contexts.push({
        subject_key: row.subject_key,
        ...JSON.parse(row.payload_json),
        confidence: Number(row.confidence || 0),
        observed_at: row.observed_at
      });
    } catch {}
  }
  return contexts;
}

function escapeQueryString(value) {
  return String(value || "").replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

async function resolveItemId(env, itemName) {
  await ensureSchema(env);
  const key = normalizeKey(itemName);
  if (!key) return null;
  const cached = await env.DB.prepare(`
    SELECT item_id, canonical_name, resolved_at
    FROM retainer_item_resolution_cache
    WHERE item_name_key=?
    LIMIT 1
  `).bind(key).first();
  if (cached?.resolved_at) {
    const age = Date.now() - new Date(cached.resolved_at).getTime();
    if (Number.isFinite(age) && age < ITEM_CACHE_MAX_AGE_MS) {
      return cached.item_id ? {
        item_id: Number(cached.item_id),
        canonical_name: cached.canonical_name || itemName
      } : null;
    }
  }

  const url = new URL("https://v2.xivapi.com/api/search");
  url.searchParams.set("sheets", "Item");
  url.searchParams.set("fields", "Name");
  url.searchParams.set("language", "ja");
  url.searchParams.set("query", `Name=\"${escapeQueryString(itemName)}\"`);
  url.searchParams.set("limit", "5");
  let item = null;
  try {
    const response = await fetch(url.toString(), { headers: { "user-agent": "FF14Today/1.6" } });
    if (response.ok) {
      const data = await response.json();
      const exact = (data?.results || []).find(result => normalizeKey(result?.fields?.Name) === key);
      if (exact) item = { item_id: Number(exact.row_id), canonical_name: exact.fields.Name || itemName };
    }
  } catch {}
  await env.DB.prepare(`
    INSERT INTO retainer_item_resolution_cache (item_name_key, item_name, item_id, canonical_name, resolved_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(item_name_key) DO UPDATE SET
      item_name=excluded.item_name,
      item_id=excluded.item_id,
      canonical_name=excluded.canonical_name,
      resolved_at=excluded.resolved_at
  `).bind(key, itemName, item?.item_id || null, item?.canonical_name || null, new Date().toISOString()).run();
  return item;
}

async function resolveVentureItems(env, contexts) {
  const byName = new Map();
  for (const context of contexts) {
    for (const venture of context.ventures || []) {
      const key = normalizeKey(venture.item_name);
      if (!key || byName.has(key)) continue;
      byName.set(key, { venture, context });
    }
  }
  const entries = [...byName.entries()].slice(0, 60);
  const resolved = [];
  const batchSize = 8;
  for (let i = 0; i < entries.length; i += batchSize) {
    const batch = entries.slice(i, i + batchSize);
    const values = await Promise.all(batch.map(async ([, value]) => ({
      ...value,
      item: await resolveItemId(env, value.venture.item_name)
    })));
    resolved.push(...values.filter(value => value.item?.item_id));
  }
  return resolved;
}

function currentItemMap(data) {
  if (data?.items && typeof data.items === "object") return data.items;
  if (data?.itemID) return { [String(data.itemID)]: data };
  return {};
}

function worldMetric(result, field, metric) {
  const value = result?.nq?.[field]?.world?.[metric];
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function scarcityPoints(daysSupply, listingRows) {
  if (listingRows >= 100) return 0;
  if (!Number.isFinite(daysSupply)) return 0;
  if (daysSupply <= 0.5) return 45;
  if (daysSupply <= 1) return 40;
  if (daysSupply <= 2) return 34;
  if (daysSupply <= 3) return 26;
  if (daysSupply <= 5) return 14;
  return 3;
}

function demandPoints(velocity) {
  if (velocity <= 0) return 0;
  return Math.min(35, Math.log1p(velocity) * 10.5);
}

function valuePoints(avgPrice, quantity) {
  const gross = avgPrice * Math.max(1, Number(quantity) || 1);
  if (gross <= 0) return 0;
  return Math.min(20, Math.log10(gross + 1) * 4);
}

function round1(value) {
  return Math.round(Number(value || 0) * 10) / 10;
}

function marketAgeMinutes(current) {
  const timestamp = Number(current?.lastUploadTime || 0);
  if (!timestamp) return null;
  const minutes = Math.max(0, Math.round((Date.now() - timestamp) / 60000));
  return Number.isFinite(minutes) ? minutes : null;
}

async function marketRecommendations(env, resolved) {
  if (!resolved.length) return [];
  const ids = [...new Set(resolved.map(value => value.item.item_id))].slice(0, 100);
  const idText = ids.join(",");
  const headers = { "user-agent": "FF14Today/1.6" };
  const [aggregatedResponse, currentResponse] = await Promise.all([
    fetch(`https://universalis.app/api/v2/aggregated/${encodeURIComponent(WORLD)}/${idText}`, { headers }),
    fetch(`https://universalis.app/api/v2/${encodeURIComponent(WORLD)}/${idText}?listings=100`, { headers })
  ]);
  if (!aggregatedResponse.ok || !currentResponse.ok) return [];
  const [aggregated, currentData] = await Promise.all([aggregatedResponse.json(), currentResponse.json()]);
  const aggregateMap = new Map((aggregated?.results || []).map(result => [Number(result.itemId), result]));
  const currentMap = currentItemMap(currentData);
  const rows = [];
  for (const value of resolved) {
    const itemId = value.item.item_id;
    const aggregate = aggregateMap.get(itemId);
    const current = currentMap[String(itemId)] || currentMap[itemId];
    if (!aggregate || !current) continue;
    const velocity = worldMetric(aggregate, "dailySaleVelocity", "quantity");
    const avgPrice = worldMetric(aggregate, "averageSalePrice", "price");
    const minPrice = worldMetric(aggregate, "minListing", "price");
    if (velocity < 0.5 || avgPrice <= 0) continue;
    const listings = Array.isArray(current.listings) ? current.listings : [];
    const listedQuantity = listings.reduce((sum, listing) => sum + Math.max(0, Number(listing?.quantity || 0)), 0);
    const daysSupply = velocity > 0 ? listedQuantity / velocity : Infinity;
    const score = scarcityPoints(daysSupply, listings.length)
      + demandPoints(velocity)
      + valuePoints(avgPrice, value.venture.quantity);
    rows.push({
      score: round1(score),
      item_id: itemId,
      item_name: value.item.canonical_name || value.venture.item_name,
      quantity_per_venture: value.venture.quantity,
      venture_level: value.venture.venture_level,
      duration_minutes: value.venture.duration_minutes,
      retainer_name: value.context.retainer_name,
      retainer_job: value.context.job_name,
      retainer_level: value.context.level,
      daily_sale_velocity: round1(velocity),
      listed_quantity: listedQuantity,
      listing_rows_sampled: listings.length,
      listing_sample_capped: listings.length >= 100,
      estimated_days_supply: Number.isFinite(daysSupply) ? round1(daysSupply) : null,
      average_sale_price: Math.round(avgPrice),
      minimum_listing_price: Math.round(minPrice),
      estimated_gross_per_venture: value.venture.quantity ? Math.round(avgPrice * value.venture.quantity) : null,
      market_age_minutes: marketAgeMinutes(current)
    });
  }
  return rows
    .sort((a, b) => b.score - a.score || b.daily_sale_velocity - a.daily_sale_velocity)
    .slice(0, 3)
    .map((row, index) => ({ ...row, rank: index + 1 }));
}

async function handleRecommendations(request, env) {
  const profileHash = await profileHashFromRequest(request);
  if (!profileHash) return json({ error: "プロフィールを確認できません。" }, 401);
  const contexts = await getRetainerContexts(env, profileHash);
  if (!contexts.length) {
    return json({
      ok: true,
      setup_required: true,
      world: WORLD,
      recommendations: [],
      message: "リテイナーの『調達依頼』候補一覧をスクショで貼ると、派遣可能素材を保存して市場比較します。"
    });
  }
  const resolved = await resolveVentureItems(env, contexts);
  let recommendations = [];
  try { recommendations = await marketRecommendations(env, resolved); }
  catch {}
  return json({
    ok: true,
    setup_required: false,
    world: WORLD,
    retainer_count: contexts.length,
    venture_items_seen: contexts.reduce((sum, context) => sum + (context.ventures?.length || 0), 0),
    resolved_items: resolved.length,
    recommendations,
    message: recommendations.length
      ? "需要・出品在庫・実売価格を比較した派遣候補です。"
      : "保存済み候補の中に、現在の市場データで十分な販売速度を確認できる素材がありませんでした。"
  });
}

function rewriteHtml(response) {
  if (!response.ok || !(response.headers.get("content-type") || "").includes("text/html")) return response;
  return new HTMLRewriter()
    .on("head", {
      element(element) {
        element.append('<link rel="stylesheet" href="/retainer-advice.css"><script src="/retainer-advice.js" type="module"></script>', { html: true });
      }
    })
    .on(".version", {
      element(element) {
        element.setInnerContent("v1.6 · RETAINER");
      }
    })
    .transform(response);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/api/context/image" && request.method === "POST") {
      const response = await app.fetch(request.clone(), env);
      return fallbackRetainerImage(request, response, env);
    }
    if (url.pathname === "/api/retainer/recommendations" && request.method === "GET") {
      return handleRecommendations(request, env);
    }
    const response = await app.fetch(request, env);
    if (url.pathname === "/api/health" && request.method === "GET" && response.ok) {
      let data;
      try { data = await response.clone().json(); }
      catch { return response; }
      return json({
        ...data,
        version: "1.6.0",
        retainer_market_advice: true,
        retainer_market_world: WORLD,
        retainer_market_source: "Universalis"
      }, response.status);
    }
    if (request.method === "GET" && (response.headers.get("content-type") || "").includes("text/html")) {
      return rewriteHtml(response);
    }
    return response;
  }
};

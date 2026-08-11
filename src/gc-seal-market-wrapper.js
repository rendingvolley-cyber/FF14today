import app from "./gc-misclassification-cleanup-wrapper.js";
import { GC_SEAL_MARKET_CANDIDATES, rankSealExchangeRows } from "./gc-seal-market.js";

const WORLD = "Chocobo";
const ITEM_CACHE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const MARKET_CACHE_MAX_AGE_MS = 10 * 60 * 1000;
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

function normalizeKey(value) {
  return String(value || "").normalize("NFKC").trim().toLowerCase();
}

function escapeQueryString(value) {
  return String(value || "").replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

async function ensureSchema(env) {
  if (!schemaReady) {
    schemaReady = env.DB.batch([
      env.DB.prepare(`
        CREATE TABLE IF NOT EXISTS gc_seal_exchange_item_cache (
          item_name_key TEXT PRIMARY KEY,
          item_name_en TEXT NOT NULL,
          item_id INTEGER,
          item_name_ja TEXT,
          resolved_at TEXT NOT NULL
        )
      `),
      env.DB.prepare(`
        CREATE TABLE IF NOT EXISTS gc_seal_market_cache (
          world TEXT PRIMARY KEY,
          payload_json TEXT NOT NULL,
          refreshed_at TEXT NOT NULL
        )
      `)
    ]).catch(error => {
      schemaReady = null;
      throw error;
    });
  }
  return schemaReady;
}

async function resolveCandidate(env, candidate) {
  await ensureSchema(env);
  const key = normalizeKey(candidate.name_en);
  const cached = await env.DB.prepare(`
    SELECT item_id, item_name_ja, resolved_at
    FROM gc_seal_exchange_item_cache
    WHERE item_name_key=?
    LIMIT 1
  `).bind(key).first();
  if (cached?.resolved_at) {
    const age = Date.now() - new Date(cached.resolved_at).getTime();
    if (Number.isFinite(age) && age < ITEM_CACHE_MAX_AGE_MS) {
      return cached.item_id ? {
        ...candidate,
        item_id: Number(cached.item_id),
        item_name_ja: cached.item_name_ja || candidate.name_en
      } : null;
    }
  }

  const url = new URL("https://v2.xivapi.com/api/search");
  url.searchParams.set("sheets", "Item");
  url.searchParams.set("fields", "Name,Name@lang(ja)");
  url.searchParams.set("language", "en");
  url.searchParams.set("query", `Name=\"${escapeQueryString(candidate.name_en)}\"`);
  url.searchParams.set("limit", "5");
  let resolved = null;
  try {
    const response = await fetch(url.toString(), { headers: { "user-agent": "FF14Today/1.9" } });
    if (response.ok) {
      const data = await response.json();
      const exact = (data?.results || []).find(result => normalizeKey(result?.fields?.Name) === key);
      if (exact) {
        resolved = {
          ...candidate,
          item_id: Number(exact.row_id),
          item_name_ja: exact.fields?.["Name@lang(ja)"] || exact.fields?.Name || candidate.name_en
        };
      }
    }
  } catch {}

  await env.DB.prepare(`
    INSERT INTO gc_seal_exchange_item_cache (item_name_key, item_name_en, item_id, item_name_ja, resolved_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(item_name_key) DO UPDATE SET
      item_name_en=excluded.item_name_en,
      item_id=excluded.item_id,
      item_name_ja=excluded.item_name_ja,
      resolved_at=excluded.resolved_at
  `).bind(key, candidate.name_en, resolved?.item_id || null, resolved?.item_name_ja || null, new Date().toISOString()).run();
  return resolved;
}

async function resolveCandidates(env) {
  const resolved = [];
  for (let i = 0; i < GC_SEAL_MARKET_CANDIDATES.length; i += 6) {
    const batch = GC_SEAL_MARKET_CANDIDATES.slice(i, i + 6);
    const values = await Promise.all(batch.map(candidate => resolveCandidate(env, candidate)));
    resolved.push(...values.filter(Boolean));
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

function marketAgeMinutes(current) {
  const timestamp = Number(current?.lastUploadTime || 0);
  if (!timestamp) return null;
  const minutes = Math.max(0, Math.round((Date.now() - timestamp) / 60000));
  return Number.isFinite(minutes) ? minutes : null;
}

async function fetchMarketRows(resolved) {
  if (!resolved.length) return [];
  const ids = [...new Set(resolved.map(item => item.item_id))];
  const idText = ids.join(",");
  const headers = { "user-agent": "FF14Today/1.9" };
  const [aggregatedResponse, currentResponse] = await Promise.all([
    fetch(`https://universalis.app/api/v2/aggregated/${encodeURIComponent(WORLD)}/${idText}`, { headers }),
    fetch(`https://universalis.app/api/v2/${encodeURIComponent(WORLD)}/${idText}?listings=100`, { headers })
  ]);
  if (!aggregatedResponse.ok || !currentResponse.ok) throw new Error("market data unavailable");
  const [aggregated, currentData] = await Promise.all([aggregatedResponse.json(), currentResponse.json()]);
  const aggregateMap = new Map((aggregated?.results || []).map(result => [Number(result.itemId), result]));
  const currentMap = currentItemMap(currentData);
  const rows = [];
  for (const candidate of resolved) {
    const aggregate = aggregateMap.get(candidate.item_id);
    const current = currentMap[String(candidate.item_id)] || currentMap[candidate.item_id];
    if (!aggregate || !current) continue;
    const dailySaleVelocity = worldMetric(aggregate, "dailySaleVelocity", "quantity");
    const averageSalePrice = worldMetric(aggregate, "averageSalePrice", "price");
    const minimumListingPrice = worldMetric(aggregate, "minListing", "price");
    const listings = Array.isArray(current.listings) ? current.listings : [];
    const listedQuantity = listings.reduce((sum, listing) => sum + Math.max(0, Number(listing?.quantity || 0)), 0);
    rows.push({
      item_id: candidate.item_id,
      item_name: candidate.item_name_ja,
      item_name_en: candidate.name_en,
      seal_cost: candidate.seal_cost,
      exchange_quantity: candidate.exchange_quantity,
      daily_sale_velocity: Math.round(dailySaleVelocity * 10) / 10,
      average_sale_price: Math.round(averageSalePrice),
      minimum_listing_price: Math.round(minimumListingPrice),
      listed_quantity: listedQuantity,
      listing_rows_sampled: listings.length,
      listing_sample_capped: listings.length >= 100,
      market_age_minutes: marketAgeMinutes(current)
    });
  }
  return rows;
}

async function readMarketCache(env) {
  await ensureSchema(env);
  const row = await env.DB.prepare(`
    SELECT payload_json, refreshed_at
    FROM gc_seal_market_cache
    WHERE world=?
    LIMIT 1
  `).bind(WORLD).first();
  if (!row?.payload_json) return null;
  let payload;
  try { payload = JSON.parse(row.payload_json); }
  catch { return null; }
  const ageMs = Date.now() - new Date(row.refreshed_at).getTime();
  return {
    payload,
    fresh: Number.isFinite(ageMs) && ageMs >= 0 && ageMs < MARKET_CACHE_MAX_AGE_MS,
    age_minutes: Number.isFinite(ageMs) ? Math.max(0, Math.round(ageMs / 60000)) : null
  };
}

async function writeMarketCache(env, payload) {
  await ensureSchema(env);
  await env.DB.prepare(`
    INSERT INTO gc_seal_market_cache (world, payload_json, refreshed_at)
    VALUES (?, ?, ?)
    ON CONFLICT(world) DO UPDATE SET
      payload_json=excluded.payload_json,
      refreshed_at=excluded.refreshed_at
  `).bind(WORLD, JSON.stringify(payload), new Date().toISOString()).run();
}

async function buildRecommendations(env) {
  const resolved = await resolveCandidates(env);
  const marketRows = await fetchMarketRows(resolved);
  const recommendations = rankSealExchangeRows(marketRows, 3);
  return {
    ok: true,
    world: WORLD,
    source: "Universalis",
    catalog_source: "Grand Company material exchange catalog",
    recommendations,
    candidate_count: GC_SEAL_MARKET_CANDIDATES.length,
    resolved_count: resolved.length,
    message: recommendations.length
      ? "軍票効率・実売数・現在の出品在庫を比較した交換候補です。"
      : "現在の市場データでは、十分に売れている交換候補を確認できませんでした。"
  };
}

async function handleRecommendations(env) {
  const cached = await readMarketCache(env);
  if (cached?.fresh) return json({ ...cached.payload, cached: true, cache_age_minutes: cached.age_minutes });
  try {
    const payload = await buildRecommendations(env);
    await writeMarketCache(env, payload);
    return json({ ...payload, cached: false, cache_age_minutes: 0 });
  } catch {
    if (cached?.payload) {
      return json({ ...cached.payload, cached: true, stale: true, cache_age_minutes: cached.age_minutes });
    }
    return json({
      ok: true,
      world: WORLD,
      source: "Universalis",
      recommendations: [],
      message: "マーケットデータを取得できませんでした。少し時間を置いて再確認してください。"
    });
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/api/grand-company/seal-exchange-recommendations" && request.method === "GET") {
      return handleRecommendations(env);
    }
    const response = await app.fetch(request, env);
    if (url.pathname === "/api/health" && request.method === "GET" && response.ok) {
      let data;
      try { data = await response.clone().json(); }
      catch { return response; }
      return json({
        ...data,
        gc_seal_market_advice: true,
        gc_seal_market_world: WORLD,
        gc_seal_market_source: "Universalis"
      }, response.status);
    }
    return response;
  }
};

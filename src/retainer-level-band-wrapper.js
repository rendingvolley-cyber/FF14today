import app from "./category-job-focus-wrapper.js";
import { fetchRetainerLevelBandCandidates, retainerJobCode } from "./retainer-level-band.js";

const WORLD = "Chocobo";
const CONTEXT_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

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
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, "0")).join("");
}

async function profileHashFromRequest(request) {
  const token = request.headers.get("x-profile-token") || "";
  if (!/^[A-Za-z0-9_-]{43,128}$/.test(token)) return null;
  return sha256Hex(token);
}

async function overviewContexts(env, profileHash) {
  const cutoff = new Date(Date.now() - CONTEXT_MAX_AGE_MS).toISOString();
  try {
    const result = await env.DB.prepare(`
      SELECT subject_key, payload_json, confidence, observed_at
      FROM retainer_venture_context
      WHERE profile_hash=? AND source='retainer_overview' AND observed_at>=?
      ORDER BY observed_at DESC
      LIMIT 20
    `).bind(profileHash, cutoff).all();
    const rows = [];
    for (const row of result.results || []) {
      try {
        const parsed = JSON.parse(row.payload_json);
        if (parsed?.job_name && Number(parsed?.level) > 0) rows.push({
          subject_key: row.subject_key,
          ...parsed,
          confidence: Number(row.confidence || 0),
          observed_at: row.observed_at
        });
      } catch {}
    }
    return rows;
  } catch {
    return [];
  }
}

function round1(value) {
  return Math.round(Number(value || 0) * 10) / 10;
}

function metric(result, field, metricName) {
  const value = result?.nq?.[field]?.world?.[metricName];
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function currentItemMap(data) {
  if (data?.items && typeof data.items === "object") return data.items;
  if (data?.itemID) return { [String(data.itemID)]: data };
  return {};
}

function scoreRow(velocity, daysSupply, avgPrice) {
  const demand = Math.min(55, Math.log1p(Math.max(0, velocity)) * 12);
  const supply = !Number.isFinite(daysSupply) ? 0
    : daysSupply <= 0.5 ? 30
      : daysSupply <= 1 ? 26
        : daysSupply <= 2 ? 20
          : daysSupply <= 4 ? 12
            : 3;
  const value = avgPrice > 0 ? Math.min(15, Math.log10(avgPrice + 1) * 3.5) : 0;
  return round1(demand + supply + value);
}

async function candidateRows(contexts) {
  const byBand = new Map();
  const rows = [];
  for (const context of contexts) {
    const code = retainerJobCode(context.job_name);
    if (!code) continue;
    const key = `${code}:${Number(context.level)}`;
    let band = byBand.get(key);
    if (!band) {
      band = await fetchRetainerLevelBandCandidates(context);
      byBand.set(key, band);
    }
    for (const candidate of band) rows.push({ ...candidate, context });
  }
  const byItem = new Map();
  for (const row of rows) {
    if (!row.item_id) continue;
    const previous = byItem.get(row.item_id);
    if (!previous || Number(row.context?.level || 0) > Number(previous.context?.level || 0)) byItem.set(row.item_id, row);
  }
  return [...byItem.values()].slice(0, 100);
}

async function marketRows(candidates) {
  if (!candidates.length) return [];
  const ids = candidates.map(row => row.item_id).slice(0, 100);
  const idText = ids.join(",");
  const headers = { "user-agent": "FF14Today/1.10" };
  const [aggregateResponse, currentResponse] = await Promise.all([
    fetch(`https://universalis.app/api/v2/aggregated/${encodeURIComponent(WORLD)}/${idText}`, { headers }),
    fetch(`https://universalis.app/api/v2/${encodeURIComponent(WORLD)}/${idText}?listings=100`, { headers })
  ]);
  if (!aggregateResponse.ok || !currentResponse.ok) return [];
  const [aggregateData, currentData] = await Promise.all([aggregateResponse.json(), currentResponse.json()]);
  const aggregateMap = new Map((aggregateData?.results || []).map(result => [Number(result.itemId), result]));
  const currentMap = currentItemMap(currentData);
  const rows = [];
  for (const candidate of candidates) {
    const aggregate = aggregateMap.get(Number(candidate.item_id));
    const current = currentMap[String(candidate.item_id)] || currentMap[candidate.item_id];
    if (!aggregate || !current) continue;
    const velocity = metric(aggregate, "dailySaleVelocity", "quantity");
    const averageSalePrice = metric(aggregate, "averageSalePrice", "price");
    const minimumListing = metric(aggregate, "minListing", "price");
    if (velocity < 0.5 || averageSalePrice <= 0) continue;
    const listings = Array.isArray(current.listings) ? current.listings : [];
    const listedQuantity = listings.reduce((sum, listing) => sum + Math.max(0, Number(listing?.quantity || 0)), 0);
    const daysSupply = velocity > 0 ? listedQuantity / velocity : Infinity;
    const quantity = Number(candidate.quantity) > 0 ? Number(candidate.quantity) : null;
    rows.push({
      score: scoreRow(velocity, daysSupply, averageSalePrice),
      item_id: candidate.item_id,
      item_name: candidate.item_name,
      quantity_per_venture: quantity,
      venture_level: candidate.venture_level,
      duration_minutes: candidate.duration_minutes,
      retainer_name: candidate.context?.retainer_name || null,
      retainer_job: candidate.context?.job_name || null,
      retainer_level: candidate.context?.level || null,
      daily_sale_velocity: round1(velocity),
      listed_quantity: listedQuantity,
      listing_rows_sampled: listings.length,
      listing_sample_capped: listings.length >= 100,
      estimated_days_supply: Number.isFinite(daysSupply) ? round1(daysSupply) : null,
      average_sale_price: Math.round(averageSalePrice),
      minimum_listing_price: Math.round(minimumListing),
      estimated_gross_per_venture: quantity ? Math.round(averageSalePrice * quantity) : null,
      market_age_minutes: current?.lastUploadTime ? Math.max(0, Math.round((Date.now() - Number(current.lastUploadTime)) / 60000)) : null,
      candidate_source: "retainer_level_band"
    });
  }
  return rows
    .sort((a, b) => b.score - a.score || b.daily_sale_velocity - a.daily_sale_velocity || b.average_sale_price - a.average_sale_price)
    .slice(0, 3)
    .map((row, index) => ({ ...row, rank: index + 1 }));
}

async function levelBandRecommendations(request, env) {
  const profileHash = await profileHashFromRequest(request);
  if (!profileHash) return null;
  const contexts = await overviewContexts(env, profileHash);
  if (!contexts.length) return null;
  let candidates = [];
  let recommendations = [];
  try {
    candidates = await candidateRows(contexts);
    recommendations = await marketRows(candidates);
  } catch {}
  return json({
    ok: true,
    setup_required: false,
    world: WORLD,
    retainer_count: contexts.length,
    level_band_candidates: candidates.length,
    recommendations,
    candidate_source: "retainer_level_band",
    message: recommendations.length
      ? "リテイナー一覧のジョブ/クラスとLvから派遣可能品を絞り、Chocobo市場で比較しました。"
      : "リテイナー一覧は登録済みです。現在のLv帯候補から強く推せる市場候補を確認できませんでした。"
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/api/retainer/recommendations" && request.method === "GET") {
      const response = await levelBandRecommendations(request, env);
      if (response) return response;
    }
    const response = await app.fetch(request, env);
    if (url.pathname === "/api/health" && request.method === "GET" && response.ok && (response.headers.get("content-type") || "").includes("application/json")) {
      let data;
      try { data = await response.clone().json(); }
      catch { return response; }
      return json({ ...data, retainer_level_band_recommendations: true, retainer_level_band_source: "XIVAPI RetainerTask" }, response.status);
    }
    return response;
  }
};

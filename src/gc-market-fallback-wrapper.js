import app from "./gc-delivery-cost-wrapper.js";
import { buildMarketFallbackProcurement, marketCostFromListings } from "./gc-market-fallback.js";

const WORLD = "Chocobo";
const XIVAPI_BASE = "https://v2.xivapi.com/api";
const MAX_FALLBACK_ROWS = 12;

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

function cleanText(value, max = 160) {
  return String(value ?? "").replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
}

function queryEscape(value) {
  return String(value || "").replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function positiveInt(value) {
  const n = Math.floor(Number(value) || 0);
  return n > 0 ? n : 0;
}

function acquisitionQuantity(row) {
  const requested = positiveInt(row?.requested_quantity);
  if (!requested) return 0;
  if (Number.isInteger(Number(row?.owned_quantity)) && Number(row.owned_quantity) >= 0) {
    return Math.max(0, requested - Number(row.owned_quantity));
  }
  return requested;
}

function quantityBasis(row) {
  return Number.isInteger(Number(row?.owned_quantity)) && Number(row.owned_quantity) >= 0
    ? "missing_quantity"
    : "requested_quantity";
}

export function needsMarketFallback(row) {
  if (row?.page_kind !== "crafting" || acquisitionQuantity(row) <= 0) return false;
  const procurement = row?.procurement;
  if (!procurement) return true;
  return procurement.status === "recipe_unavailable" || procurement.status === "market_unavailable";
}

function currentItemMap(data) {
  if (data?.items && typeof data.items === "object") return data.items;
  if (data?.itemID) return { [String(data.itemID)]: data };
  return {};
}

async function searchItemExact(itemName) {
  const clean = cleanText(itemName, 120);
  if (!clean) return { itemId: null, error: "item_not_found" };
  const queries = [
    `Name@ja=\"${queryEscape(clean)}\"`,
    `Name=\"${queryEscape(clean)}\"`
  ];
  const exact = new Map();
  let reachable = false;

  for (const query of queries) {
    const params = new URLSearchParams({
      sheets: "Item",
      fields: "Name,Name@lang(ja)",
      query,
      limit: "8"
    });
    let response;
    try {
      response = await fetch(`${XIVAPI_BASE}/search?${params.toString()}`, {
        headers: { "user-agent": "FF14Today/gc-market-fallback" },
        cf: { cacheEverything: true, cacheTtl: 604800 }
      });
    } catch {
      continue;
    }
    if (!response.ok) continue;
    reachable = true;
    let data;
    try { data = await response.json(); }
    catch { continue; }
    for (const result of data?.results || []) {
      const id = positiveInt(result?.row_id);
      if (!id) continue;
      const english = cleanText(result?.fields?.Name, 120);
      const japanese = cleanText(result?.fields?.["Name@lang(ja)"], 120);
      if (clean !== english && clean !== japanese) continue;
      exact.set(id, { itemId: id, englishName: english || null, japaneseName: japanese || null });
    }
    if (exact.size) break;
  }

  if (!reachable) return { itemId: null, error: "xivapi_unreachable" };
  if (!exact.size) return { itemId: null, error: "item_not_found" };
  if (exact.size > 1) return { itemId: null, error: "item_ambiguous" };
  return { ...[...exact.values()][0], error: null };
}

async function fetchListings(itemIds) {
  const ids = [...new Set(itemIds.map(Number).filter(id => Number.isInteger(id) && id > 0))];
  if (!ids.length) return { listings: {}, ageMinutes: null };
  let response;
  try {
    response = await fetch(`https://universalis.app/api/v2/${encodeURIComponent(WORLD)}/${ids.join(",")}?listings=100`, {
      headers: { "user-agent": "FF14Today/gc-market-fallback" }
    });
  } catch {
    return { listings: {}, ageMinutes: null };
  }
  if (!response.ok) return { listings: {}, ageMinutes: null };
  let data;
  try { data = await response.json(); }
  catch { return { listings: {}, ageMinutes: null }; }
  const map = currentItemMap(data);
  const listings = {};
  let newestUpload = 0;
  for (const itemId of ids) {
    const item = map[String(itemId)] || map[itemId] || null;
    listings[itemId] = Array.isArray(item?.listings) ? item.listings : [];
    const uploaded = Number(item?.lastUploadTime || 0);
    if (uploaded > newestUpload) newestUpload = uploaded;
  }
  return {
    listings,
    ageMinutes: newestUpload ? Math.max(0, Math.round((Date.now() - newestUpload) / 60000)) : null
  };
}

async function enrichFallbackRows(data) {
  const rows = Array.isArray(data?.deliveries) ? data.deliveries : [];
  const targets = rows
    .map((row, index) => ({ row, index }))
    .filter(({ row }) => needsMarketFallback(row))
    .slice(0, MAX_FALLBACK_ROWS);
  if (!targets.length) return data;

  const resolutions = await Promise.all(targets.map(async target => ({
    ...target,
    item: await searchItemExact(target.row?.item_name)
  })));
  const market = await fetchListings(resolutions.map(entry => entry.item?.itemId).filter(Boolean));
  const byIndex = new Map();

  for (const entry of resolutions) {
    const quantity = acquisitionQuantity(entry.row);
    const itemError = entry.item?.error || null;
    const recipeError = entry.row?.recipe_error || (entry.row?.procurement?.status === "market_unavailable" ? "market_unavailable" : "recipe_error");
    const marketCost = entry.item?.itemId
      ? marketCostFromListings(market.listings[entry.item.itemId] || [], quantity)
      : null;
    byIndex.set(entry.index, buildMarketFallbackProcurement({
      quantity,
      quantityBasis: quantityBasis(entry.row),
      recipeError,
      itemError,
      itemId: entry.item?.itemId,
      marketCost
    }));
  }

  const deliveries = rows.map((row, index) => byIndex.has(index)
    ? { ...row, procurement: byIndex.get(index), market_fallback: true }
    : row);

  return {
    ...data,
    cost_advice: data?.cost_advice || byIndex.size > 0,
    cost_advice_partial: !data?.cost_advice && byIndex.size > 0,
    deliveries,
    market_age_minutes: data?.market_age_minutes ?? market.ageMinutes,
    market_fallback: true,
    market_fallback_world: WORLD
  };
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname !== "/api/grand-company/delivery-costs" || request.method !== "GET") {
      const response = await app.fetch(request, env);
      if (url.pathname === "/api/health" && request.method === "GET" && response.ok) {
        let data;
        try { data = await response.clone().json(); }
        catch { return response; }
        return json({ ...data, gc_market_without_recipe_fallback: true, gc_market_partial_cost_fallback: true }, response.status);
      }
      return response;
    }

    const response = await app.fetch(request, env);
    if (!response.ok) return response;
    let data;
    try { data = await response.clone().json(); }
    catch { return response; }
    if (!Array.isArray(data?.deliveries)) return response;
    try {
      return json(await enrichFallbackRows(data), response.status);
    } catch {
      return response;
    }
  }
};

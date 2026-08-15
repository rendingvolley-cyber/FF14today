import app from "./gc-jsonmode-wrapper.js";
import { buildDynamicLeveCostAdvice } from "./dynamic-leve-cost-advisor.js";
import { DynamicRecipeError, resolveDynamicCraftTarget } from "./dynamic-recipe-resolver.js";

const WORLD = "Chocobo";
const XIVAPI_BASE = "https://v2.xivapi.com/api";
const MAX_DELIVERIES = 12;
const RESOLVE_CONCURRENCY = 3;

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

function positiveInt(value) {
  const n = Math.floor(Number(value) || 0);
  return n > 0 ? n : 0;
}

function positivePrice(value) {
  const n = Math.round(Number(value));
  return Number.isFinite(n) && n > 0 ? n : null;
}

function acquisitionQuantity(row) {
  const requested = positiveInt(row?.requested_quantity);
  if (!requested) return 0;
  if (Number.isInteger(Number(row?.owned_quantity)) && Number(row.owned_quantity) >= 0) {
    return Math.max(0, requested - Number(row.owned_quantity));
  }
  return requested;
}

function currentItemMap(data) {
  if (data?.items && typeof data.items === "object") return data.items;
  if (data?.itemID) return { [String(data.itemID)]: data };
  return {};
}

export function priceSnapshot(item) {
  const listings = Array.isArray(item?.listings) ? item.listings : [];
  const nqOffers = [];
  const hqOffers = [];
  for (const listing of listings) {
    const unitPrice = Math.round(Number(listing?.pricePerUnit));
    const quantity = positiveInt(listing?.quantity);
    if (!Number.isFinite(unitPrice) || unitPrice <= 0 || !quantity) continue;
    const offer = { unitPrice, quantity };
    if (listing?.hq) hqOffers.push(offer);
    else nqOffers.push(offer);
  }
  nqOffers.sort((a, b) => a.unitPrice - b.unitPrice);
  hqOffers.sort((a, b) => a.unitPrice - b.unitPrice);
  const minNq = positivePrice(item?.minPriceNQ);
  const minHq = positivePrice(item?.minPriceHQ);
  return {
    nq: nqOffers[0]?.unitPrice ?? minNq,
    hq: hqOffers[0]?.unitPrice ?? minHq,
    // Empty arrays must not masquerade as quantity-aware listing data.
    // The cost advisor will then use nq/hq as a unit-price fallback.
    nqOffers: nqOffers.length ? nqOffers : null,
    hqOffers: hqOffers.length ? hqOffers : null,
    priceSource: nqOffers.length || hqOffers.length ? "listings" : (minNq || minHq ? "min_price" : "missing")
  };
}

function chunk(values, size) {
  const out = [];
  for (let i = 0; i < values.length; i += size) out.push(values.slice(i, i + size));
  return out;
}

async function fetchMarketPrices(itemIds) {
  const ids = [...new Set(itemIds.map(Number).filter(id => Number.isInteger(id) && id > 0))];
  const prices = {};
  let newestUpload = 0;
  for (const batch of chunk(ids, 100)) {
    if (!batch.length) continue;
    const response = await fetch(
      `https://universalis.app/api/v2/${encodeURIComponent(WORLD)}/${batch.join(",")}?listings=100`,
      { headers: { "user-agent": "FF14Today/gc-delivery-cost" } }
    );
    if (!response.ok) throw new Error(`Universalis HTTP ${response.status}`);
    const data = await response.json();
    const map = currentItemMap(data);
    for (const itemId of batch) {
      const item = map[String(itemId)] || map[itemId] || null;
      prices[itemId] = priceSnapshot(item);
      const uploaded = Number(item?.lastUploadTime || 0);
      if (uploaded > newestUpload) newestUpload = uploaded;
    }
  }
  return {
    prices,
    ageMinutes: newestUpload ? Math.max(0, Math.round((Date.now() - newestUpload) / 60000)) : null
  };
}

async function fetchJapaneseItemNames(itemIds) {
  const ids = [...new Set(itemIds.map(Number).filter(id => Number.isInteger(id) && id > 0))];
  const names = {};
  for (const batch of chunk(ids, 100)) {
    if (!batch.length) continue;
    const params = new URLSearchParams({ fields: "Name", language: "ja", rows: batch.join(",") });
    try {
      const response = await fetch(`${XIVAPI_BASE}/sheet/Item?${params.toString()}`, {
        headers: { "user-agent": "FF14Today/gc-delivery-japanese-labels" },
        cf: { cacheEverything: true, cacheTtl: 604800 }
      });
      if (!response.ok) continue;
      const data = await response.json();
      for (const row of data?.rows || []) {
        const id = Number(row?.row_id);
        const name = String(row?.fields?.Name || "").trim();
        if (Number.isInteger(id) && id > 0 && name) names[id] = name;
      }
    } catch {}
  }
  return names;
}

async function mapLimit(values, limit, worker) {
  const results = new Array(values.length);
  let next = 0;
  const runners = Array.from({ length: Math.min(limit, values.length) }, async () => {
    while (next < values.length) {
      const index = next++;
      results[index] = await worker(values[index], index);
    }
  });
  await Promise.all(runners);
  return results;
}

function localizeAdvice(advice, names) {
  if (!advice) return advice;
  const target = names[Number(advice.itemId)];
  if (target) advice.itemName = target;
  for (const route of advice.routes || []) {
    for (const group of [route.purchases, route.crafts, route.inventoryUsed]) {
      for (const row of group || []) {
        const name = names[Number(row?.itemId)];
        if (name) row.itemName = name;
      }
    }
  }
  return advice;
}

function compactMaterial(row) {
  return {
    item_id: Number(row?.itemId) || null,
    item_name: row?.itemName || "素材",
    quantity: positiveInt(row?.buyQuantity ?? row?.quantity),
    unit_price: Number.isFinite(Number(row?.unitPrice)) ? Math.round(Number(row.unitPrice)) : null,
    total_gil: Number.isFinite(Number(row?.total)) ? Math.round(Number(row.total)) : null
  };
}

function routeSummary(route) {
  if (!route) return null;
  return {
    key: route.key,
    label: route.label,
    available: Boolean(route.available),
    gil: Number.isFinite(Number(route.additionalGil ?? route.gil)) ? Math.round(Number(route.additionalGil ?? route.gil)) : null,
    estimated_minutes: Number.isFinite(Number(route.estimatedMinutes)) ? Math.round(Number(route.estimatedMinutes)) : null,
    craft_count: positiveInt(route.craftCount),
    materials: (route.purchases || []).map(compactMaterial).filter(row => row.quantity > 0),
    crafts: (route.crafts || []).map(row => ({
      item_id: Number(row?.itemId) || null,
      item_name: row?.itemName || "製作品",
      syntheses: positiveInt(row?.syntheses),
      output_quantity: positiveInt(row?.outputQuantity)
    }))
  };
}

function procurementSummary(row, advice) {
  const quantity = acquisitionQuantity(row);
  if (!quantity) {
    return {
      quantity_to_acquire: 0,
      quantity_basis: "already_owned",
      status: "ready_now",
      market_buy: { available: true, gil: 0, materials: [] },
      craft_raw: { available: true, gil: 0, materials: [], crafts: [] },
      recommended_route: { key: "already_owned", label: "手持ちで納品", gil: 0, estimated_minutes: 0 },
      recommendation_reason: "必要数を所持しているため追加調達は不要です。"
    };
  }
  if (!advice) {
    return {
      quantity_to_acquire: quantity,
      quantity_basis: Number.isInteger(Number(row?.owned_quantity)) ? "missing_quantity" : "requested_quantity",
      status: "recipe_unavailable",
      market_buy: null,
      craft_raw: null,
      recommended_route: null,
      recommendation_reason: "価格またはレシピを安全に特定できませんでした。"
    };
  }

  const routeByKey = key => (advice.routes || []).find(route => route.key === key) || null;
  const market = routeSummary(routeByKey("buy_finished"));
  const craftRaw = routeSummary(routeByKey("craft_raw"));
  const recommended = routeSummary(routeByKey(advice.recommendedKey));
  return {
    quantity_to_acquire: quantity,
    quantity_basis: Number.isInteger(Number(row?.owned_quantity)) ? "missing_quantity" : "requested_quantity",
    status: recommended ? "ok" : "market_unavailable",
    market_buy: market,
    craft_raw: craftRaw,
    recommended_route: recommended,
    recommendation_reason: advice.recommendationReason || null
  };
}

function deliveryScore(row) {
  let score = 0;
  if (row?.ready_now) score += 100000;
  if (row?.starred) score += 50000;
  if (row?.bonus_text) score += 5000;
  const gil = Number(row?.procurement?.recommended_route?.gil);
  if (Number.isFinite(gil) && gil >= 0) score += Math.max(0, 10000 - Math.min(10000, Math.log10(gil + 10) * 2200));
  return score;
}

function chooseRecommendation(rows) {
  const candidates = (rows || []).filter(row => String(row?.item_name || "").trim());
  if (!candidates.length) return null;
  const best = [...candidates].sort((a, b) => deliveryScore(b) - deliveryScore(a) || Number(a.row_index || 0) - Number(b.row_index || 0))[0];
  const route = best?.procurement?.recommended_route;
  let reason;
  if (best.ready_now && best.starred) reason = "手持ちで納品でき、★表示もあるため最優先候補です。";
  else if (best.ready_now) reason = "追加支出なしで納品できるためおすすめです。";
  else if (best.starred && route?.gil != null) reason = `★表示があり、調達おすすめは「${route.label}」約${Number(route.gil).toLocaleString("ja-JP")}Gです。`;
  else if (best.starred) reason = "★表示があるためおすすめ候補です。";
  else if (route?.gil != null) reason = `今日の一覧では調達負担が比較的小さく、「${route.label}」約${Number(route.gil).toLocaleString("ja-JP")}Gです。`;
  else reason = "今日の一覧で確認できた候補です。最終的にどこまで納品するかは自分で決められます。";
  return { row_index: best.row_index, item_name: best.item_name, reason };
}

async function baseDeliveries(request, env) {
  const url = new URL(request.url);
  url.pathname = "/api/grand-company/deliveries";
  url.search = "";
  const headers = new Headers();
  const token = request.headers.get("x-profile-token");
  if (token) headers.set("x-profile-token", token);
  const response = await app.fetch(new Request(url.toString(), { method: "GET", headers }), env);
  let data;
  try { data = await response.clone().json(); }
  catch { return { response, data: null }; }
  return { response, data };
}

async function handleDeliveryCosts(request, env) {
  const base = await baseDeliveries(request, env);
  if (!base.response.ok || !base.data) return base.response;
  if (base.data.setup_required) return json({ ...base.data, cost_advice: false });
  const rows = (Array.isArray(base.data.deliveries) ? base.data.deliveries : []).slice(0, MAX_DELIVERIES);
  if (!rows.length) return json({ ...base.data, cost_advice: true, deliveries: [], recommendation: null });

  const resolved = await mapLimit(rows, RESOLVE_CONCURRENCY, async (row, index) => {
    const quantity = acquisitionQuantity(row);
    if (!quantity) return { row, resolved: null, ready: true, error: null };
    try {
      const value = await resolveDynamicCraftTarget({
        taskKey: `craft:gc:${index}`,
        itemName: String(row.item_name || "").trim(),
        requiredQuantity: quantity,
        hqRequired: false
      });
      return { row, resolved: value, ready: false, error: null };
    } catch (error) {
      return {
        row,
        resolved: null,
        ready: false,
        error: error instanceof DynamicRecipeError ? error.code : "recipe_error"
      };
    }
  });

  const allItemIds = resolved.flatMap(entry => entry.resolved?.reachableItemIds || []);
  let market = { prices: {}, ageMinutes: null };
  if (allItemIds.length) {
    try { market = await fetchMarketPrices(allItemIds); }
    catch (error) {
      return json({
        ok: true,
        world: WORLD,
        source: "Universalis",
        cost_advice: false,
        message: "Chocobo市場の価格を取得できませんでした。納品一覧はそのまま確認できます。",
        detail: error.message,
        deliveries: rows,
        recommendation: null
      });
    }
  }
  const japaneseNames = await fetchJapaneseItemNames(allItemIds);

  const deliveries = resolved.map(entry => {
    let advice = null;
    if (entry.resolved) {
      advice = buildDynamicLeveCostAdvice(
        entry.resolved.target,
        entry.resolved.recipeGraph,
        entry.resolved.itemNames,
        market.prices,
        { energy: 3, availableMinutes: 120, preferTraining: true, inventory: {} }
      );
      localizeAdvice(advice, japaneseNames);
    }
    return {
      ...entry.row,
      procurement: procurementSummary(entry.row, advice),
      recipe_source: entry.resolved?.source || null,
      recipe_error: entry.error
    };
  });
  const recommendation = chooseRecommendation(deliveries);
  return json({
    ok: true,
    world: WORLD,
    source: "Universalis",
    market_age_minutes: market.ageMinutes,
    market_pricing: "listing_quantity_curve_with_min_price_fallback",
    cost_advice: true,
    company_name: base.data.company_name || null,
    observed_at: base.data.observed_at || null,
    deliveries,
    recommendation,
    decision_owner: "user"
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/api/grand-company/delivery-costs" && request.method === "GET") {
      return handleDeliveryCosts(request, env);
    }
    const response = await app.fetch(request, env);
    if (url.pathname === "/api/health" && request.method === "GET" && response.ok) {
      let data;
      try { data = await response.clone().json(); }
      catch { return response; }
      return json({
        ...data,
        gc_delivery_cost_comparison: true,
        gc_delivery_cost_world: WORLD,
        gc_delivery_decision_owner: "user"
      }, response.status);
    }
    return response;
  }
};
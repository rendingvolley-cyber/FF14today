import app from "./combat-job-wrapper.js";
import { buildLeveCostAdvice } from "./leve-cost-advisor.js";
import { collectReachableItemIds, leveTarget } from "./leve-cost-data.js";
import { buildDynamicLeveCostAdvice } from "./dynamic-leve-cost-advisor.js";
import { DynamicRecipeError, resolveDynamicCraftTarget } from "./dynamic-recipe-resolver.js";
import { loadInventoryEvidence, profileHashFromRequest } from "./inventory-store.js";

const WORLD = "Chocobo";
const VERSION = "1.9.3";
const VERSION_LABEL = `v${VERSION} · RECIPE AUTO`;
const XIVAPI_BASE = "https://v2.xivapi.com/api";

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

function currentItemMap(data) {
  if (data?.items && typeof data.items === "object") return data.items;
  if (data?.itemID) return { [String(data.itemID)]: data };
  return {};
}

function priceSnapshot(item) {
  const listings = Array.isArray(item?.listings) ? item.listings : [];
  const nqOffers = [];
  const hqOffers = [];
  for (const listing of listings) {
    const price = Number(listing?.pricePerUnit);
    const quantity = Math.floor(Number(listing?.quantity) || 0);
    if (!Number.isFinite(price) || price <= 0 || quantity <= 0) continue;
    const offer = { unitPrice: Math.round(price), quantity };
    if (listing?.hq) hqOffers.push(offer);
    else nqOffers.push(offer);
  }
  nqOffers.sort((a, b) => a.unitPrice - b.unitPrice);
  hqOffers.sort((a, b) => a.unitPrice - b.unitPrice);
  return {
    nq: nqOffers[0]?.unitPrice ?? null,
    hq: hqOffers[0]?.unitPrice ?? null,
    nqOffers,
    hqOffers
  };
}

function newestUploadAgeMinutes(itemMap) {
  const times = Object.values(itemMap)
    .map(item => Number(item?.lastUploadTime || 0))
    .filter(value => Number.isFinite(value) && value > 0);
  if (!times.length) return null;
  const newest = Math.max(...times);
  return Math.max(0, Math.round((Date.now() - newest) / 60000));
}

async function fetchMarketPrices(itemIds) {
  const ids = [...new Set(itemIds.map(Number).filter(Number.isInteger))].slice(0, 100);
  if (!ids.length) return { prices: {}, ageMinutes: null };
  const response = await fetch(
    `https://universalis.app/api/v2/${encodeURIComponent(WORLD)}/${ids.join(",")}?listings=100`,
    { headers: { "user-agent": `FF14Today/${VERSION} leve-cost-advisor` } }
  );
  if (!response.ok) throw new Error(`Universalis HTTP ${response.status}`);
  const data = await response.json();
  const map = currentItemMap(data);
  const prices = {};
  for (const itemId of ids) prices[itemId] = priceSnapshot(map[String(itemId)] || map[itemId]);
  return { prices, ageMinutes: newestUploadAgeMinutes(map) };
}

async function fetchJapaneseItemNames(itemIds) {
  const ids = [...new Set(itemIds.map(Number).filter(id => Number.isInteger(id) && id > 0))].slice(0, 100);
  if (!ids.length) return {};
  const params = new URLSearchParams({
    fields: "Name",
    language: "ja",
    rows: ids.join(",")
  });
  try {
    const response = await fetch(`${XIVAPI_BASE}/sheet/Item?${params.toString()}`, {
      headers: { "user-agent": `FF14Today/${VERSION} japanese-item-labels` },
      cf: { cacheEverything: true, cacheTtl: 604800 }
    });
    if (!response.ok) return {};
    const data = await response.json();
    const names = {};
    for (const row of data?.rows || []) {
      const id = Number(row?.row_id);
      const name = String(row?.fields?.Name || "").trim();
      if (Number.isInteger(id) && id > 0 && name) names[id] = name;
    }
    return names;
  } catch {
    return {};
  }
}

function localizeActionRows(rows, names) {
  for (const row of rows || []) {
    const name = names?.[Number(row?.itemId)] || names?.[String(row?.itemId)];
    if (name) row.itemName = name;
  }
}

function localizeAdviceItemNames(advice, names) {
  if (!advice || !names || !Object.keys(names).length) return advice;
  const targetName = names[Number(advice.itemId)] || names[String(advice.itemId)];
  if (targetName) advice.itemName = targetName;
  for (const route of advice.routes || []) {
    localizeActionRows(route.purchases, names);
    localizeActionRows(route.crafts, names);
    localizeActionRows(route.inventoryUsed, names);
  }
  return advice;
}

function clampEnergy(value) {
  const n = Math.round(Number(value) || 3);
  return Math.max(1, Math.min(5, n));
}

function clampMinutes(value) {
  const n = Math.round(Number(value) || 60);
  return Math.max(5, Math.min(240, n));
}

function boolParam(value) {
  return value === "1" || value === "true";
}

function dynamicInputFromUrl(url, taskKey) {
  return {
    taskKey,
    itemName: String(url.searchParams.get("item_name") || "").trim(),
    requiredQuantity: Number(url.searchParams.get("quantity")),
    hqRequired: boolParam(url.searchParams.get("hq_required"))
  };
}

function dynamicErrorResponse(error) {
  if (error instanceof DynamicRecipeError) {
    const upstream = new Set(["xivapi_unreachable", "xivapi_http", "xivapi_json"]).has(error.code);
    return json({
      error: "動的レシピを安全に特定できませんでした。",
      detail: error.message,
      code: error.code
    }, upstream ? 502 : 422);
  }
  return json({
    error: "動的レシピを安全に特定できませんでした。",
    detail: error?.message || "unknown dynamic recipe error"
  }, 502);
}

async function handleCostAdvice(request, url, env) {
  const taskKey = String(url.searchParams.get("task_key") || "").trim();
  const staticTarget = leveTarget(taskKey);
  const wantsDynamic = !staticTarget && boolParam(url.searchParams.get("dynamic"));
  if (!staticTarget && !wantsDynamic) {
    return json({ error: "この製作候補は動的レシピ情報がありません。" }, 404);
  }

  const profileHash = await profileHashFromRequest(request);
  let resolved = null;
  let target = staticTarget;
  let reachableItemIds = staticTarget ? collectReachableItemIds(staticTarget) : [];
  if (wantsDynamic) {
    if (!profileHash) return json({ error: "profile token required for dynamic recipe resolution" }, 401);
    try {
      resolved = await resolveDynamicCraftTarget(dynamicInputFromUrl(url, taskKey));
      target = resolved.target;
      reachableItemIds = resolved.reachableItemIds;
    } catch (error) {
      return dynamicErrorResponse(error);
    }
  }

  const energy = clampEnergy(url.searchParams.get("energy"));
  const availableMinutes = clampMinutes(url.searchParams.get("available_minutes"));
  const japaneseNamesPromise = fetchJapaneseItemNames(reachableItemIds);
  let market;
  try {
    market = await fetchMarketPrices(reachableItemIds);
  } catch (error) {
    return json({
      error: "Chocobo市場の比較データを取得できませんでした。",
      detail: error.message
    }, 502);
  }

  let inventory = { items: {}, rows: [], observedAt: null };
  if (profileHash) {
    try { inventory = await loadInventoryEvidence(env, profileHash); }
    catch { inventory = { items: {}, rows: [], observedAt: null }; }
  }

  const options = {
    energy,
    availableMinutes,
    preferTraining: true,
    inventory: inventory.items
  };
  const advice = resolved
    ? buildDynamicLeveCostAdvice(target, resolved.recipeGraph, resolved.itemNames, market.prices, options)
    : buildLeveCostAdvice(target, market.prices, options);
  if (!advice) return json({ error: "レシピ比較を生成できませんでした。" }, 422);

  const japaneseNames = await japaneseNamesPromise;
  localizeAdviceItemNames(advice, japaneseNames);

  return json({
    ok: true,
    world: WORLD,
    source: "Universalis",
    market_age_minutes: market.ageMinutes,
    market_pricing: "listing_quantity_curve",
    recipe_source: resolved ? resolved.source : "verified_static_fallback",
    recipe_dynamic: Boolean(resolved),
    recipe_warnings: resolved?.warnings || [],
    item_name_locale: Object.keys(japaneseNames).length ? "ja" : "fallback",
    energy,
    available_minutes: availableMinutes,
    inventory_evidence: {
      applied: advice.inventoryEvidenceApplied,
      observed_at: inventory.observedAt,
      item_count: inventory.rows.length
    },
    advice
  });
}

function rewriteVersion(response) {
  if (!response.ok || !(response.headers.get("content-type") || "").includes("text/html")) return response;
  return new HTMLRewriter()
    .on(".version", {
      element(element) {
        element.setInnerContent(VERSION_LABEL);
      }
    })
    .transform(response);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/api/leve/cost-advice" && request.method === "GET") {
      return handleCostAdvice(request, url, env);
    }

    const response = await app.fetch(request, env);
    if (url.pathname === "/api/health" && request.method === "GET" && response.ok) {
      let data;
      try { data = await response.clone().json(); }
      catch { return response; }
      return json({
        ...data,
        version: VERSION,
        version_label: VERSION_LABEL,
        daily_routine_order: ["grand_company", "retainer", "plan"],
        leve_cost_advisor: true,
        leve_cost_market_world: WORLD,
        leve_cost_inventory_evidence: true,
        leve_cost_cash_vs_opportunity: true,
        leve_cost_listing_quantity_pricing: true,
        leve_cost_dynamic_recipe_resolver: true,
        leve_cost_dynamic_recipe_max_depth: 5,
        leve_cost_dynamic_recipe_max_items: 60,
        leve_cost_item_name_locale: "ja",
        leve_cost_routes: ["buy_finished", "buy_direct", "mixed", "craft_raw"]
      }, response.status);
    }
    if (request.method === "GET" && (response.headers.get("content-type") || "").includes("text/html")) {
      return rewriteVersion(response);
    }
    return response;
  }
};

import app from "./leve-cost-wrapper.js";
import {
  loadDynamicAliasRows,
  rememberDynamicRecipeItems,
  resolveVisibleInventoryRows
} from "./dynamic-inventory-context.js";
import { profileHashFromRequest, storeInventoryRows } from "./inventory-store.js";

const VERSION = "1.9.4";

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

function collectAdviceItemIds(advice) {
  const ids = new Set();
  const targetId = Number(advice?.itemId);
  if (Number.isInteger(targetId) && targetId > 0) ids.add(targetId);
  for (const route of advice?.routes || []) {
    for (const row of [...(route?.purchases || []), ...(route?.crafts || [])]) {
      const id = Number(row?.itemId);
      if (Number.isInteger(id) && id > 0) ids.add(id);
    }
  }
  return [...ids].slice(0, 60);
}

function mergeRelevantItems(existing, added) {
  const map = new Map();
  for (const row of [...(existing || []), ...(added || [])]) {
    const id = Number(row?.item_id);
    if (!Number.isInteger(id) || id <= 0) continue;
    const previous = map.get(id);
    if (!previous || Number(row?.confidence || 0) > Number(previous?.confidence || 0)) map.set(id, row);
  }
  return [...map.values()];
}

async function rememberDynamicAdvice(request, response, env) {
  if (!response.ok || !(response.headers.get("content-type") || "").includes("application/json")) return response;
  let data;
  try { data = await response.clone().json(); }
  catch { return response; }
  if (!data?.recipe_dynamic || !data?.advice) return response;
  const profileHash = await profileHashFromRequest(request);
  if (!profileHash) return response;
  const taskKey = String(data.advice.taskKey || "").trim();
  const itemIds = collectAdviceItemIds(data.advice);
  if (!taskKey || !itemIds.length) return response;
  let saved = 0;
  try { saved = await rememberDynamicRecipeItems(env, profileHash, taskKey, itemIds); }
  catch { return response; }
  return json({
    ...data,
    dynamic_inventory_allowlist_saved: saved
  }, response.status);
}

async function enrichInventoryEvidence(request, response, env) {
  if (!response.ok || !(response.headers.get("content-type") || "").includes("application/json")) return response;
  let data;
  try { data = await response.clone().json(); }
  catch { return response; }
  const analysis = data?.analysis;
  if (analysis?.page_type !== "inventory_items" || !analysis?.inventory_items) return response;
  const profileHash = await profileHashFromRequest(request);
  if (!profileHash) return response;

  let aliases = [];
  try { aliases = await loadDynamicAliasRows(env, profileHash); }
  catch { return response; }
  if (!aliases.length) return response;
  const rows = resolveVisibleInventoryRows(analysis.inventory_items.items, aliases);
  if (!rows.length) return response;

  let saved = 0;
  try { saved = await storeInventoryRows(env, profileHash, rows); }
  catch { return response; }
  const relevantItems = mergeRelevantItems(analysis.inventory_items.relevant_items, rows);
  return json({
    ...data,
    analysis: {
      ...analysis,
      inventory_items: {
        ...analysis.inventory_items,
        relevant_items: relevantItems
      }
    },
    inventory_context_saved: Math.max(Number(data.inventory_context_saved || 0), relevantItems.length),
    dynamic_inventory_context_saved: saved
  }, response.status);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/api/leve/cost-advice" && request.method === "GET") {
      const response = await app.fetch(request, env);
      return rememberDynamicAdvice(request, response, env);
    }
    if (url.pathname === "/api/context/image" && request.method === "POST") {
      const response = await app.fetch(request, env);
      return enrichInventoryEvidence(request, response, env);
    }

    const response = await app.fetch(request, env);
    if (url.pathname === "/api/health" && request.method === "GET" && response.ok) {
      let data;
      try { data = await response.clone().json(); }
      catch { return response; }
      return json({
        ...data,
        version: VERSION,
        leve_dynamic_inventory_allowlist: true,
        leve_dynamic_inventory_same_day_only: true
      }, response.status);
    }
    return response;
  }
};

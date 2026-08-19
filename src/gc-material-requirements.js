import { DynamicRecipeError, resolveDynamicCraftTarget } from "./dynamic-recipe-resolver.js";

const XIVAPI_BASE = "https://v2.xivapi.com/api";
const MAX_CRAFTING_DELIVERIES = 12;
const RESOLVE_CONCURRENCY = 3;
const NAME_FETCH_ATTEMPTS = 2;

function positiveInt(value) {
  const n = Math.floor(Number(value) || 0);
  return Number.isInteger(n) && n > 0 ? n : 0;
}

function cleanText(value, max = 180) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

function containsJapanese(value) {
  return /[\u3040-\u30ff\u3400-\u9fff]/.test(String(value || ""));
}

function quantityToCraft(row) {
  const requested = positiveInt(row?.requested_quantity);
  if (!requested) return 0;
  const owned = Number(row?.owned_quantity);
  return Number.isInteger(owned) && owned >= 0 ? Math.max(0, requested - owned) : requested;
}

function graphRecipe(resolved, itemId) {
  return resolved?.recipeGraph?.[Number(itemId)] || resolved?.recipeGraph?.[String(itemId)] || null;
}

function itemName(resolved, itemId) {
  return cleanText(resolved?.itemNames?.[Number(itemId)] || resolved?.itemNames?.[String(itemId)] || "");
}

function safeMaterialName(value) {
  const name = cleanText(value);
  return containsJapanese(name) ? name : "素材名取得失敗";
}

function mergeRows(rows) {
  const merged = new Map();
  for (const row of rows || []) {
    const id = positiveInt(row?.item_id);
    const name = cleanText(row?.item_name);
    const quantity = positiveInt(row?.quantity);
    if (!id || !quantity) continue;
    const current = merged.get(id) || { item_id: id, item_name: name, quantity: 0 };
    current.quantity += quantity;
    if ((!current.item_name || !containsJapanese(current.item_name)) && containsJapanese(name)) current.item_name = name;
    merged.set(id, current);
  }
  return [...merged.values()].sort((a, b) => String(a.item_name).localeCompare(String(b.item_name), "ja"));
}

export function directMaterialRequirements(resolved) {
  const targetId = positiveInt(resolved?.target?.itemId);
  const requiredQuantity = positiveInt(resolved?.target?.requiredQuantity);
  const recipe = graphRecipe(resolved, targetId);
  if (!targetId || !requiredQuantity || !recipe) return [];
  const output = Math.max(1, positiveInt(recipe.outputQuantity) || 1);
  const batches = Math.ceil(requiredQuantity / output);
  return mergeRows((recipe.ingredients || []).map(([ingredientId, amount]) => ({
    item_id: positiveInt(ingredientId),
    item_name: itemName(resolved, ingredientId),
    quantity: positiveInt(amount) * batches
  })));
}

export function rawMaterialRequirements(resolved) {
  const targetId = positiveInt(resolved?.target?.itemId);
  const requiredQuantity = positiveInt(resolved?.target?.requiredQuantity);
  if (!targetId || !requiredQuantity || !graphRecipe(resolved, targetId)) return [];
  const leaves = [];
  const visit = (itemId, quantity, depth = 0) => {
    const id = positiveInt(itemId);
    const qty = positiveInt(quantity);
    if (!id || !qty) return;
    const recipe = graphRecipe(resolved, id);
    if (!recipe || depth >= 8) {
      leaves.push({ item_id: id, item_name: itemName(resolved, id), quantity: qty });
      return;
    }
    const output = Math.max(1, positiveInt(recipe.outputQuantity) || 1);
    const batches = Math.ceil(qty / output);
    for (const [ingredientId, amount] of recipe.ingredients || []) {
      visit(ingredientId, positiveInt(amount) * batches, depth + 1);
    }
  };
  visit(targetId, requiredQuantity, 0);
  return mergeRows(leaves);
}

export function aggregateMaterialRequirements(deliveries, field = "direct_materials") {
  return mergeRows((deliveries || []).flatMap(row => row?.[field] || []));
}

async function mapLimit(values, limit, worker) {
  const results = new Array(values.length);
  let next = 0;
  const runners = Array.from({ length: Math.min(limit, Math.max(1, values.length)) }, async () => {
    while (next < values.length) {
      const index = next++;
      results[index] = await worker(values[index], index);
    }
  });
  await Promise.all(runners);
  return results;
}

function chunk(values, size) {
  const out = [];
  for (let i = 0; i < values.length; i += size) out.push(values.slice(i, i + size));
  return out;
}

async function fetchJapaneseNames(itemIds) {
  const ids = [...new Set((itemIds || []).map(positiveInt).filter(Boolean))];
  const names = {};
  for (const batch of chunk(ids, 100)) {
    const params = new URLSearchParams({ fields: "Name,Name@lang(ja)", language: "ja", rows: batch.join(",") });
    for (let attempt = 0; attempt < NAME_FETCH_ATTEMPTS; attempt += 1) {
      try {
        const response = await fetch(`${XIVAPI_BASE}/sheet/Item?${params.toString()}`, {
          headers: { "user-agent": "FF14Today/gc-material-requirements" },
          cf: { cacheEverything: true, cacheTtl: 604800 }
        });
        if (!response.ok) {
          if (attempt + 1 < NAME_FETCH_ATTEMPTS) continue;
          break;
        }
        const data = await response.json();
        for (const row of data?.rows || []) {
          const id = positiveInt(row?.row_id);
          const decorated = cleanText(row?.fields?.["Name@lang(ja)"]);
          const defaultName = cleanText(row?.fields?.Name);
          const name = containsJapanese(decorated)
            ? decorated
            : containsJapanese(defaultName)
              ? defaultName
              : "";
          if (id && name) names[id] = name;
        }
        break;
      } catch {
        if (attempt + 1 >= NAME_FETCH_ATTEMPTS) break;
      }
    }
  }
  return names;
}

function localizeMaterials(rows, names) {
  return (rows || []).map(row => {
    const canonical = names[row.item_id] || (containsJapanese(row.item_name) ? cleanText(row.item_name) : "");
    return {
      ...row,
      item_name: canonical || "素材名取得失敗",
      item_name_ja_verified: Boolean(canonical)
    };
  }).sort((a, b) => String(a.item_name).localeCompare(String(b.item_name), "ja"));
}

async function baseDeliveries(request, env, app) {
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

export async function grandCompanyMaterialRequirements(request, env, app) {
  const base = await baseDeliveries(request, env, app);
  if (!base.response.ok || !base.data) return { status: base.response.status, data: base.data || { ok: false } };
  const allRows = Array.isArray(base.data.deliveries)
    ? base.data.deliveries
    : (Array.isArray(base.data.crafting_deliveries) ? base.data.crafting_deliveries.map(row => ({ ...row, page_kind: "crafting" })) : []);
  const crafting = allRows.filter(row => row?.page_kind === "crafting").slice(0, MAX_CRAFTING_DELIVERIES);

  const resolvedRows = await mapLimit(crafting, RESOLVE_CONCURRENCY, async (row, index) => {
    const quantity = quantityToCraft(row);
    if (!quantity) {
      return {
        row_index: row.row_index ?? index,
        item_name: cleanText(row.item_name),
        requested_quantity: positiveInt(row.requested_quantity),
        owned_quantity: Number.isInteger(Number(row.owned_quantity)) ? Number(row.owned_quantity) : null,
        quantity_to_craft: 0,
        direct_materials: [],
        raw_materials: [],
        recipe_status: "already_owned",
        recipe_error: null
      };
    }
    try {
      const resolved = await resolveDynamicCraftTarget({
        taskKey: `craft:gc-materials:${index}`,
        itemName: cleanText(row.item_name),
        requiredQuantity: quantity,
        hqRequired: false
      });
      return {
        row_index: row.row_index ?? index,
        item_name: cleanText(row.item_name),
        requested_quantity: positiveInt(row.requested_quantity),
        owned_quantity: Number.isInteger(Number(row.owned_quantity)) ? Number(row.owned_quantity) : null,
        quantity_to_craft: quantity,
        direct_materials: directMaterialRequirements(resolved),
        raw_materials: rawMaterialRequirements(resolved),
        recipe_status: "ok",
        recipe_error: null
      };
    } catch (error) {
      return {
        row_index: row.row_index ?? index,
        item_name: cleanText(row.item_name),
        requested_quantity: positiveInt(row.requested_quantity),
        owned_quantity: Number.isInteger(Number(row.owned_quantity)) ? Number(row.owned_quantity) : null,
        quantity_to_craft: quantity,
        direct_materials: [],
        raw_materials: [],
        recipe_status: "unavailable",
        recipe_error: error instanceof DynamicRecipeError ? error.code : "recipe_error"
      };
    }
  });

  const ids = resolvedRows.flatMap(row => [...row.direct_materials, ...row.raw_materials].map(material => material.item_id));
  const japaneseNames = await fetchJapaneseNames(ids);
  const deliveries = resolvedRows.map(row => ({
    ...row,
    direct_materials: localizeMaterials(row.direct_materials, japaneseNames),
    raw_materials: localizeMaterials(row.raw_materials, japaneseNames)
  }));
  const actionable = deliveries.filter(row => row.quantity_to_craft > 0);
  const resolvedCount = actionable.filter(row => row.recipe_status === "ok").length;
  const unresolved = actionable.filter(row => row.recipe_status !== "ok").map(row => ({
    item_name: row.item_name,
    error: row.recipe_error || "recipe_unavailable"
  }));
  const japaneseNameUnresolvedCount = deliveries
    .flatMap(row => [...row.direct_materials, ...row.raw_materials])
    .filter(row => !row.item_name_ja_verified)
    .length;

  return {
    status: 200,
    data: {
      ok: true,
      company_name: base.data.company_name || "双蛇党",
      observed_at: base.data.observed_at || null,
      crafting_count: crafting.length,
      actionable_count: actionable.length,
      resolved_count: resolvedCount,
      unresolved_count: unresolved.length,
      unresolved,
      deliveries,
      aggregate: {
        direct_materials: localizeMaterials(aggregateMaterialRequirements(deliveries, "direct_materials"), japaneseNames),
        raw_materials: localizeMaterials(aggregateMaterialRequirements(deliveries, "raw_materials"), japaneseNames)
      },
      japanese_item_names_required: true,
      japanese_item_name_unresolved_count: japaneseNameUnresolvedCount,
      source: "FFXIV recipe data + XIVAPI Japanese Item names",
      market_price_independent: true
    }
  };
}
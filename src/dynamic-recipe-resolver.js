const XIVAPI_BASE = "https://v2.xivapi.com/api";
const MAX_RECIPE_DEPTH = 5;
const MAX_GRAPH_ITEMS = 60;
const MAX_RECIPE_CANDIDATES = 4;
const recipeCache = new Map();
const itemSearchCache = new Map();

export class DynamicRecipeError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "DynamicRecipeError";
    this.code = code;
  }
}

function normalizeText(value, max = 160) {
  return String(value ?? "").replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
}

function positiveInt(value, fallback = null) {
  const n = Math.floor(Number(value));
  return Number.isInteger(n) && n > 0 ? n : fallback;
}

function relationId(value) {
  if (Number.isInteger(Number(value)) && Number(value) > 0) return Number(value);
  if (!value || typeof value !== "object") return null;
  for (const key of ["value", "row_id", "rowId", "id", "ID"]) {
    const n = Number(value[key]);
    if (Number.isInteger(n) && n > 0) return n;
  }
  return null;
}

function scalarNumber(value) {
  if (Number.isFinite(Number(value))) return Number(value);
  if (!value || typeof value !== "object") return null;
  for (const key of ["value", "Value", "amount", "Amount", "quantity", "Quantity"]) {
    if (Number.isFinite(Number(value[key]))) return Number(value[key]);
  }
  return null;
}

function relationName(value) {
  if (!value || typeof value !== "object") return null;
  const fields = value.fields && typeof value.fields === "object" ? value.fields : value;
  for (const key of ["Name@lang(ja)", "Name", "Singular"]) {
    const text = normalizeText(fields[key]);
    if (text) return text;
  }
  return null;
}

function queryEscape(value) {
  return String(value || "").replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

async function fetchJson(url, fetchImpl) {
  let response;
  try {
    response = await fetchImpl(url, {
      headers: { "user-agent": "FF14Today/1.9.3 dynamic-recipe-resolver" },
      cf: { cacheEverything: true, cacheTtl: 604800 }
    });
  } catch (error) {
    throw new DynamicRecipeError("xivapi_unreachable", `XIVAPIへ接続できませんでした: ${error.message}`);
  }
  if (!response.ok) {
    throw new DynamicRecipeError("xivapi_http", `XIVAPI HTTP ${response.status}`);
  }
  try {
    return await response.json();
  } catch {
    throw new DynamicRecipeError("xivapi_json", "XIVAPI応答をJSONとして読めませんでした。");
  }
}

async function searchItemExact(itemName, fetchImpl) {
  const clean = normalizeText(itemName, 120);
  if (!clean) throw new DynamicRecipeError("item_name_required", "製作品名がありません。");
  const cacheKey = clean.toLocaleLowerCase("ja-JP");
  if (itemSearchCache.has(cacheKey)) return itemSearchCache.get(cacheKey);

  const queries = [
    `Name=\"${queryEscape(clean)}\"`,
    `Name@ja=\"${queryEscape(clean)}\"`
  ];
  let exact = [];
  for (const query of queries) {
    const params = new URLSearchParams({
      sheets: "Item",
      fields: "Name,Name@lang(ja)",
      query,
      limit: "8"
    });
    let data;
    try { data = await fetchJson(`${XIVAPI_BASE}/search?${params.toString()}`, fetchImpl); }
    catch (error) {
      if (error.code === "xivapi_http") continue;
      throw error;
    }
    for (const result of data?.results || []) {
      const id = positiveInt(result?.row_id);
      if (!id) continue;
      const english = normalizeText(result?.fields?.Name);
      const japanese = normalizeText(result?.fields?.["Name@lang(ja)"]);
      if (clean !== english && clean !== japanese) continue;
      exact.push({ itemId: id, englishName: english || clean, japaneseName: japanese || null });
    }
    if (exact.length) break;
  }

  exact = [...new Map(exact.map(row => [row.itemId, row])).values()];
  if (!exact.length) throw new DynamicRecipeError("item_not_found", `「${clean}」をXIVAPIのItemとして特定できませんでした。`);
  if (exact.length > 1) throw new DynamicRecipeError("item_ambiguous", `「${clean}」に複数のItem候補があり、安全に特定できませんでした。`);
  itemSearchCache.set(cacheKey, exact[0]);
  return exact[0];
}

function ingredientFromStruct(entry, pairedAmount = null) {
  if (!entry) return null;
  const fields = entry?.fields && typeof entry.fields === "object" ? entry.fields : entry;
  const relation = fields?.Item ?? fields?.ItemIngredient ?? fields?.Ingredient ?? entry;
  const itemId = relationId(relation);
  const amount = positiveInt(
    scalarNumber(fields?.Amount ?? fields?.AmountIngredient ?? fields?.Quantity ?? pairedAmount),
    null
  );
  if (!itemId || !amount) return null;
  return { itemId, amount, itemName: relationName(relation) };
}

export function parseRecipeRow(row, expectedItemId = null) {
  const fields = row?.fields && typeof row.fields === "object" ? row.fields : row;
  if (!fields || typeof fields !== "object") return null;
  const resultRelation = fields.ItemResult ?? fields.ResultItem ?? fields.Result;
  const resultItemId = relationId(resultRelation) || positiveInt(expectedItemId);
  if (!resultItemId) return null;
  if (expectedItemId && Number(resultItemId) !== Number(expectedItemId)) return null;
  const outputQuantity = positiveInt(scalarNumber(fields.AmountResult ?? fields.ResultAmount ?? fields.OutputQuantity), 1);
  const ingredients = [];

  const ingredientArray = Array.isArray(fields.Ingredient)
    ? fields.Ingredient
    : Array.isArray(fields.ItemIngredient)
      ? fields.ItemIngredient
      : Array.isArray(fields.Ingredients)
        ? fields.Ingredients
        : null;
  const amountArray = Array.isArray(fields.AmountIngredient) ? fields.AmountIngredient : [];
  if (ingredientArray) {
    ingredientArray.forEach((entry, index) => {
      const ingredient = ingredientFromStruct(entry, amountArray[index]);
      if (ingredient) ingredients.push(ingredient);
    });
  }

  for (const [key, value] of Object.entries(fields)) {
    const match = key.match(/^ItemIngredient(?:\[)?(\d+)(?:\])?$/i);
    if (!match) continue;
    const index = Number(match[1]);
    const paired = fields[`AmountIngredient${index}`] ?? fields[`AmountIngredient[${index}]`];
    const ingredient = ingredientFromStruct(value, paired);
    if (ingredient && !ingredients.some(row => row.itemId === ingredient.itemId && row.amount === ingredient.amount)) {
      ingredients.push(ingredient);
    }
  }

  const normalized = ingredients
    .filter(row => row.itemId > 0 && row.amount > 0)
    .slice(0, 16);
  if (!normalized.length) return null;
  return {
    recipeRowId: positiveInt(row?.row_id),
    resultItemId,
    resultItemName: relationName(resultRelation),
    outputQuantity,
    ingredients: normalized
  };
}

function recipeSignature(recipe) {
  return `${recipe.outputQuantity}|${recipe.ingredients
    .map(row => `${row.itemId}:${row.amount}`)
    .sort()
    .join("|")}`;
}

async function searchRecipeRows(itemId, fetchImpl) {
  const params = new URLSearchParams({
    sheets: "Recipe",
    fields: "ItemResult@as(raw),AmountResult",
    query: `ItemResult=${Number(itemId)}`,
    limit: String(MAX_RECIPE_CANDIDATES)
  });
  let data;
  try {
    data = await fetchJson(`${XIVAPI_BASE}/search?${params.toString()}`, fetchImpl);
  } catch (error) {
    if (error.code === "xivapi_http") return [];
    throw error;
  }
  return (data?.results || [])
    .map(result => positiveInt(result?.row_id))
    .filter(Boolean)
    .slice(0, MAX_RECIPE_CANDIDATES);
}

async function resolveRecipe(itemId, fetchImpl) {
  const id = positiveInt(itemId);
  if (!id) return null;
  if (recipeCache.has(id)) return recipeCache.get(id);
  const rowIds = await searchRecipeRows(id, fetchImpl);
  if (!rowIds.length) {
    recipeCache.set(id, null);
    return null;
  }

  const recipes = [];
  for (const rowId of rowIds) {
    let data;
    try { data = await fetchJson(`${XIVAPI_BASE}/sheet/Recipe/${rowId}`, fetchImpl); }
    catch (error) {
      if (error.code === "xivapi_http") continue;
      throw error;
    }
    const parsed = parseRecipeRow(data, id);
    if (parsed) recipes.push(parsed);
  }
  if (!recipes.length) {
    recipeCache.set(id, null);
    return null;
  }

  const bySignature = new Map();
  for (const recipe of recipes) {
    const signature = recipeSignature(recipe);
    if (!bySignature.has(signature)) bySignature.set(signature, recipe);
  }
  if (bySignature.size > 1) {
    throw new DynamicRecipeError("recipe_ambiguous", `Item ${id} に材料構成の異なる複数レシピがあり、自動選択を停止しました。`);
  }
  const recipe = [...bySignature.values()][0];
  recipeCache.set(id, recipe);
  return recipe;
}

async function fetchItemNames(itemIds, fetchImpl) {
  const ids = [...new Set(itemIds.map(Number).filter(id => Number.isInteger(id) && id > 0))].slice(0, MAX_GRAPH_ITEMS);
  if (!ids.length) return {};
  const params = new URLSearchParams({
    fields: "Name,Name@lang(ja)",
    rows: ids.join(",")
  });
  const data = await fetchJson(`${XIVAPI_BASE}/sheet/Item?${params.toString()}`, fetchImpl);
  const names = {};
  for (const row of data?.rows || []) {
    const id = positiveInt(row?.row_id);
    if (!id) continue;
    const english = normalizeText(row?.fields?.Name);
    const japanese = normalizeText(row?.fields?.["Name@lang(ja)"]);
    names[id] = english || japanese || `Item ${id}`;
  }
  return names;
}

export function collectGraphItemIds(targetItemId, recipeGraph) {
  const seen = new Set();
  const visit = itemId => {
    const id = positiveInt(itemId);
    if (!id || seen.has(id) || seen.size >= MAX_GRAPH_ITEMS) return;
    seen.add(id);
    const recipe = recipeGraph?.[id] || recipeGraph?.[String(id)];
    if (!recipe) return;
    for (const [ingredientId] of recipe.ingredients || []) visit(ingredientId);
  };
  visit(targetItemId);
  return [...seen];
}

export function normalizeDynamicTargetInput(input) {
  const taskKey = normalizeText(input?.taskKey, 120);
  const itemName = normalizeText(input?.itemName, 120);
  const requiredQuantity = positiveInt(input?.requiredQuantity, null);
  const hqRequired = Boolean(input?.hqRequired);
  if (!/^craft:[A-Za-z0-9:_-]{1,110}$/.test(taskKey)) {
    throw new DynamicRecipeError("task_key_invalid", "製作task_keyが不正です。");
  }
  if (!itemName) throw new DynamicRecipeError("item_name_required", "製作品名がありません。");
  if (!requiredQuantity || requiredQuantity > 99) {
    throw new DynamicRecipeError("quantity_invalid", "必要数は1〜99の範囲で指定してください。");
  }
  return { taskKey, itemName, requiredQuantity, hqRequired };
}

export async function resolveDynamicCraftTarget(input, { fetchImpl = fetch } = {}) {
  const safe = normalizeDynamicTargetInput(input);
  const item = await searchItemExact(safe.itemName, fetchImpl);
  const graph = {};
  const warnings = [];
  const seen = new Set();

  const visit = async (itemId, depth) => {
    const id = positiveInt(itemId);
    if (!id || seen.has(id)) return;
    if (seen.size >= MAX_GRAPH_ITEMS) {
      throw new DynamicRecipeError("graph_too_large", `レシピ木が${MAX_GRAPH_ITEMS}品を超えたため停止しました。`);
    }
    seen.add(id);
    if (depth > MAX_RECIPE_DEPTH) {
      warnings.push(`depth_limit:${id}`);
      return;
    }
    const recipe = await resolveRecipe(id, fetchImpl);
    if (!recipe) return;
    graph[id] = {
      outputQuantity: recipe.outputQuantity,
      ingredients: recipe.ingredients.map(row => [row.itemId, row.amount])
    };
    if (depth === MAX_RECIPE_DEPTH) {
      if (recipe.ingredients.length) warnings.push(`depth_limit:${id}`);
      return;
    }
    for (const ingredient of recipe.ingredients) await visit(ingredient.itemId, depth + 1);
  };

  await visit(item.itemId, 0);
  if (!graph[item.itemId]) {
    throw new DynamicRecipeError("recipe_not_found", `「${safe.itemName}」の製作レシピを特定できませんでした。`);
  }
  const itemNames = await fetchItemNames([...seen], fetchImpl);
  itemNames[item.itemId] = item.englishName || itemNames[item.itemId] || safe.itemName;

  return {
    target: {
      taskKey: safe.taskKey,
      itemId: item.itemId,
      itemName: item.englishName || safe.itemName,
      requiredQuantity: safe.requiredQuantity,
      hqRequired: safe.hqRequired
    },
    recipeGraph: graph,
    itemNames,
    reachableItemIds: collectGraphItemIds(item.itemId, graph),
    source: "XIVAPI v2",
    warnings: [...new Set(warnings)]
  };
}

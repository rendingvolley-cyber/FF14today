import { RECIPE_GRAPH, itemName } from "./leve-cost-data.js";

const CRAFT_MINUTES_PER_SYNTHESIS = 1.25;

function finitePositive(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function ingredientUnitPrice(price) {
  const nq = finitePositive(price?.nq);
  const hq = finitePositive(price?.hq);
  if (nq && hq) return Math.min(nq, hq);
  return nq || hq || null;
}

function unitPrice(prices, itemId, hqOnly = false) {
  const row = prices?.[Number(itemId)] || prices?.[String(itemId)] || null;
  return hqOnly ? finitePositive(row?.hq) : ingredientUnitPrice(row);
}

function emptyWork() {
  return { gil: 0, purchases: [], crafts: [], missingPrices: [], complete: true };
}

function combineWorks(works) {
  const result = emptyWork();
  for (const work of works) {
    if (!work) continue;
    result.gil += Number(work.gil || 0);
    result.purchases.push(...(work.purchases || []));
    result.crafts.push(...(work.crafts || []));
    result.missingPrices.push(...(work.missingPrices || []));
    if (!work.complete) result.complete = false;
  }
  return result;
}

function buyWork(itemId, quantity, prices, { hqOnly = false } = {}) {
  const qty = Math.max(0, Number(quantity) || 0);
  if (!qty) return emptyWork();
  const price = unitPrice(prices, itemId, hqOnly);
  if (!price) {
    return {
      ...emptyWork(),
      complete: false,
      missingPrices: [Number(itemId)]
    };
  }
  return {
    ...emptyWork(),
    gil: price * qty,
    purchases: [{
      itemId: Number(itemId),
      itemName: itemName(itemId),
      quantity: qty,
      hq: Boolean(hqOnly),
      unitPrice: price,
      total: price * qty
    }]
  };
}

function craftAction(itemId, batches, outputQuantity) {
  const count = Math.max(0, Math.ceil(Number(batches) || 0));
  return count ? [{
    itemId: Number(itemId),
    itemName: itemName(itemId),
    syntheses: count,
    outputQuantity: count * Math.max(1, Number(outputQuantity) || 1)
  }] : [];
}

function craftFromRaw(itemId, quantity, prices, graph = RECIPE_GRAPH) {
  const recipe = graph[Number(itemId)];
  if (!recipe) return buyWork(itemId, quantity, prices);
  const batches = Math.ceil(Math.max(0, Number(quantity) || 0) / Math.max(1, Number(recipe.outputQuantity) || 1));
  const ingredientWorks = recipe.ingredients.map(([ingredientId, amount]) =>
    craftFromRaw(ingredientId, Number(amount) * batches, prices, graph)
  );
  const work = combineWorks(ingredientWorks);
  work.crafts.push(...craftAction(itemId, batches, recipe.outputQuantity));
  return work;
}

function craftMixed(itemId, quantity, prices, graph = RECIPE_GRAPH) {
  const recipe = graph[Number(itemId)];
  if (!recipe) return buyWork(itemId, quantity, prices);
  const batches = Math.ceil(Math.max(0, Number(quantity) || 0) / Math.max(1, Number(recipe.outputQuantity) || 1));
  const ingredientWorks = recipe.ingredients.map(([ingredientId, amount]) => {
    const needed = Number(amount) * batches;
    const buy = buyWork(ingredientId, needed, prices);
    const ingredientRecipe = graph[Number(ingredientId)];
    if (!ingredientRecipe) return buy;
    const craft = craftMixed(ingredientId, needed, prices, graph);
    if (!buy.complete) return craft;
    if (!craft.complete) return buy;
    return craft.gil < buy.gil ? craft : buy;
  });
  const work = combineWorks(ingredientWorks);
  work.crafts.push(...craftAction(itemId, batches, recipe.outputQuantity));
  return work;
}

function craftWithDirectPurchases(itemId, quantity, prices, graph = RECIPE_GRAPH) {
  const recipe = graph[Number(itemId)];
  if (!recipe) return buyWork(itemId, quantity, prices);
  const batches = Math.ceil(Math.max(0, Number(quantity) || 0) / Math.max(1, Number(recipe.outputQuantity) || 1));
  const work = combineWorks(recipe.ingredients.map(([ingredientId, amount]) =>
    buyWork(ingredientId, Number(amount) * batches, prices)
  ));
  work.crafts.push(...craftAction(itemId, batches, recipe.outputQuantity));
  return work;
}

function mergeActions(actions, kind) {
  const map = new Map();
  for (const action of actions || []) {
    const key = kind === "purchase" ? `${action.itemId}:${action.hq ? 1 : 0}` : String(action.itemId);
    const previous = map.get(key);
    if (!previous) {
      map.set(key, { ...action });
      continue;
    }
    if (kind === "purchase") {
      previous.quantity += Number(action.quantity || 0);
      previous.total += Number(action.total || 0);
    } else {
      previous.syntheses += Number(action.syntheses || 0);
      previous.outputQuantity += Number(action.outputQuantity || 0);
    }
  }
  return [...map.values()];
}

function estimatedMinutes(purchases, crafts) {
  const distinctPurchases = purchases.filter(row => Number(row.buyQuantity ?? row.quantity) > 0).length;
  const craftCount = crafts.reduce((sum, row) => sum + Math.max(0, Number(row.syntheses) || 0), 0);
  const shoppingMinutes = distinctPurchases ? 2 + Math.max(0, Math.ceil((distinctPurchases - 4) / 4)) : 0;
  const craftingMinutes = Math.ceil(craftCount * CRAFT_MINUTES_PER_SYNTHESIS);
  return Math.max(1, shoppingMinutes + craftingMinutes);
}

function finalizeRoute(key, label, work) {
  const purchases = mergeActions(work.purchases, "purchase");
  const crafts = mergeActions(work.crafts, "craft");
  const craftCount = crafts.reduce((sum, row) => sum + Math.max(0, Number(row.syntheses) || 0), 0);
  return {
    key,
    label,
    available: Boolean(work.complete),
    gil: work.complete ? Math.round(work.gil) : null,
    additionalGil: work.complete ? Math.round(work.gil) : null,
    inventoryOpportunityGil: 0,
    inventoryUsed: [],
    inventoryEvidenceApplied: false,
    estimatedMinutes: estimatedMinutes(purchases, crafts),
    craftCount,
    purchases,
    crafts,
    missingPriceItemIds: [...new Set(work.missingPrices.map(Number))]
  };
}

function routeSignature(route) {
  const purchases = route.purchases
    .map(row => `${row.itemId}:${row.hq ? 1 : 0}:${row.quantity}`)
    .sort()
    .join("|");
  const crafts = route.crafts
    .map(row => `${row.itemId}:${row.syntheses}`)
    .sort()
    .join("|");
  return `${route.available}:${route.gil}:${purchases}:${crafts}`;
}

function dedupeRoutes(routes) {
  const seen = new Set();
  return routes.filter(route => {
    const signature = routeSignature(route);
    if (seen.has(signature)) return false;
    seen.add(signature);
    return true;
  });
}

function inventoryQuantityForPurchase(inventoryRow, hqOnly) {
  if (!inventoryRow) return 0;
  if (hqOnly) {
    const hq = Number(inventoryRow.hq_quantity);
    return Number.isFinite(hq) && hq > 0 ? Math.floor(hq) : 0;
  }
  const quantity = Number(inventoryRow.quantity);
  return Number.isFinite(quantity) && quantity > 0 ? Math.floor(quantity) : 0;
}

export function applyInventoryEvidenceToRoute(route, inventory = {}) {
  if (!route?.available || !Number.isFinite(route.gil)) return { ...route };
  const remainingByItem = new Map();
  const purchases = [];
  const inventoryUsed = [];
  let additionalGil = 0;
  let inventoryOpportunityGil = 0;
  let evidenceApplied = false;

  for (const purchase of route.purchases || []) {
    const itemId = Number(purchase.itemId);
    const inventoryRow = inventory?.[itemId] || inventory?.[String(itemId)] || null;
    if (inventoryRow) evidenceApplied = true;
    const availabilityKey = `${itemId}:${purchase.hq ? "hq" : "any"}`;
    if (!remainingByItem.has(availabilityKey)) {
      remainingByItem.set(availabilityKey, inventoryQuantityForPurchase(inventoryRow, Boolean(purchase.hq)));
    }
    const available = remainingByItem.get(availabilityKey) || 0;
    const required = Math.max(0, Number(purchase.quantity) || 0);
    const heldQuantity = Math.min(required, available);
    const buyQuantity = Math.max(0, required - heldQuantity);
    remainingByItem.set(availabilityKey, Math.max(0, available - heldQuantity));
    const unit = Math.max(0, Number(purchase.unitPrice) || 0);
    const additionalTotal = buyQuantity * unit;
    const inventoryOpportunityTotal = heldQuantity * unit;
    additionalGil += additionalTotal;
    inventoryOpportunityGil += inventoryOpportunityTotal;
    purchases.push({
      ...purchase,
      heldQuantity,
      buyQuantity,
      additionalTotal,
      inventoryOpportunityTotal
    });
    if (heldQuantity > 0) {
      inventoryUsed.push({
        itemId,
        itemName: purchase.itemName,
        quantity: heldQuantity,
        hq: Boolean(purchase.hq),
        unitPrice: unit,
        opportunityTotal: inventoryOpportunityTotal
      });
    }
  }

  return {
    ...route,
    additionalGil: Math.round(additionalGil),
    inventoryOpportunityGil: Math.round(inventoryOpportunityGil),
    inventoryUsed,
    inventoryEvidenceApplied: evidenceApplied,
    purchases,
    estimatedMinutes: estimatedMinutes(purchases, route.crafts || [])
  };
}

function clampEnergy(value) {
  const n = Math.round(Number(value) || 3);
  return Math.max(1, Math.min(5, n));
}

function recommendationWeights(energy) {
  const e = clampEnergy(energy);
  if (e === 1) return { gil: 0.15, time: 0.85 };
  if (e === 2) return { gil: 0.30, time: 0.70 };
  if (e === 4) return { gil: 0.65, time: 0.35 };
  if (e === 5) return { gil: 0.75, time: 0.25 };
  return { gil: 0.50, time: 0.50 };
}

function normalize(value, min, max) {
  if (max <= min) return 0;
  return (value - min) / (max - min);
}

export function chooseRecommendedRoute(routes, {
  energy = 3,
  availableMinutes = 60,
  preferTraining = true
} = {}) {
  const candidates = routes.filter(route => route.available && Number.isFinite(route.gil));
  if (!candidates.length) return null;
  const minGil = Math.min(...candidates.map(route => route.gil));
  const maxGil = Math.max(...candidates.map(route => route.gil));
  const minTime = Math.min(...candidates.map(route => route.estimatedMinutes));
  const maxTime = Math.max(...candidates.map(route => route.estimatedMinutes));
  const weights = recommendationWeights(energy);
  const timeBudget = Math.max(1, Number(availableMinutes) || 60);
  const trainingBonus = clampEnergy(energy) >= 3 ? 0.10 : 0.04;

  return [...candidates]
    .map(route => {
      let score = weights.gil * normalize(route.gil, minGil, maxGil)
        + weights.time * normalize(route.estimatedMinutes, minTime, maxTime);
      if (route.estimatedMinutes > timeBudget) score += 5;
      if (preferTraining) score += route.craftCount > 0 ? -trainingBonus : trainingBonus;
      return { route, score };
    })
    .sort((a, b) => a.score - b.score || a.route.gil - b.route.gil || a.route.estimatedMinutes - b.route.estimatedMinutes)[0].route;
}

function recommendationReason(recommended, routes, preferTraining) {
  const candidates = routes.filter(route => route.available && Number.isFinite(route.gil));
  if (!recommended || !candidates.length) return "市場価格を十分に比較できませんでした。";
  const cheapest = [...candidates].sort((a, b) => a.gil - b.gil || a.estimatedMinutes - b.estimatedMinutes)[0];
  const fastest = [...candidates].sort((a, b) => a.estimatedMinutes - b.estimatedMinutes || a.gil - b.gil)[0];
  const training = preferTraining && recommended.craftCount > 0 ? " リーヴ対象の製作も自分で残せます。" : "";
  const inventory = recommended.inventoryOpportunityGil > 0
    ? ` 手持ちを市場価値約${recommended.inventoryOpportunityGil.toLocaleString("ja-JP")}G分使うため、追加支出は約${recommended.additionalGil.toLocaleString("ja-JP")}Gです。`
    : "";

  if (recommended.key === cheapest.key && recommended.key === fastest.key) {
    return `この比較では最安かつ最短です。${training}${inventory}`.trim();
  }
  if (recommended.key === cheapest.key) {
    const saved = Math.max(0, fastest.gil - recommended.gil);
    const extraMinutes = Math.max(0, recommended.estimatedMinutes - fastest.estimatedMinutes);
    return `最安。最短ルートより約${saved.toLocaleString("ja-JP")}G節約、手間は約${extraMinutes}分増です。${training}${inventory}`.trim();
  }
  if (recommended.key === fastest.key) {
    const extraGil = Math.max(0, recommended.gil - cheapest.gil);
    const savedMinutes = Math.max(0, cheapest.estimatedMinutes - recommended.estimatedMinutes);
    const perMinute = savedMinutes > 0 ? Math.round(extraGil / savedMinutes) : null;
    return `最短。最安ルートより約${extraGil.toLocaleString("ja-JP")}G追加で約${savedMinutes}分短縮${perMinute ? `（1分あたり約${perMinute.toLocaleString("ja-JP")}G）` : ""}。${training}${inventory}`.trim();
  }
  const extraGil = Math.max(0, recommended.gil - cheapest.gil);
  const savedMinutes = Math.max(0, cheapest.estimatedMinutes - recommended.estimatedMinutes);
  const perMinute = savedMinutes > 0 ? Math.round(extraGil / savedMinutes) : null;
  return `最安より約${extraGil.toLocaleString("ja-JP")}G追加で約${savedMinutes}分短縮${perMinute ? `（1分あたり約${perMinute.toLocaleString("ja-JP")}G）` : ""}。${training}${inventory}`.trim();
}

export function buildLeveCostAdvice(target, prices, options = {}) {
  if (!target || !RECIPE_GRAPH[target.itemId]) return null;
  const topRecipe = RECIPE_GRAPH[target.itemId];
  const hasCraftableDirectIngredient = topRecipe.ingredients.some(([itemId]) => Boolean(RECIPE_GRAPH[itemId]));
  const baseRoutes = dedupeRoutes([
    finalizeRoute(
      "buy_finished",
      target.hqRequired ? "完成品HQを買う" : "完成品を買う",
      buyWork(target.itemId, target.requiredQuantity, prices, { hqOnly: target.hqRequired })
    ),
    finalizeRoute(
      "buy_direct",
      hasCraftableDirectIngredient ? "中間素材を買って最終品だけ作る" : "素材を買って最終品だけ作る",
      craftWithDirectPurchases(target.itemId, target.requiredQuantity, prices)
    ),
    finalizeRoute(
      "mixed",
      "安い中間工程だけ自作する",
      craftMixed(target.itemId, target.requiredQuantity, prices)
    ),
    finalizeRoute(
      "craft_raw",
      "原材料から全部作る",
      craftFromRaw(target.itemId, target.requiredQuantity, prices)
    )
  ]);
  const routes = baseRoutes.map(route => applyInventoryEvidenceToRoute(route, options.inventory || {}));
  const recommended = chooseRecommendedRoute(routes, options);
  return {
    taskKey: target.taskKey,
    itemId: target.itemId,
    itemName: target.itemName,
    requiredQuantity: target.requiredQuantity,
    hqRequired: target.hqRequired,
    inventoryEvidenceApplied: routes.some(route => route.inventoryEvidenceApplied),
    routes,
    recommendedKey: recommended?.key || null,
    recommendationReason: recommendationReason(recommended, routes, options.preferTraining !== false)
  };
}

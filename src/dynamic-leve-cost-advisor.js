import {
  applyInventoryEvidenceToRoute,
  chooseRecommendedRoute,
  quotePriceBands
} from "./leve-cost-advisor.js";

const CRAFT_MINUTES_PER_SYNTHESIS = 1.25;

function finitePositive(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function positiveQuantity(value) {
  const n = Math.floor(Number(value) || 0);
  return n > 0 ? n : 0;
}

function nameFor(itemId, itemNames) {
  return itemNames?.[Number(itemId)] || itemNames?.[String(itemId)] || `Item ${Number(itemId)}`;
}

function normalizeOffers(rows) {
  return (Array.isArray(rows) ? rows : [])
    .map(row => ({
      quantity: positiveQuantity(row?.quantity),
      unitPrice: finitePositive(row?.unitPrice ?? row?.pricePerUnit)
    }))
    .filter(row => row.quantity > 0 && row.unitPrice)
    .sort((a, b) => a.unitPrice - b.unitPrice);
}

function quoteMarket(prices, itemId, quantity, hqOnly = false) {
  const qty = positiveQuantity(quantity);
  if (!qty) return { complete: true, total: 0, averageUnitPrice: 0, pricingMode: "none", priceBands: [] };
  const row = prices?.[Number(itemId)] || prices?.[String(itemId)] || null;
  const nqOffers = normalizeOffers(row?.nqOffers);
  const hqOffers = normalizeOffers(row?.hqOffers);
  const hasOfferData = hqOnly ? Array.isArray(row?.hqOffers) : (Array.isArray(row?.nqOffers) || Array.isArray(row?.hqOffers));
  if (hasOfferData) {
    const offers = hqOnly ? hqOffers : [...nqOffers, ...hqOffers].sort((a, b) => a.unitPrice - b.unitPrice);
    const quote = quotePriceBands(offers, qty);
    return { ...quote, pricingMode: "listing_quantity", priceBands: offers };
  }
  const nq = finitePositive(row?.nq);
  const hq = finitePositive(row?.hq);
  const unit = hqOnly ? hq : (nq && hq ? Math.min(nq, hq) : nq || hq);
  if (!unit) return { complete: false, total: null, averageUnitPrice: null, pricingMode: "missing", priceBands: [] };
  return {
    complete: true,
    total: unit * qty,
    averageUnitPrice: unit,
    pricingMode: "unit_fallback",
    priceBands: [],
    fallbackUnitPrice: unit
  };
}

function emptyWork() {
  return { purchases: [], crafts: [], complete: true, missingPrices: [] };
}

function combineWorks(works) {
  const out = emptyWork();
  for (const work of works || []) {
    if (!work) continue;
    out.purchases.push(...(work.purchases || []));
    out.crafts.push(...(work.crafts || []));
    out.missingPrices.push(...(work.missingPrices || []));
    if (!work.complete) out.complete = false;
  }
  return out;
}

function buyWork(itemId, quantity, prices, itemNames, { hqOnly = false } = {}) {
  const qty = positiveQuantity(quantity);
  if (!qty) return emptyWork();
  const quote = quoteMarket(prices, itemId, qty, hqOnly);
  if (!quote.complete) {
    return { ...emptyWork(), complete: false, missingPrices: [Number(itemId)] };
  }
  return {
    ...emptyWork(),
    purchases: [{
      itemId: Number(itemId),
      itemName: nameFor(itemId, itemNames),
      quantity: qty,
      hq: Boolean(hqOnly),
      unitPrice: quote.averageUnitPrice,
      total: quote.total,
      pricingMode: quote.pricingMode,
      priceBands: quote.priceBands,
      fallbackUnitPrice: quote.fallbackUnitPrice || null,
      marketComplete: true
    }]
  };
}

function craftAction(itemId, batches, outputQuantity, itemNames) {
  const syntheses = positiveQuantity(batches);
  if (!syntheses) return [];
  return [{
    itemId: Number(itemId),
    itemName: nameFor(itemId, itemNames),
    syntheses,
    outputQuantity: syntheses * Math.max(1, Number(outputQuantity) || 1)
  }];
}

function craftFromRaw(itemId, quantity, prices, graph, itemNames) {
  const recipe = graph?.[Number(itemId)] || graph?.[String(itemId)];
  if (!recipe) return buyWork(itemId, quantity, prices, itemNames);
  const batches = Math.ceil(positiveQuantity(quantity) / Math.max(1, Number(recipe.outputQuantity) || 1));
  const work = combineWorks((recipe.ingredients || []).map(([ingredientId, amount]) =>
    craftFromRaw(ingredientId, Number(amount) * batches, prices, graph, itemNames)
  ));
  work.crafts.push(...craftAction(itemId, batches, recipe.outputQuantity, itemNames));
  return work;
}

function workGil(work) {
  return (work?.purchases || []).reduce((sum, row) => sum + Number(row.total || 0), 0);
}

function craftMixed(itemId, quantity, prices, graph, itemNames) {
  const recipe = graph?.[Number(itemId)] || graph?.[String(itemId)];
  if (!recipe) return buyWork(itemId, quantity, prices, itemNames);
  const batches = Math.ceil(positiveQuantity(quantity) / Math.max(1, Number(recipe.outputQuantity) || 1));
  const parts = (recipe.ingredients || []).map(([ingredientId, amount]) => {
    const needed = Number(amount) * batches;
    const buy = buyWork(ingredientId, needed, prices, itemNames);
    const nested = graph?.[Number(ingredientId)] || graph?.[String(ingredientId)];
    if (!nested) return buy;
    const craft = craftMixed(ingredientId, needed, prices, graph, itemNames);
    if (!buy.complete) return craft;
    if (!craft.complete) return buy;
    return workGil(craft) < workGil(buy) ? craft : buy;
  });
  const work = combineWorks(parts);
  work.crafts.push(...craftAction(itemId, batches, recipe.outputQuantity, itemNames));
  return work;
}

function craftDirect(itemId, quantity, prices, graph, itemNames) {
  const recipe = graph?.[Number(itemId)] || graph?.[String(itemId)];
  if (!recipe) return buyWork(itemId, quantity, prices, itemNames);
  const batches = Math.ceil(positiveQuantity(quantity) / Math.max(1, Number(recipe.outputQuantity) || 1));
  const work = combineWorks((recipe.ingredients || []).map(([ingredientId, amount]) =>
    buyWork(ingredientId, Number(amount) * batches, prices, itemNames)
  ));
  work.crafts.push(...craftAction(itemId, batches, recipe.outputQuantity, itemNames));
  return work;
}

function repricePurchase(action) {
  if (action.pricingMode === "listing_quantity") {
    const quote = quotePriceBands(action.priceBands, action.quantity);
    if (!quote.complete) return { ...action, marketComplete: false, total: null, unitPrice: null };
    return { ...action, marketComplete: true, total: quote.total, unitPrice: quote.averageUnitPrice };
  }
  const unit = finitePositive(action.fallbackUnitPrice ?? action.unitPrice);
  if (!unit) return { ...action, marketComplete: false, total: null, unitPrice: null };
  return {
    ...action,
    pricingMode: "unit_fallback",
    fallbackUnitPrice: unit,
    marketComplete: true,
    unitPrice: unit,
    total: unit * positiveQuantity(action.quantity)
  };
}

function mergePurchases(purchases) {
  const map = new Map();
  for (const purchase of purchases || []) {
    const key = `${purchase.itemId}:${purchase.hq ? 1 : 0}`;
    const previous = map.get(key);
    if (!previous) {
      map.set(key, repricePurchase({ ...purchase }));
      continue;
    }
    previous.quantity += Number(purchase.quantity || 0);
    map.set(key, repricePurchase(previous));
  }
  return [...map.values()];
}

function mergeCrafts(crafts) {
  const map = new Map();
  for (const craft of crafts || []) {
    const key = String(craft.itemId);
    const previous = map.get(key);
    if (!previous) {
      map.set(key, { ...craft });
      continue;
    }
    previous.syntheses += Number(craft.syntheses || 0);
    previous.outputQuantity += Number(craft.outputQuantity || 0);
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
  const purchases = mergePurchases(work.purchases);
  const crafts = mergeCrafts(work.crafts);
  const marketComplete = purchases.every(row => row.marketComplete !== false && Number.isFinite(row.total));
  const available = Boolean(work.complete) && marketComplete;
  const gil = available ? purchases.reduce((sum, row) => sum + Number(row.total || 0), 0) : null;
  const craftCount = crafts.reduce((sum, row) => sum + Math.max(0, Number(row.syntheses) || 0), 0);
  return {
    key,
    label,
    available,
    gil: available ? Math.round(gil) : null,
    additionalGil: available ? Math.round(gil) : null,
    inventoryOpportunityGil: 0,
    inventoryUsed: [],
    inventoryEvidenceApplied: false,
    estimatedMinutes: estimatedMinutes(purchases, crafts),
    craftCount,
    purchases,
    crafts,
    missingPriceItemIds: [...new Set((work.missingPrices || []).map(Number))]
  };
}

function dedupeRoutes(routes) {
  const seen = new Set();
  return routes.filter(route => {
    const signature = `${route.available}:${route.gil}:${route.purchases.map(row => `${row.itemId}:${row.quantity}:${row.hq ? 1 : 0}`).sort().join("|")}:${route.crafts.map(row => `${row.itemId}:${row.syntheses}`).sort().join("|")}`;
    if (seen.has(signature)) return false;
    seen.add(signature);
    return true;
  });
}

function recommendationReason(recommended, routes, preferTraining) {
  const candidates = routes.filter(route => route.available && Number.isFinite(route.gil));
  if (!recommended || !candidates.length) return "市場価格を十分に比較できませんでした。";
  const cheapest = [...candidates].sort((a, b) => a.gil - b.gil || a.estimatedMinutes - b.estimatedMinutes)[0];
  const fastest = [...candidates].sort((a, b) => a.estimatedMinutes - b.estimatedMinutes || a.gil - b.gil)[0];
  const training = preferTraining && recommended.craftCount > 0 ? " 製作経験も残せます。" : "";
  const inventory = recommended.inventoryOpportunityGil > 0
    ? ` 手持ちを市場価値約${recommended.inventoryOpportunityGil.toLocaleString("ja-JP")}G分使うため、追加支出は約${recommended.additionalGil.toLocaleString("ja-JP")}Gです。`
    : "";
  if (recommended.key === cheapest.key && recommended.key === fastest.key) return `この比較では最安かつ最短です。${training}${inventory}`.trim();
  if (recommended.key === cheapest.key) return `実質コストが最安です。${training}${inventory}`.trim();
  if (recommended.key === fastest.key) {
    const extraGil = Math.max(0, recommended.gil - cheapest.gil);
    const savedMinutes = Math.max(0, cheapest.estimatedMinutes - recommended.estimatedMinutes);
    const perMinute = savedMinutes > 0 ? Math.round(extraGil / savedMinutes) : null;
    return `最短。最安より約${extraGil.toLocaleString("ja-JP")}G追加で約${savedMinutes}分短縮${perMinute ? `（1分あたり約${perMinute.toLocaleString("ja-JP")}G）` : ""}。${training}${inventory}`.trim();
  }
  return `ギルと時間の中間案です。${training}${inventory}`.trim();
}

export function buildDynamicLeveCostAdvice(target, recipeGraph, itemNames, prices, options = {}) {
  const topRecipe = recipeGraph?.[Number(target?.itemId)] || recipeGraph?.[String(target?.itemId)];
  if (!target || !topRecipe) return null;
  const hasCraftableDirectIngredient = (topRecipe.ingredients || []).some(([itemId]) => Boolean(recipeGraph?.[Number(itemId)] || recipeGraph?.[String(itemId)]));
  const baseRoutes = dedupeRoutes([
    finalizeRoute(
      "buy_finished",
      target.hqRequired ? "完成品HQを買う" : "完成品を買う",
      buyWork(target.itemId, target.requiredQuantity, prices, itemNames, { hqOnly: target.hqRequired })
    ),
    finalizeRoute(
      "buy_direct",
      hasCraftableDirectIngredient ? "中間素材を買って最終品だけ作る" : "素材を買って最終品だけ作る",
      craftDirect(target.itemId, target.requiredQuantity, prices, recipeGraph, itemNames)
    ),
    finalizeRoute(
      "mixed",
      "安い中間工程だけ自作する",
      craftMixed(target.itemId, target.requiredQuantity, prices, recipeGraph, itemNames)
    ),
    finalizeRoute(
      "craft_raw",
      "原材料から全部作る",
      craftFromRaw(target.itemId, target.requiredQuantity, prices, recipeGraph, itemNames)
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
    dynamicRecipeGraph: true,
    routes,
    recommendedKey: recommended?.key || null,
    recommendationReason: recommendationReason(recommended, routes, options.preferTraining !== false)
  };
}

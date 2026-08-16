function positiveInt(value) {
  const n = Math.floor(Number(value) || 0);
  return n > 0 ? n : 0;
}

export function recipeIssueLabel(code) {
  switch (String(code || "")) {
    case "recipe_not_found": return "製作レシピを取得できず";
    case "recipe_ambiguous": return "複数レシピのため自動選択を停止";
    case "item_not_found": return "品名をXIVAPIで特定できず";
    case "item_ambiguous": return "同名Item候補が複数あるため自動選択を停止";
    case "xivapi_unreachable": return "XIVAPIへ接続できず";
    case "xivapi_http": return "XIVAPI取得エラー";
    case "xivapi_json": return "XIVAPI応答を読み取れず";
    case "market_unavailable": return "現在の市場価格を取得できず";
    default: return "製作レシピを安全に特定できず";
  }
}

export function marketCostFromListings(listings, quantity) {
  const required = positiveInt(quantity);
  if (!required) return { available: true, gil: 0, quantity: 0, listed_quantity: 0 };
  const offers = (Array.isArray(listings) ? listings : [])
    .map(row => ({
      unitPrice: Math.round(Number(row?.pricePerUnit)),
      quantity: positiveInt(row?.quantity)
    }))
    .filter(row => Number.isFinite(row.unitPrice) && row.unitPrice > 0 && row.quantity > 0)
    .sort((a, b) => a.unitPrice - b.unitPrice);

  const listedQuantity = offers.reduce((sum, row) => sum + row.quantity, 0);
  if (listedQuantity < required) {
    return { available: false, gil: null, quantity: required, listed_quantity: listedQuantity };
  }

  let remaining = required;
  let gil = 0;
  for (const offer of offers) {
    if (!remaining) break;
    const take = Math.min(remaining, offer.quantity);
    gil += take * offer.unitPrice;
    remaining -= take;
  }
  return { available: remaining === 0, gil: remaining === 0 ? Math.round(gil) : null, quantity: required, listed_quantity: listedQuantity };
}

export function buildMarketFallbackProcurement({
  quantity,
  quantityBasis = "requested_quantity",
  recipeError = null,
  itemError = null,
  itemId = null,
  marketCost = null
} = {}) {
  const required = positiveInt(quantity);
  const issue = recipeIssueLabel(itemError || recipeError);

  if (itemError || !positiveInt(itemId)) {
    return {
      quantity_to_acquire: required,
      quantity_basis: quantityBasis,
      status: "ok",
      market_buy: null,
      craft_raw: null,
      recommended_route: { key: "unresolved", label: issue, available: false, gil: null, materials: [], crafts: [] },
      recommendation_reason: `${issue}。マケボ価格も自動取得できませんでした。`,
      comparison_issue: { code: itemError || recipeError || "item_unresolved", label: issue }
    };
  }

  if (marketCost?.available && Number.isFinite(Number(marketCost.gil))) {
    const route = {
      key: "buy_finished_fallback",
      label: `完成品を買う（${issue} / 自作費未比較）`,
      available: true,
      gil: Math.round(Number(marketCost.gil)),
      estimated_minutes: 2,
      craft_count: 0,
      materials: [],
      crafts: []
    };
    return {
      quantity_to_acquire: required,
      quantity_basis: quantityBasis,
      status: "ok",
      market_buy: route,
      craft_raw: null,
      recommended_route: route,
      recommendation_reason: `完成品のマケボ価格は取得できました。製作費は「${issue}」のため未比較です。`,
      comparison_issue: { code: recipeError || "recipe_unavailable", label: issue }
    };
  }

  const label = `${issue} / 現在出品なし`;
  return {
    quantity_to_acquire: required,
    quantity_basis: quantityBasis,
    status: "ok",
    market_buy: { key: "buy_finished_fallback", label: "完成品を買う", available: false, gil: null, materials: [], crafts: [] },
    craft_raw: null,
    recommended_route: { key: "unavailable", label, available: false, gil: null, materials: [], crafts: [] },
    recommendation_reason: `${issue}。さらに必要数を満たす現在出品も確認できませんでした。`,
    comparison_issue: { code: recipeError || "market_unavailable", label }
  };
}

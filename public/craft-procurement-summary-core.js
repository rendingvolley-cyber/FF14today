export function parseCraftDeliveryTitle(title) {
  const text = String(title || "").trim();
  const quoted = text.match(/「([^」]{1,120})」/);
  if (!quoted) return null;
  const itemName = quoted[1].trim();
  const quantity = Math.max(1, Math.min(99, Number(text.match(/(\d{1,2})\s*個/)?.[1] || 1)));
  return itemName ? { itemName, quantity, hqRequired: /HQ/i.test(text) } : null;
}

function route(advice, key) {
  return (advice?.routes || []).find(row => row?.key === key) || null;
}

function money(value) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
}

function signedMoney(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n) : null;
}

function purchaseQuantity(row) {
  return Math.max(0, Number(row?.buyQuantity ?? row?.quantity) || 0);
}

export function procurementModel(payload) {
  const advice = payload?.advice;
  if (!advice) return null;
  const buyFinished = route(advice, "buy_finished");
  const craftRaw = route(advice, "craft_raw");
  const recommended = route(advice, advice?.recommendedKey) || (advice?.routes || []).find(row => row?.available) || null;
  const materialRoute = craftRaw?.purchases?.length ? craftRaw : recommended;
  const reward = payload?.leve_reward_market_comparison || null;
  return {
    item_name: advice.itemName || "製作品",
    required_quantity: Math.max(1, Number(advice.requiredQuantity) || 1),
    buy_finished_gil: money(buyFinished?.additionalGil ?? buyFinished?.gil),
    craft_raw_gil: money(craftRaw?.additionalGil ?? craftRaw?.gil),
    recommended_key: recommended?.key || null,
    recommended_label: recommended?.label || null,
    recommended_gil: money(recommended?.additionalGil ?? recommended?.gil),
    recommendation_reason: advice?.recommendationReason || null,
    market_age_minutes: Number.isFinite(Number(payload?.market_age_minutes)) ? Math.max(0, Math.round(Number(payload.market_age_minutes))) : null,
    reward_base_gil: money(reward?.base_gil),
    reward_hq_gil: money(reward?.hq_gil),
    finished_nq_market_gil: money(reward?.market_nq_gil),
    finished_hq_market_gil: money(reward?.market_hq_gil),
    net_nq_buy_gil: signedMoney(reward?.net_nq_buy_gil),
    net_hq_buy_gil: signedMoney(reward?.net_hq_buy_gil),
    net_hq_craft_gil: signedMoney(reward?.net_hq_craft_gil),
    reward_market_age_minutes: Number.isFinite(Number(reward?.market_age_minutes)) ? Math.max(0, Math.round(Number(reward.market_age_minutes))) : null,
    materials: (materialRoute?.purchases || [])
      .map(row => ({
        item_id: row?.itemId || null,
        item_name: row?.itemName || "素材",
        quantity: purchaseQuantity(row),
        total_gil: money(row?.additionalTotal ?? row?.total)
      }))
      .filter(row => row.quantity > 0)
  };
}

export function aggregateCraftProcurement(models) {
  const rows = (models || []).filter(Boolean);
  let buy = 0;
  let raw = 0;
  let recommended = 0;
  let rewardBase = 0;
  let rewardHq = 0;
  let finishedNq = 0;
  let finishedHq = 0;
  let netNq = 0;
  let netHq = 0;
  let netHqCraft = 0;
  let buyKnown = 0;
  let rawKnown = 0;
  let recommendedKnown = 0;
  let rewardBaseKnown = 0;
  let rewardHqKnown = 0;
  let finishedNqKnown = 0;
  let finishedHqKnown = 0;
  let netNqKnown = 0;
  let netHqKnown = 0;
  let netHqCraftKnown = 0;
  const materials = new Map();

  for (const model of rows) {
    if (model.buy_finished_gil != null) { buy += model.buy_finished_gil; buyKnown += 1; }
    if (model.craft_raw_gil != null) { raw += model.craft_raw_gil; rawKnown += 1; }
    if (model.recommended_gil != null) { recommended += model.recommended_gil; recommendedKnown += 1; }
    if (model.reward_base_gil != null) { rewardBase += model.reward_base_gil; rewardBaseKnown += 1; }
    if (model.reward_hq_gil != null) { rewardHq += model.reward_hq_gil; rewardHqKnown += 1; }
    if (model.finished_nq_market_gil != null) { finishedNq += model.finished_nq_market_gil; finishedNqKnown += 1; }
    if (model.finished_hq_market_gil != null) { finishedHq += model.finished_hq_market_gil; finishedHqKnown += 1; }
    if (model.net_nq_buy_gil != null) { netNq += model.net_nq_buy_gil; netNqKnown += 1; }
    if (model.net_hq_buy_gil != null) { netHq += model.net_hq_buy_gil; netHqKnown += 1; }
    if (model.net_hq_craft_gil != null) { netHqCraft += model.net_hq_craft_gil; netHqCraftKnown += 1; }
    for (const material of model.materials || []) {
      const key = String(material.item_id || material.item_name);
      const current = materials.get(key) || { ...material, quantity: 0, total_gil: 0, priced: true };
      current.quantity += Number(material.quantity || 0);
      if (material.total_gil == null) current.priced = false;
      else current.total_gil += Number(material.total_gil || 0);
      materials.set(key, current);
    }
  }

  const total = (value, known) => rows.length && known === rows.length ? Math.round(value) : null;
  return {
    count: rows.length,
    buy_finished_gil: total(buy, buyKnown),
    craft_raw_gil: total(raw, rawKnown),
    recommended_gil: total(recommended, recommendedKnown),
    reward_base_gil: total(rewardBase, rewardBaseKnown),
    reward_hq_gil: total(rewardHq, rewardHqKnown),
    finished_nq_market_gil: total(finishedNq, finishedNqKnown),
    finished_hq_market_gil: total(finishedHq, finishedHqKnown),
    net_nq_buy_gil: total(netNq, netNqKnown),
    net_hq_buy_gil: total(netHq, netHqKnown),
    net_hq_craft_gil: total(netHqCraft, netHqCraftKnown),
    materials: [...materials.values()]
      .map(row => ({ ...row, quantity: Math.round(row.quantity), total_gil: row.priced ? Math.round(row.total_gil) : null }))
      .sort((a, b) => String(a.item_name).localeCompare(String(b.item_name), "ja"))
  };
}

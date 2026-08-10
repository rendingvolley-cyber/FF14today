import { LEVE_TARGETS, collectReachableItemIds } from "./leve-cost-data.js";

function normalizeText(value, max = 180) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

function nullableInt(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isInteger(n) && n >= 0 ? n : null;
}

function clampConfidence(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0;
}

export function allowedLeveInventoryItemIds() {
  const ids = new Set();
  for (const target of Object.values(LEVE_TARGETS)) {
    for (const itemId of collectReachableItemIds(target)) ids.add(Number(itemId));
  }
  return ids;
}

export function sanitizeInventoryAnalysis(parsed, model = null) {
  const items = (Array.isArray(parsed?.items) ? parsed.items : [])
    .slice(0, 60)
    .map((entry, index) => ({
      row_index: index,
      item_name: normalizeText(entry?.item_name, 160),
      quantity: nullableInt(entry?.quantity),
      hq_quantity: nullableInt(entry?.hq_quantity),
      confidence: clampConfidence(entry?.confidence)
    }))
    .filter(entry => entry.item_name && entry.quantity !== null && entry.quantity >= 0 && entry.confidence >= 0.7);

  const recognized = Boolean(parsed?.recognized) && items.length > 0;
  return {
    page_type: recognized ? "inventory_items" : "unknown",
    confidence: clampConfidence(parsed?.confidence),
    model,
    inventory_items: recognized ? { items } : null,
    journal_entries: [],
    achievement_entries: [],
    crafter_stats: null,
    gatherer_stats: null
  };
}

export function mergeResolvedInventoryRows(rows) {
  const byId = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    const itemId = Number(row?.item_id);
    const quantity = nullableInt(row?.quantity);
    const hqQuantity = nullableInt(row?.hq_quantity);
    if (!Number.isInteger(itemId) || quantity === null) continue;
    const previous = byId.get(itemId);
    if (!previous) {
      byId.set(itemId, {
        item_id: itemId,
        item_name: normalizeText(row.item_name, 160),
        quantity,
        hq_quantity: hqQuantity,
        confidence: clampConfidence(row.confidence)
      });
      continue;
    }
    previous.quantity = Math.max(previous.quantity, quantity);
    if (hqQuantity !== null) previous.hq_quantity = Math.max(previous.hq_quantity ?? 0, hqQuantity);
    previous.confidence = Math.max(previous.confidence, clampConfidence(row.confidence));
  }
  return [...byId.values()];
}

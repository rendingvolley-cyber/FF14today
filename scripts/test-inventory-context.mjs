import assert from "node:assert/strict";
import {
  allowedLeveInventoryItemIds,
  mergeResolvedInventoryRows,
  sanitizeInventoryAnalysis
} from "../src/inventory-context.js";

const allowed = allowedLeveInventoryItemIds();
assert.ok(allowed.has(44019), "Ginseng Lumber must be in the current leve inventory allowlist");
assert.ok(allowed.has(13), "Water Crystal must be reachable from a supported leve recipe");

const analysis = sanitizeInventoryAnalysis({
  recognized: true,
  confidence: 0.93,
  items: [
    { item_name: "オタネニンジン材", quantity: 12, hq_quantity: null, confidence: 0.91 },
    { item_name: "ウォータークリスタル", quantity: 44, hq_quantity: null, confidence: 0.87 },
    { item_name: "怪しい文字", quantity: 5, hq_quantity: null, confidence: 0.45 },
    { item_name: "数量なし", quantity: null, hq_quantity: null, confidence: 0.95 }
  ]
}, "test-model");
assert.equal(analysis.page_type, "inventory_items");
assert.equal(analysis.inventory_items.items.length, 2, "only confident rows with a visible held quantity should survive");
assert.equal(analysis.inventory_items.items[0].quantity, 12);

const merged = mergeResolvedInventoryRows([
  { item_id: 44019, item_name: "Ginseng Lumber", quantity: 2, hq_quantity: null, confidence: 0.8 },
  { item_id: 44019, item_name: "Ginseng Lumber", quantity: 5, hq_quantity: 1, confidence: 0.9 },
  { item_id: 13, item_name: "Water Crystal", quantity: 30, hq_quantity: null, confidence: 0.88 }
]);
assert.equal(merged.length, 2);
const lumber = merged.find(row => row.item_id === 44019);
assert.equal(lumber.quantity, 5);
assert.equal(lumber.hq_quantity, 1);
assert.equal(lumber.confidence, 0.9);

const unknown = sanitizeInventoryAnalysis({ recognized: false, confidence: 0.2, items: [] });
assert.equal(unknown.page_type, "unknown");
assert.equal(unknown.inventory_items, null);

console.log("inventory context tests: ok");

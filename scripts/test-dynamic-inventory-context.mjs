import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  japanDateKey,
  resolveVisibleInventoryRows
} from "../src/dynamic-inventory-context.js";

const aliases = [
  {
    item_id: 9001,
    display_name: "Dynamic Ingot",
    english_name: "Dynamic Ingot",
    japanese_name: "動的インゴット"
  },
  {
    item_id: 9003,
    display_name: "Dynamic Ore",
    english_name: "Dynamic Ore",
    japanese_name: "動的鉱石"
  }
];

const rows = resolveVisibleInventoryRows([
  { item_name: "動的インゴット", quantity: 4, hq_quantity: 1, confidence: 0.92 },
  { item_name: "Dynamic Ore", quantity: 12, hq_quantity: null, confidence: 0.88 },
  { item_name: "似ているだけ", quantity: 99, hq_quantity: null, confidence: 0.99 },
  { item_name: "動的鉱石", quantity: 5, hq_quantity: null, confidence: 0.4 }
], aliases);

assert.equal(rows.length, 2, "only exact aliases with confident visible quantities should resolve");
assert.deepEqual(rows.find(row => row.item_id === 9001), {
  item_id: 9001,
  item_name: "動的インゴット",
  quantity: 4,
  hq_quantity: 1,
  confidence: 0.92
});
assert.equal(rows.find(row => row.item_id === 9003).quantity, 12);

const jstDate = japanDateKey(new Date("2026-08-10T15:30:00.000Z"));
assert.equal(jstDate, "2026-08-11", "same-day dynamic aliases must use Japan date boundaries");

const wrapperSource = readFileSync(new URL("../src/dynamic-inventory-wrapper.js", import.meta.url), "utf8");
assert.match(wrapperSource, /recipe_dynamic/, "dynamic advice must seed the inventory allowlist");
assert.match(wrapperSource, /dynamic_inventory_context_saved/, "inventory screenshot response must report dynamic evidence storage");
assert.match(wrapperSource, /loadDynamicAliasRows/, "dynamic inventory matching must be profile/day scoped through stored aliases");

console.log("dynamic inventory context tests: ok");

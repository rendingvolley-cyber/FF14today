import assert from "node:assert/strict";
import {
  buildLeveRewardMarketComparison,
  leveRewardForTask,
  quoteMarketListings
} from "../src/leve-reward-market-comparison.js";

assert.deepEqual(
  leveRewardForTask("craft:arm80:leve:armguards-maiming"),
  { base_gil: 4900, hq_gil: 9800, base_exp: 935000, hq_exp: 1870000, hq_multiplier: 2 }
);
assert.deepEqual(
  leveRewardForTask("craft:arm80:leve:high-durium-nugget"),
  { base_gil: 2450, hq_gil: 4900, base_exp: 724620, hq_exp: 1449240, hq_multiplier: 2 }
);
assert.deepEqual(
  leveRewardForTask("craft:arm90:leve:mountain-chromite-ingot"),
  { base_gil: 2530, hq_gil: 5060, base_exp: 1440660, hq_exp: 2881320, hq_multiplier: 2 }
);
assert.deepEqual(
  leveRewardForTask("craft:arm98:leve:ra-kaznar-maiming-greaves"),
  { base_gil: 5180, hq_gil: 10360, base_exp: 3459540, hq_exp: 6919080, hq_multiplier: 2 }
);
assert.equal(leveRewardForTask("craft:unknown"), null);

const listings = [
  { hq: false, quantity: 1, pricePerUnit: 1000 },
  { hq: false, quantity: 3, pricePerUnit: 1200 },
  { hq: true, quantity: 1, pricePerUnit: 2000 },
  { hq: true, quantity: 2, pricePerUnit: 2100 }
];
assert.equal(quoteMarketListings(listings, 3, false), 3400, "NQ quote must consume cheapest listing quantities");
assert.equal(quoteMarketListings(listings, 3, true), 6200, "HQ quote must stay HQ-only");
assert.equal(quoteMarketListings(listings, 4, true), null, "insufficient HQ listing quantity must not invent a price");

const now = Date.now();
const comparison = buildLeveRewardMarketComparison(
  "craft:arm80:leve:armguards-maiming",
  {
    itemId: 34107,
    requiredQuantity: 1,
    routes: [
      { key: "buy_finished", available: true, additionalGil: 6000 },
      { key: "craft_raw", available: true, additionalGil: 4000 }
    ]
  },
  {
    itemID: 34107,
    lastUploadTime: now - 5 * 60000,
    listings: [
      { hq: false, quantity: 1, pricePerUnit: 6000 },
      { hq: true, quantity: 1, pricePerUnit: 7500 }
    ]
  }
);
assert.equal(comparison.base_gil, 4900);
assert.equal(comparison.hq_gil, 9800);
assert.equal(comparison.market_nq_gil, 6000);
assert.equal(comparison.market_hq_gil, 7500);
assert.equal(comparison.net_nq_buy_gil, -1100);
assert.equal(comparison.net_hq_buy_gil, 2300);
assert.equal(comparison.craft_raw_gil, 4000);
assert.equal(comparison.net_hq_craft_gil, 5800);
assert.ok(comparison.market_age_minutes >= 4 && comparison.market_age_minutes <= 6);
assert.equal(comparison.optional_item_rewards_included, false);

const dawntrailComparison = buildLeveRewardMarketComparison(
  "craft:arm90:leve:mountain-chromite-ingot",
  {
    itemId: 44003,
    requiredQuantity: 3,
    routes: [{ key: "craft_raw", available: true, additionalGil: 3000 }]
  },
  {
    itemID: 44003,
    lastUploadTime: now,
    listings: [
      { hq: false, quantity: 3, pricePerUnit: 700 },
      { hq: true, quantity: 3, pricePerUnit: 900 }
    ]
  }
);
assert.equal(dawntrailComparison.base_gil, 2530);
assert.equal(dawntrailComparison.market_nq_gil, 2100);
assert.equal(dawntrailComparison.net_nq_buy_gil, 430);
assert.equal(dawntrailComparison.market_hq_gil, 2700);
assert.equal(dawntrailComparison.net_hq_buy_gil, 2360);

console.log("leve reward market comparison tests: ok");

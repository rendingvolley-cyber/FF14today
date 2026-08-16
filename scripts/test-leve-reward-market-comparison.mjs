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

console.log("leve reward market comparison tests: ok");

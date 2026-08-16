import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildMarketFallbackProcurement, marketCostFromListings } from "../src/gc-market-fallback.js";
import { needsMarketFallback } from "../src/gc-market-fallback-wrapper.js";

const rawCraft = {
  page_kind: "crafting",
  requested_quantity: 1,
  owned_quantity: 0,
  item_name: "ビスマス・ソー"
};
assert.equal(needsMarketFallback(rawCraft), true, "cost_advice:false raw crafting rows must still receive a market fallback");
assert.equal(needsMarketFallback({ ...rawCraft, procurement: { status: "recipe_unavailable" } }), true);
assert.equal(needsMarketFallback({ ...rawCraft, procurement: { status: "market_unavailable" } }), true);
assert.equal(needsMarketFallback({ ...rawCraft, procurement: { status: "ok" } }), false);
assert.equal(needsMarketFallback({ ...rawCraft, page_kind: "gathering" }), false);
assert.equal(needsMarketFallback({ ...rawCraft, owned_quantity: 1 }), false);

const marketCost = marketCostFromListings([
  { pricePerUnit: 1500, quantity: 1 },
  { pricePerUnit: 1000, quantity: 2 }
], 2);
assert.deepEqual(marketCost, { available: true, gil: 2000, quantity: 2, listed_quantity: 3 });

const partial = buildMarketFallbackProcurement({
  quantity: 2,
  recipeError: "recipe_ambiguous",
  itemId: 12345,
  marketCost
});
assert.equal(partial.status, "ok");
assert.equal(partial.market_buy.gil, 2000);
assert.equal(partial.craft_raw, null);
assert.match(partial.recommended_route.label, /完成品を買う/);
assert.match(partial.recommended_route.label, /自作費未比較/);
assert.match(partial.recommended_route.label, /複数レシピ/);
assert.doesNotMatch(partial.recommended_route.label, /比較できず/);
assert.match(partial.recommendation_reason, /完成品のマケボ価格は取得できました/);

const source = readFileSync(new URL("../src/gc-market-fallback-wrapper.js", import.meta.url), "utf8");
assert.doesNotMatch(source, /if \(!data\?\.cost_advice \|\| !Array\.isArray\(data\?\.deliveries\)\)/, "fallback must not be disabled just because full recipe cost advice failed");
assert.match(source, /if \(!Array\.isArray\(data\?\.deliveries\)\) return response/);
assert.match(source, /cost_advice_partial/);

console.log("GC comparison fallback OK");

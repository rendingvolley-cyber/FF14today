import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  GC_SEAL_MARKET_CANDIDATES,
  rankSealExchangeRows,
  scoreSealExchangeCandidate
} from "../src/gc-seal-market.js";

assert.ok(GC_SEAL_MARKET_CANDIDATES.length >= 8);
assert.ok(GC_SEAL_MARKET_CANDIDATES.every(row => row.seal_cost > 0 && row.exchange_quantity > 0));

const efficient = scoreSealExchangeCandidate({
  seal_cost: 200,
  exchange_quantity: 1,
  average_sale_price: 900,
  daily_sale_velocity: 15,
  listed_quantity: 20,
  listing_rows_sampled: 12
});
assert.equal(efficient.estimated_gil_per_1000_seals, 4500);
assert.equal(efficient.estimated_gross_per_exchange, 900);
assert.ok(efficient.demand_score > efficient.efficiency_score, "sales velocity must carry more weight than seal efficiency");
assert.ok(efficient.score > 50);

const ranked = rankSealExchangeRows([
  {
    item_name: "高いが売れない品",
    seal_cost: 200,
    exchange_quantity: 1,
    average_sale_price: 30000,
    daily_sale_velocity: 1,
    listed_quantity: 1,
    listing_rows_sampled: 1
  },
  {
    item_name: "かなり売れる品",
    seal_cost: 200,
    exchange_quantity: 1,
    average_sale_price: 250,
    daily_sale_velocity: 300,
    listed_quantity: 300,
    listing_rows_sampled: 80
  },
  {
    item_name: "高効率だが中程度",
    seal_cost: 200,
    exchange_quantity: 1,
    average_sale_price: 1500,
    daily_sale_velocity: 8,
    listed_quantity: 8,
    listing_rows_sampled: 8
  }
]);
assert.equal(ranked.length, 2, "items selling fewer than 5/day should be excluded");
assert.equal(ranked[0].item_name, "かなり売れる品", "very high sales velocity should outrank higher gil efficiency");
assert.equal(ranked[0].rank, 1);
assert.equal(ranked[0].sales_priority, "非常に売れやすい");

const costWrapper = readFileSync(new URL("../src/gc-delivery-cost-wrapper.js", import.meta.url), "utf8");
const entry = readFileSync(new URL("../src/gc-supply-duty-entry.js", import.meta.url), "utf8");
assert.match(costWrapper, /\/api\/grand-company\/delivery-costs/);
assert.match(costWrapper, /resolveDynamicCraftTarget/);
assert.match(costWrapper, /buildDynamicLeveCostAdvice/);
assert.match(costWrapper, /decision_owner:\s*"user"/);
assert.match(costWrapper, /listing_quantity_curve/);
assert.match(entry, /gc-delivery-cost-wrapper\.js/);

const gcCss = readFileSync(new URL("../public/grand-company-routine.css", import.meta.url), "utf8");
assert.match(gcCss, /grid-template-columns:repeat\(4,minmax\(0,1fr\)\)/, "desktop routine steps must stay on one row");

console.log("GC seal market ranking and delivery cost wiring: ok");

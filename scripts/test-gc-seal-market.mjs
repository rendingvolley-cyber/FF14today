import assert from "node:assert/strict";
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
assert.ok(efficient.score > 50);

const ranked = rankSealExchangeRows([
  {
    item_name: "高いが売れない品",
    seal_cost: 200,
    exchange_quantity: 1,
    average_sale_price: 3000,
    daily_sale_velocity: 0.1,
    listed_quantity: 1,
    listing_rows_sampled: 1
  },
  {
    item_name: "売れ筋品",
    seal_cost: 200,
    exchange_quantity: 1,
    average_sale_price: 800,
    daily_sale_velocity: 30,
    listed_quantity: 30,
    listing_rows_sampled: 20
  },
  {
    item_name: "次点品",
    seal_cost: 1500,
    exchange_quantity: 1,
    average_sale_price: 5000,
    daily_sale_velocity: 8,
    listed_quantity: 12,
    listing_rows_sampled: 8
  }
]);
assert.equal(ranked.length, 2, "very slow market items should be excluded");
assert.equal(ranked[0].item_name, "売れ筋品");
assert.equal(ranked[0].rank, 1);
assert.equal(ranked[1].rank, 2);

console.log("GC seal market ranking: ok");

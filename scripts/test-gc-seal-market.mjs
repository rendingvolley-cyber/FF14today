import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  GC_SEAL_MARKET_CANDIDATES,
  GC_SEAL_MAX_BATCH_DAYS,
  GC_SEAL_SELL_BATCH_QUANTITY,
  rankSealExchangeRows,
  scoreSealExchangeCandidate
} from "../src/gc-seal-market.js";

assert.ok(GC_SEAL_MARKET_CANDIDATES.length >= 8);
assert.ok(GC_SEAL_MARKET_CANDIDATES.every(row => row.seal_cost > 0 && row.exchange_quantity > 0));
assert.equal(GC_SEAL_SELL_BATCH_QUANTITY, 300);
assert.equal(GC_SEAL_MAX_BATCH_DAYS, 3);

const fast = scoreSealExchangeCandidate({
  seal_cost: 200,
  exchange_quantity: 1,
  average_sale_price: 250,
  daily_sale_velocity: 300,
  listed_quantity: 300,
  listing_rows_sampled: 80
});
assert.equal(fast.estimated_gil_per_1000_seals, 1250);
assert.equal(fast.estimated_gross_per_exchange, 250);
assert.equal(fast.sell_batch_quantity, 300);
assert.equal(fast.estimated_days_to_sell_batch, 1);
assert.ok(fast.sell_through_score > fast.value_score, "300-item sell-through must dominate value scoring");
assert.equal(fast.velocity_floor_pass, true);
assert.equal(fast.efficiency_floor_pass, true);

const sampleRows = [
  { item_name: "高いが300個には遅い品", seal_cost: 200, exchange_quantity: 1, average_sale_price: 30000, daily_sale_velocity: 50, listed_quantity: 10, listing_rows_sampled: 10 },
  { item_name: "激安だが超高速", seal_cost: 200, exchange_quantity: 1, average_sale_price: 50, daily_sale_velocity: 1500, listed_quantity: 100, listing_rows_sampled: 30 },
  { item_name: "最速の実用品", seal_cost: 200, exchange_quantity: 1, average_sale_price: 248, daily_sale_velocity: 852.3, listed_quantity: 4432, listing_rows_sampled: 90 },
  { item_name: "高単価の次点", seal_cost: 200, exchange_quantity: 1, average_sale_price: 900, daily_sale_velocity: 300, listed_quantity: 300, listing_rows_sampled: 60 },
  { item_name: "ぎりぎり300個向き", seal_cost: 200, exchange_quantity: 1, average_sale_price: 400, daily_sale_velocity: 100, listed_quantity: 100, listing_rows_sampled: 20 }
];
const ranked = rankSealExchangeRows(sampleRows, 3);
assert.equal(ranked.length, 3, "the visible recommendation lane must stop at top three");
assert.equal(ranked[0].item_name, "最速の実用品", "qualifying candidates must be ordered primarily by daily sales velocity");
assert.equal(ranked[0].rank, 1);
assert.equal(ranked[0].sales_priority, "かなり売れる");
assert.equal(ranked[0].recommendation_strength, "strong");
assert.ok(ranked[0].estimated_days_to_sell_batch < 0.4);
assert.equal(ranked[1].item_name, "高単価の次点");
assert.equal(ranked[2].item_name, "ぎりぎり300個向き");
assert.equal(ranked[2].estimated_days_to_sell_batch, 3);

const expanded = rankSealExchangeRows(sampleRows, 5);
assert.equal(expanded.length, 4, "a slower but still valuable candidate may fill a lower rank when strong rows are scarce");
assert.equal(expanded[3].item_name, "高いが300個には遅い品");
assert.equal(expanded[3].recommendation_strength, "secondary");
assert.equal(expanded.some(row => row.item_name === "激安だが超高速"), false, "extremely cheap candidates must remain excluded");

const costWrapper = readFileSync(new URL("../src/gc-delivery-cost-wrapper.js", import.meta.url), "utf8");
const fallbackWrapper = readFileSync(new URL("../src/gc-market-fallback-wrapper.js", import.meta.url), "utf8");
const categoryJobWrapper = readFileSync(new URL("../src/category-job-focus-wrapper.js", import.meta.url), "utf8");
const retainerBandWrapper = readFileSync(new URL("../src/retainer-level-band-wrapper.js", import.meta.url), "utf8");
const recoveryWrapper = readFileSync(new URL("../src/task-board-recovery-wrapper.js", import.meta.url), "utf8");
const sealWrapper = readFileSync(new URL("../src/gc-seal-market-wrapper.js", import.meta.url), "utf8");
const topThreeEntry = readFileSync(new URL("../src/gc-top3-entry.js", import.meta.url), "utf8");
const entry = readFileSync(new URL("../src/gc-supply-duty-entry.js", import.meta.url), "utf8");
const wrangler = JSON.parse(readFileSync(new URL("../wrangler.jsonc", import.meta.url), "utf8"));
assert.match(costWrapper, /\/api\/grand-company\/delivery-costs/);
assert.match(costWrapper, /resolveDynamicCraftTarget/);
assert.match(costWrapper, /buildDynamicLeveCostAdvice/);
assert.match(costWrapper, /decision_owner:\s*"user"/);
assert.match(costWrapper, /listing_quantity_curve/);
assert.match(entry, /task-board-recovery-wrapper\.js/);
assert.match(recoveryWrapper, /retainer-level-band-wrapper\.js/);
assert.match(retainerBandWrapper, /category-job-focus-wrapper\.js/);
assert.match(categoryJobWrapper, /gc-market-fallback-wrapper\.js/);
assert.match(fallbackWrapper, /gc-delivery-cost-wrapper\.js/);
assert.match(fallbackWrapper, /marketCostFromListings/);
assert.match(sealWrapper, /sell-through-300-v1/);
assert.match(sealWrapper, /rankSealExchangeRows\(marketRows, 5\)/);
assert.match(topThreeEntry, /recommendations\.slice\(0, 3\)/);
assert.match(topThreeEntry, /recommendation_limit:\s*3/);
assert.equal(wrangler.main, "src/gc-top3-entry.js");

const gcCss = readFileSync(new URL("../public/grand-company-routine.css", import.meta.url), "utf8");
const gcUi = readFileSync(new URL("../public/gc-seal-market.js", import.meta.url), "utf8");
assert.match(gcCss, /grid-template-columns:repeat\(4,minmax\(0,1fr\)\)/, "desktop routine steps must stay on one row");
assert.match(gcCss, /\.gc-delivery-table\{/);
assert.match(gcCss, /\.gc-seal-table\{/);
assert.match(gcUi, /300個出す前提で、売れ筋順に比較/);
assert.match(gcUi, /data-gc-delivery-item/);
assert.match(gcUi, /button\.textContent = "詳細"/);

console.log("GC table UI, task board recovery, market fallback, and top-three 300-item seal ranking: ok");

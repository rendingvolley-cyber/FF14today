import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  buildMarketFallbackProcurement,
  marketCostFromListings,
  recipeIssueLabel
} from "../src/gc-market-fallback.js";
import {
  gcAnalysisBudgetToken,
  mergeGcPagePayloads,
  nextGcPageKind,
  normalizeGcPageKind
} from "../src/gc-two-page.js";

const source = readFileSync(new URL("../src/gc-jsonmode-core-wrapper.js", import.meta.url), "utf8");
const pageWrapper = readFileSync(new URL("../src/gc-jsonmode-wrapper.js", import.meta.url), "utf8");
const costWrapper = readFileSync(new URL("../src/gc-delivery-cost-wrapper.js", import.meta.url), "utf8");
const fallbackWrapper = readFileSync(new URL("../src/gc-market-fallback-wrapper.js", import.meta.url), "utf8");
const categoryJobWrapper = readFileSync(new URL("../src/category-job-focus-wrapper.js", import.meta.url), "utf8");
const retainerBandWrapper = readFileSync(new URL("../src/retainer-level-band-wrapper.js", import.meta.url), "utf8");
const recoveryWrapper = readFileSync(new URL("../src/task-board-recovery-wrapper.js", import.meta.url), "utf8");
const entry = readFileSync(new URL("../src/gc-supply-duty-entry.js", import.meta.url), "utf8");
const contextWrapper = readFileSync(new URL("../public/context-inbox.js", import.meta.url), "utf8");
const twoPageUi = readFileSync(new URL("../public/gc-two-page-ui.js", import.meta.url), "utf8");

assert.match(source, /responseMimeType:\s*"application\/json"/, "GC image analysis must request JSON output");
assert.doesNotMatch(source, /responseJsonSchema/, "GC image analysis must not use Gemini responseJsonSchema because it can exceed serving-state limits");
assert.match(source, /SUPPLY DUTY/);
assert.match(source, /軍需品調達/);
assert.match(source, /調達依頼品/);
assert.match(source, /supply-duty-json-v3/);
assert.match(source, /画像解析側で一時的なエラー/);
assert.match(entry, /task-board-recovery-wrapper\.js/, "production entry must preserve task-board recovery as the outer API layer");
assert.match(recoveryWrapper, /retainer-level-band-wrapper\.js/, "task-board recovery must preserve retainer level-band recommendations underneath it");
assert.match(retainerBandWrapper, /category-job-focus-wrapper\.js/, "retainer level-band layer must preserve category job focus underneath it");
assert.match(categoryJobWrapper, /gc-market-fallback-wrapper\.js/, "category job focus must preserve the market fallback wrapper underneath it");
assert.match(fallbackWrapper, /gc-delivery-cost-wrapper\.js/, "market fallback must preserve the existing GC cost comparison underneath it");
assert.match(fallbackWrapper, /searchItemExact/);
assert.match(fallbackWrapper, /marketCostFromListings/);
assert.match(fallbackWrapper, /market_fallback/);
assert.match(costWrapper, /gc-jsonmode-wrapper\.js/, "GC cost wrapper must preserve the JSON-mode parser underneath it");

assert.match(pageWrapper, /grand_company_delivery_pages/);
assert.match(pageWrapper, /PRIMARY KEY \(profile_hash, delivery_date, page_kind\)/);
assert.match(pageWrapper, /crafting_deliveries/);
assert.match(pageWrapper, /gathering_deliveries/);
assert.match(pageWrapper, /requestWithGcBudgetToken/);
assert.match(pageWrapper, /gcAnalysisBudgetToken/);
assert.doesNotMatch(
  pageWrapper,
  /if \(!pages\.crafting && !pages\.gathering\) return app\.fetch/,
  "empty two-page state must not fall back to stale legacy one-page deliveries"
);
assert.match(contextWrapper, /gc_page_kind/);
assert.match(twoPageUi, /製作一覧（軍需品調達）/);
assert.match(twoPageUi, /採集一覧（補給品調達）/);
assert.match(twoPageUi, /片方を貼り直しても、もう片方の一覧は保持/);

assert.equal(normalizeGcPageKind("crafting"), "crafting");
assert.equal(normalizeGcPageKind("gathering"), "gathering");
assert.equal(normalizeGcPageKind("other"), null);
assert.equal(nextGcPageKind({}, null), "crafting");
assert.equal(nextGcPageKind({ crafting: true, gathering: false }, null), "gathering");
assert.equal(nextGcPageKind({ crafting: true, gathering: true }, "gathering"), "gathering");

const profileToken = "A".repeat(43);
const craftingBudgetToken = gcAnalysisBudgetToken(profileToken, "crafting");
const gatheringBudgetToken = gcAnalysisBudgetToken(profileToken, "gathering");
assert.match(craftingBudgetToken, /^[A-Za-z0-9_-]{43,128}$/);
assert.match(gatheringBudgetToken, /^[A-Za-z0-9_-]{43,128}$/);
assert.notEqual(craftingBudgetToken, profileToken, "GC analysis must not consume the generic profile budget namespace");
assert.notEqual(gatheringBudgetToken, profileToken, "GC analysis must not consume the generic profile budget namespace");
assert.notEqual(craftingBudgetToken, gatheringBudgetToken, "crafting and gathering must have separate retry budgets");
assert.equal(gcAnalysisBudgetToken("short", "crafting"), null);
assert.equal(gcAnalysisBudgetToken(profileToken, "other"), null);

const merged = mergeGcPagePayloads({
  crafting: { deliveries: [{ row_index: 0, item_name: "製作品A" }, { row_index: 1, item_name: "製作品B" }] },
  gathering: { deliveries: [{ row_index: 0, item_name: "採集品A" }] }
});
assert.equal(merged.deliveries.length, 3);
assert.deepEqual(merged.deliveries.map(row => row.page_kind), ["crafting", "crafting", "gathering"]);
assert.deepEqual(merged.deliveries.map(row => row.row_index), [0, 1, 2], "combined row indexes must remain unique across pages");
assert.equal(merged.crafting[0].item_name, "製作品A");
assert.equal(merged.gathering[0].item_name, "採集品A");
assert.deepEqual(merged.page_status, { crafting: true, gathering: true });
assert.deepEqual(merged.missing_pages, []);

const partial = mergeGcPagePayloads({ crafting: { deliveries: [{ item_name: "製作品だけ" }] }, gathering: null });
assert.deepEqual(partial.page_status, { crafting: true, gathering: false });
assert.deepEqual(partial.missing_pages, ["gathering"]);

const marketCost = marketCostFromListings([
  { pricePerUnit: 100, quantity: 2, hq: false },
  { pricePerUnit: 120, quantity: 3, hq: true }
], 4);
assert.deepEqual(marketCost, { available: true, gil: 440, quantity: 4, listed_quantity: 5 });
const insufficient = marketCostFromListings([{ pricePerUnit: 100, quantity: 2 }], 4);
assert.equal(insufficient.available, false);
assert.equal(insufficient.gil, null);
assert.equal(insufficient.listed_quantity, 2);

assert.equal(recipeIssueLabel("recipe_not_found"), "製作レシピを取得できず");
assert.equal(recipeIssueLabel("recipe_ambiguous"), "複数レシピのため自動選択を停止");
assert.equal(recipeIssueLabel("item_not_found"), "品名をXIVAPIで特定できず");

const marketOnly = buildMarketFallbackProcurement({
  quantity: 2,
  quantityBasis: "missing_quantity",
  recipeError: "recipe_not_found",
  itemId: 1234,
  marketCost: { available: true, gil: 2800 }
});
assert.equal(marketOnly.status, "ok");
assert.equal(marketOnly.market_buy.gil, 2800);
assert.equal(marketOnly.craft_raw, null);
assert.match(marketOnly.recommended_route.label, /完成品を買う/);
assert.match(marketOnly.recommended_route.label, /製作レシピを取得できず/);
assert.match(marketOnly.recommendation_reason, /製作費.*未比較/);

const unresolved = buildMarketFallbackProcurement({
  quantity: 1,
  recipeError: "item_not_found",
  itemError: "item_not_found",
  itemId: null,
  marketCost: null
});
assert.equal(unresolved.status, "ok");
assert.equal(unresolved.market_buy, null);
assert.equal(unresolved.recommended_route.available, false);
assert.match(unresolved.recommended_route.label, /品名をXIVAPIで特定できず/);

console.log("GC JSON-mode, two-page storage, market fallback, retainer-level-band, and task-board recovery chain regression: ok");

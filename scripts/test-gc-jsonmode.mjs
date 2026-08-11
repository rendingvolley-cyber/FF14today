import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mergeGcPagePayloads, nextGcPageKind, normalizeGcPageKind } from "../src/gc-two-page.js";

const source = readFileSync(new URL("../src/gc-jsonmode-core-wrapper.js", import.meta.url), "utf8");
const pageWrapper = readFileSync(new URL("../src/gc-jsonmode-wrapper.js", import.meta.url), "utf8");
const costWrapper = readFileSync(new URL("../src/gc-delivery-cost-wrapper.js", import.meta.url), "utf8");
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
assert.match(entry, /gc-delivery-cost-wrapper\.js/, "production entry must route through the outer GC cost wrapper");
assert.match(costWrapper, /gc-jsonmode-wrapper\.js/, "GC cost wrapper must preserve the JSON-mode parser underneath it");

assert.match(pageWrapper, /grand_company_delivery_pages/);
assert.match(pageWrapper, /PRIMARY KEY \(profile_hash, delivery_date, page_kind\)/);
assert.match(pageWrapper, /crafting_deliveries/);
assert.match(pageWrapper, /gathering_deliveries/);
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

console.log("GC JSON-mode and two-page storage regression: ok");

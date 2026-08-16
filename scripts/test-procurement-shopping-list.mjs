import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseMaterialSummary, shoppingListText } from "../public/procurement-shopping-list-core.js";
import { LEVE_COST_TIMEOUT_MS, rewriteLeveCostUrl } from "../public/leve-cost-request-policy.js";

const rows = parseMaterialSummary("必要素材：ハイダリウムナゲット ×9（約9,000G） / 黒麻布 ×6（約3,600G） / アイスクリスタル ×24");
assert.equal(rows.length, 3);
assert.deepEqual(rows[0], {
  item_name: "ハイダリウムナゲット",
  quantity: 9,
  total_gil: 9000,
  estimated_unit_gil: 1000
});
assert.equal(rows[1].estimated_unit_gil, 600);
assert.equal(rows[2].quantity, 24);
assert.equal(rows[2].total_gil, null);
assert.equal(rows[2].estimated_unit_gil, null);

assert.deepEqual(parseMaterialSummary("必要素材 合算：追加購入素材なし"), []);
assert.deepEqual(parseMaterialSummary("製作素材：購入素材なし"), []);

const text = shoppingListText(rows, { title: "生産｜マケボ購入リスト" });
assert.match(text, /ハイダリウムナゲット ×9 \/ 相場目安 1,000G\/個 \/ 小計 約9,000G/);
assert.match(text, /黒麻布 ×6 \/ 相場目安 600G\/個 \/ 小計 約3,600G/);
assert.match(text, /アイスクリスタル ×24/);
assert.doesNotMatch(text, /合計概算/, "一部価格不明なら誤った総額を出さない");

const fullyPriced = parseMaterialSummary("必要素材：A ×2（約1,000G） / B ×3（約900G）");
assert.match(shoppingListText(fullyPriced), /合計概算 1,900G/);

const armguardsUrl = rewriteLeveCostUrl("/api/leve/cost-advice?task_key=craft%3Adynamic%3A1234&dynamic=1&item_name=%E3%83%8F%E3%82%A4%E3%83%80%E3%83%AA%E3%82%A6%E3%83%A0%E3%83%BB%E3%82%B9%E3%83%AC%E3%82%A4%E3%83%A4%E3%83%BC%E3%82%A2%E3%83%BC%E3%83%A0%E3%82%AC%E3%83%BC%E3%83%89&quantity=1&hq_required=0&energy=3", "https://example.test/");
const armguardsParams = new URL(armguardsUrl).searchParams;
assert.equal(armguardsParams.get("task_key"), "craft:arm80:leve:armguards-maiming");
assert.equal(armguardsParams.has("dynamic"), false, "verified ARM leve must bypass dynamic XIVAPI recipe resolution");
assert.equal(armguardsParams.has("item_name"), false);
assert.equal(armguardsParams.get("energy"), "3");

const nuggetUrl = rewriteLeveCostUrl("/api/leve/cost-advice?task_key=craft%3Adynamic%3A5678&dynamic=1&item_name=%E3%83%8F%E3%82%A4%E3%83%80%E3%83%AA%E3%82%A6%E3%83%A0%E3%83%8A%E3%82%B2%E3%83%83%E3%83%88&quantity=3", "https://example.test/");
assert.equal(new URL(nuggetUrl).searchParams.get("task_key"), "craft:arm80:leve:high-durium-nugget");
assert.ok(LEVE_COST_TIMEOUT_MS >= 5000 && LEVE_COST_TIMEOUT_MS <= 15000, "cost advice must fail closed instead of staying in calculating forever");

const uiSource = readFileSync(new URL("../public/procurement-shopping-list.js", import.meta.url), "utf8");
assert.match(uiSource, /<table class=\"procurement-shopping-table\">/, "shopping list should render a semantic material table");
assert.match(uiSource, /<th>素材<\/th><th>必要数<\/th><th>相場目安\/個<\/th><th>小計<\/th>/, "table should expose material, quantity, unit market estimate and subtotal columns");
assert.match(uiSource, /最も古いもので約\$\{ageMinutes\}分前/, "craft table should expose market freshness");
assert.match(uiSource, /block\.hidden = true/, "raw slash-separated material text should be hidden once the table is rendered");
assert.match(uiSource, /escapeHtml\(row\.item_name\)/, "material names must be escaped before HTML rendering");
assert.match(uiSource, /document\.getElementById\("taskBoardMaterials"\)/, "craft material table must replace the visible Task Board preparation panel, not an unused side panel");
assert.match(uiSource, /host\.replaceChildren\(panel\)/, "legacy Task Board material rows should be replaced by the market table");

const liveBootSource = readFileSync(new URL("../public/time-sensitive-layout-direct.js", import.meta.url), "utf8");
assert.match(liveBootSource, /import\("\/leve-cost-request-policy\.js"\)/, "live page must install static leve routing and timeout policy before procurement fetches");
assert.match(liveBootSource, /import\("\/craft-procurement-summary\.js"\)/, "live page must load craft procurement aggregation");
assert.match(liveBootSource, /import\("\/procurement-shopping-list\.js"\)/, "live page must load the market table renderer");

console.log("procurement shopping list tests: ok");

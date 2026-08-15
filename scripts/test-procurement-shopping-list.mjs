import assert from "node:assert/strict";
import { parseMaterialSummary, shoppingListText } from "../public/procurement-shopping-list-core.js";

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
assert.match(text, /ハイダリウムナゲット ×9 \/ 概算 9,000G/);
assert.match(text, /黒麻布 ×6 \/ 概算 3,600G/);
assert.match(text, /アイスクリスタル ×24/);
assert.doesNotMatch(text, /合計概算/, "一部価格不明なら誤った総額を出さない");

const fullyPriced = parseMaterialSummary("必要素材：A ×2（約1,000G） / B ×3（約900G）");
assert.match(shoppingListText(fullyPriced), /合計概算 1,900G/);

console.log("procurement shopping list tests: ok");

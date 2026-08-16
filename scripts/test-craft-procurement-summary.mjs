import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  aggregateCraftProcurement,
  parseCraftDeliveryTitle,
  procurementModel
} from "../public/craft-procurement-summary-core.js";

assert.deepEqual(
  parseCraftDeliveryTitle("甲冑師リーヴ「ハイダリウムナゲット」3個納品"),
  { itemName: "ハイダリウムナゲット", quantity: 3, hqRequired: false }
);
assert.deepEqual(
  parseCraftDeliveryTitle("甲冑師リーヴ「テストHQ」1個納品 HQ"),
  { itemName: "テストHQ", quantity: 1, hqRequired: true }
);
assert.equal(parseCraftDeliveryTitle("友好部族を3件やる"), null);

const payloadA = {
  market_age_minutes: 12,
  leve_reward_market_comparison: {
    base_gil: 4900,
    hq_gil: 9800,
    market_nq_gil: 6000,
    market_hq_gil: 7500,
    net_nq_buy_gil: -1100,
    net_hq_buy_gil: 2300,
    net_hq_craft_gil: 5800,
    market_age_minutes: 4
  },
  advice: {
    itemName: "完成品A",
    requiredQuantity: 1,
    recommendedKey: "craft_raw",
    recommendationReason: "原材料から作る方が安いです。",
    routes: [
      { key: "buy_finished", label: "完成品を買う", available: true, additionalGil: 10000, purchases: [] },
      {
        key: "craft_raw", label: "原材料から全部作る", available: true, additionalGil: 4000,
        purchases: [
          { itemId: 1, itemName: "鉄鉱", quantity: 4, total: 800 },
          { itemId: 2, itemName: "革", quantity: 1, total: 500 }
        ]
      }
    ]
  }
};
const payloadB = {
  market_age_minutes: 8,
  leve_reward_market_comparison: {
    base_gil: 2450,
    hq_gil: 4900,
    market_nq_gil: 1800,
    market_hq_gil: 3600,
    net_nq_buy_gil: 650,
    net_hq_buy_gil: 1300,
    net_hq_craft_gil: -2100,
    market_age_minutes: 2
  },
  advice: {
    itemName: "完成品B",
    requiredQuantity: 3,
    recommendedKey: "buy_finished",
    recommendationReason: "完成品購入が安いです。",
    routes: [
      { key: "buy_finished", label: "完成品を買う", available: true, additionalGil: 6000, purchases: [] },
      {
        key: "craft_raw", label: "原材料から全部作る", available: true, additionalGil: 7000,
        purchases: [
          { itemId: 1, itemName: "鉄鉱", quantity: 6, total: 1200 }
        ]
      }
    ]
  }
};
const recommendedOnlyPayload = {
  market_age_minutes: 3,
  advice: {
    itemName: "完成品C",
    requiredQuantity: 1,
    recommendedKey: "buy_direct",
    recommendationReason: "中間素材購入がおすすめです。",
    routes: [{
      key: "buy_direct",
      label: "中間素材を買って作る",
      available: true,
      additionalGil: 8945,
      purchases: [
        { itemId: 3, itemName: "ジンセン材", quantity: 3, total: 5100 },
        { itemId: 4, itemName: "レザー", quantity: 1, total: 2000 }
      ]
    }]
  }
};

const a = procurementModel(payloadA);
const b = procurementModel(payloadB);
const recommendedOnly = procurementModel(recommendedOnlyPayload);
assert.equal(a.buy_finished_gil, 10000);
assert.equal(a.craft_raw_gil, 4000);
assert.equal(a.recommended_label, "原材料から全部作る");
assert.equal(a.market_age_minutes, 12);
assert.equal(a.reward_base_gil, 4900);
assert.equal(a.reward_hq_gil, 9800);
assert.equal(a.finished_nq_market_gil, 6000);
assert.equal(a.finished_hq_market_gil, 7500);
assert.equal(a.net_nq_buy_gil, -1100);
assert.equal(a.net_hq_buy_gil, 2300);
assert.equal(a.net_hq_craft_gil, 5800);
assert.equal(a.reward_market_age_minutes, 4);
assert.deepEqual(a.materials, [
  { item_id: 1, item_name: "鉄鉱", quantity: 4, total_gil: 800 },
  { item_id: 2, item_name: "革", quantity: 1, total_gil: 500 }
]);
assert.deepEqual(recommendedOnly.materials, [
  { item_id: 3, item_name: "ジンセン材", quantity: 3, total_gil: 5100 },
  { item_id: 4, item_name: "レザー", quantity: 1, total_gil: 2000 }
], "craft_rawが無い場合はおすすめルートの購入素材を表へ使う");

const combined = aggregateCraftProcurement([a, b]);
assert.equal(combined.count, 2);
assert.equal(combined.buy_finished_gil, 16000);
assert.equal(combined.craft_raw_gil, 11000);
assert.equal(combined.recommended_gil, 10000);
assert.equal(combined.reward_base_gil, 7350);
assert.equal(combined.reward_hq_gil, 14700);
assert.equal(combined.finished_nq_market_gil, 7800);
assert.equal(combined.finished_hq_market_gil, 11100);
assert.equal(combined.net_nq_buy_gil, -450);
assert.equal(combined.net_hq_buy_gil, 3600);
assert.equal(combined.net_hq_craft_gil, 3700);
assert.deepEqual(combined.materials, [
  { item_id: 2, item_name: "革", quantity: 1, total_gil: 500, priced: true },
  { item_id: 1, item_name: "鉄鉱", quantity: 10, total_gil: 2000, priced: true }
]);

const uiSource = readFileSync(new URL("../public/craft-procurement-summary.js", import.meta.url), "utf8");
assert.match(uiSource, /リーヴ報酬目安/);
assert.match(uiSource, /NQ完成品/);
assert.match(uiSource, /HQ完成品/);
assert.match(uiSource, /差引/);
assert.match(uiSource, /追加アイテム報酬は含めません/);

console.log("craft procurement summary tests: ok");

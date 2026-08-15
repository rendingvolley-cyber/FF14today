import assert from "node:assert/strict";
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

const a = procurementModel(payloadA);
const b = procurementModel(payloadB);
assert.equal(a.buy_finished_gil, 10000);
assert.equal(a.craft_raw_gil, 4000);
assert.equal(a.recommended_label, "原材料から全部作る");
assert.equal(a.market_age_minutes, 12);
assert.deepEqual(a.materials, [
  { item_id: 1, item_name: "鉄鉱", quantity: 4, total_gil: 800 },
  { item_id: 2, item_name: "革", quantity: 1, total_gil: 500 }
]);

const combined = aggregateCraftProcurement([a, b]);
assert.equal(combined.count, 2);
assert.equal(combined.buy_finished_gil, 16000);
assert.equal(combined.craft_raw_gil, 11000);
assert.equal(combined.recommended_gil, 10000);
assert.deepEqual(combined.materials, [
  { item_id: 2, item_name: "革", quantity: 1, total_gil: 500, priced: true },
  { item_id: 1, item_name: "鉄鉱", quantity: 10, total_gil: 2000, priced: true }
]);

console.log("craft procurement summary tests: ok");

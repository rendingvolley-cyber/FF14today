import assert from "node:assert/strict";
import { marketSnapshot } from "../src/procurement-market.js";
import { aggregateSelectedDeliveries, deliveryKey, marketLine } from "../public/gc-procurement-summary-core.js";

const market = marketSnapshot({
  itemID: 123,
  minPriceNQ: 4200,
  currentAveragePriceNQ: 5100.4,
  averagePriceNQ: 4650.2,
  lastUploadTime: 1720000000000,
  recentHistory: [
    { hq: false, pricePerUnit: 4600 },
    { hq: true, pricePerUnit: 7000 },
    { hq: false, pricePerUnit: 4700 }
  ]
});
assert.deepEqual(market, {
  item_id: 123,
  min_nq: 4200,
  listing_average_nq: 5100,
  sale_average_nq: 4650,
  last_upload_time: 1720000000000,
  recent_sales: 2
});
assert.match(marketLine(market), /最安 4,200G/);
assert.match(marketLine(market), /出品平均 5,100G/);
assert.match(marketLine(market), /売買平均 4,650G/);

const deliveries = [
  {
    page_kind: "crafting", row_index: 0, item_name: "A",
    procurement: {
      market_buy: { gil: 10000 },
      craft_raw: { gil: 4000, materials: [
        { item_id: 1, item_name: "鉄鉱", quantity: 4, total_gil: 800 },
        { item_id: 2, item_name: "革", quantity: 1, total_gil: 500 }
      ] },
      recommended_route: { gil: 4000 }
    }
  },
  {
    page_kind: "crafting", row_index: 1, item_name: "B",
    procurement: {
      market_buy: { gil: 8000 },
      craft_raw: { gil: 3000, materials: [
        { item_id: 1, item_name: "鉄鉱", quantity: 6, total_gil: 1200 }
      ] },
      recommended_route: { gil: 3000 }
    }
  },
  {
    page_kind: "gathering", row_index: 2, item_name: "C",
    procurement: {
      market_buy: { gil: 2000 },
      craft_raw: null,
      recommended_route: { gil: 0 }
    }
  }
];
const selected = deliveries.map(deliveryKey);
const summary = aggregateSelectedDeliveries(deliveries, selected);
assert.equal(summary.selected_count, 3);
assert.equal(summary.crafting_selected_count, 2);
assert.equal(summary.finished_buy_gil, 20000);
assert.equal(summary.craft_raw_gil, 7000);
assert.equal(summary.recommended_gil, 7000);
assert.deepEqual(summary.materials, [
  { item_id: 2, item_name: "革", quantity: 1, total_gil: 500, priced: true },
  { item_id: 1, item_name: "鉄鉱", quantity: 10, total_gil: 2000, priced: true }
]);

console.log("procurement summary tests: ok");

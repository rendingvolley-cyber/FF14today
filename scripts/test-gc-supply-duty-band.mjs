import assert from "node:assert/strict";
import {
  extractSupplyDutyItems,
  relevantGrandCompanySupplyLevels,
  resolveSupplyDutyName,
  validateGrandCompanySupplyDutyDeliveries
} from "../src/gc-supply-duty-band-validator.js";

const supplyPayload = {
  rows: [
    {
      row_id: 91,
      fields: {
        SupplyData: [
          { Item: [
            { value: 1001, fields: { Name: "オルコクロマイト・アレンビック" } },
            { value: 1002, fields: { Name: "レッドパイン・グラインディングホイール" } }
          ] },
          { Item: [{ value: 1003, fields: { Name: "採掘用テスト鉱石" } }] }
        ]
      }
    },
    {
      row_id: 95,
      fields: {
        SupplyData: [
          { Item: [
            { value: 2001, fields: { Name: "マンガン・ラウンドナイフ" } },
            { value: 2002, fields: { Name: "園芸用テスト原木" } }
          ] }
        ]
      }
    }
  ]
};

const extracted = extractSupplyDutyItems(supplyPayload);
assert.ok(extracted.some(row => row.level === 91 && row.item_name === "レッドパイン・グラインディングホイール"));
assert.ok(extracted.some(row => row.level === 95 && row.item_name === "マンガン・ラウンドナイフ"));

assert.deepEqual(relevantGrandCompanySupplyLevels([
  { code: "ARM", role: "crafter", level: 91 },
  { code: "CUL", role: "crafter", level: 95 },
  { code: "MIN", role: "gatherer", level: 93 }
], "crafting"), [91, 95]);
assert.deepEqual(relevantGrandCompanySupplyLevels([
  { code: "ARM", role: "crafter", level: 91 },
  { code: "MIN", role: "gatherer", level: 93 },
  { code: "BTN", role: "gatherer", level: 97 }
], "gathering"), [93, 97]);

const exact = resolveSupplyDutyName("マンガン・ラウンドナイフ", extracted);
assert.equal(exact.item_name, "マンガン・ラウンドナイフ");
assert.equal(exact.resolution, "gc_supply_level_exact");

const fuzzy = resolveSupplyDutyName("レッドパイン・グラインデイングホイール", extracted);
assert.equal(fuzzy.item_name, "レッドパイン・グラインディングホイール");
assert.equal(fuzzy.resolution, "gc_supply_level_fuzzy");

const noMatch = resolveSupplyDutyName("まったく別の旧レベル帯アイテム", extracted);
assert.equal(noMatch, null);

let requestedUrl = "";
const fetchOk = async url => {
  requestedUrl = String(url);
  return new Response(JSON.stringify(supplyPayload), {
    status: 200,
    headers: { "content-type": "application/json" }
  });
};

const validated = await validateGrandCompanySupplyDutyDeliveries([
  { row_index: 0, item_name: "レッドパイン・グラインデイングホイール", requested_quantity: 1 },
  { row_index: 1, item_name: "旧レベル帯の別アイテム", requested_quantity: 1 }
], {
  jobs: [
    { code: "ARM", role: "crafter", level: 91 },
    { code: "CUL", role: "crafter", level: 95 }
  ],
  pageKind: "crafting",
  fetchImpl: fetchOk
});
assert.match(requestedUrl, /GCSupplyDuty/);
assert.match(requestedUrl, /rows=91%2C95/);
assert.match(requestedUrl, /SupplyData/);
assert.equal(validated[0].item_name, "レッドパイン・グラインディングホイール");
assert.equal(validated[0].gc_supply_level_verified, true);
assert.equal(validated[0].gc_supply_level, 91);
assert.equal(validated[0].item_name_raw, "レッドパイン・グラインデイングホイール");
assert.equal(validated[1].item_name, "品名要確認");
assert.equal(validated[1].gc_supply_level_verified, false);
assert.equal(validated[1].item_name_resolution, "gc_supply_level_unverified");
assert.equal(validated[1].item_name_raw, "旧レベル帯の別アイテム");

const unavailable = await validateGrandCompanySupplyDutyDeliveries([
  { item_name: "何かの採集品", requested_quantity: 1 }
], {
  jobs: [{ code: "MIN", role: "gatherer", level: 93 }],
  pageKind: "gathering",
  fetchImpl: async () => { throw new Error("network blocked"); }
});
assert.equal(unavailable[0].item_name, "品名要確認");
assert.equal(unavailable[0].item_name_verification_error, "xivapi_unreachable");
assert.deepEqual(unavailable[0].gc_supply_levels, [93]);

console.log("GC supply-duty level band validation: ok");

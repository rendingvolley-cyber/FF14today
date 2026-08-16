import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  chooseGrandCompanyDelivery,
  decorateGrandCompanyDelivery,
  sanitizeGrandCompanyAnalysis
} from "../src/grand-company-deliveries.js";
import {
  canonicalizeGrandCompanyDeliveries,
  canonicalizeGrandCompanyDelivery
} from "../src/gc-item-name-canonicalizer.js";
import { isGrandCompanyWorkflowContext } from "../src/grand-company-wrapper.js";
import { priceSnapshot } from "../src/gc-delivery-cost-wrapper.js";
import {
  genericPayloadForCachedAnalysis,
  sameJsonValue
} from "../src/gc-misclassification-cleanup-wrapper.js";
import {
  GC_SUPPLY_DUTY_PARSER_VERSION,
  buildSupplyDutyPrompt,
  shouldReuseSupplyDutyCache
} from "../src/gc-supply-duty-recognition-wrapper.js";

assert.equal(isGrandCompanyWorkflowContext("grand-company"), true);
assert.equal(isGrandCompanyWorkflowContext(" plan "), false);
assert.equal(isGrandCompanyWorkflowContext("journal"), false);

const supplyDutyPrompt = buildSupplyDutyPrompt();
assert.match(supplyDutyPrompt, /SUPPLY DUTY/);
assert.match(supplyDutyPrompt, /調達任務/);
assert.match(supplyDutyPrompt, /軍需品調達/);
assert.match(supplyDutyPrompt, /補給品調達/);
assert.match(supplyDutyPrompt, /希少品調達/);
assert.match(supplyDutyPrompt, /調達依頼品/);
assert.match(supplyDutyPrompt, /調達単位/);
assert.match(supplyDutyPrompt, /報酬軍票/);
assert.match(supplyDutyPrompt, /所持数/);
assert.match(supplyDutyPrompt, /会社名が見えないことを理由に recognized=false にしない/);
assert.match(supplyDutyPrompt, /アイコンだけからジョブ名を推測してはいけません/);

assert.deepEqual(priceSnapshot({
  listings: [],
  minPriceNQ: 4321,
  minPriceHQ: 9876
}), {
  nq: 4321,
  hq: 9876,
  nqOffers: null,
  hqOffers: null,
  priceSource: "min_price"
}, "Universalis minimum prices must remain usable when quantity listings are absent");
const listingSnapshot = priceSnapshot({
  minPriceNQ: 9999,
  listings: [
    { hq: false, pricePerUnit: 2500, quantity: 2 },
    { hq: false, pricePerUnit: 2200, quantity: 1 }
  ]
});
assert.equal(listingSnapshot.nq, 2200);
assert.equal(listingSnapshot.priceSource, "listings");
assert.deepEqual(listingSnapshot.nqOffers, [
  { unitPrice: 2200, quantity: 1 },
  { unitPrice: 2500, quantity: 2 }
]);

assert.equal(shouldReuseSupplyDutyCache(null), false);
assert.equal(shouldReuseSupplyDutyCache({ page_type: "unknown" }), false, "old failed cache must be reparsed after parser upgrade");
assert.equal(shouldReuseSupplyDutyCache({
  page_type: "unknown",
  parser_version: GC_SUPPLY_DUTY_PARSER_VERSION
}), true, "current parser failures may be reused without burning the image budget repeatedly");
assert.equal(shouldReuseSupplyDutyCache({
  page_type: "grand_company_deliveries"
}), true, "already-recognized GC evidence must remain reusable across parser upgrades");

const cachedJournal = {
  page_type: "journal",
  confidence: 0.82,
  model: "test-model",
  journal_entries: [{ title: "誤分類された納品行", confidence: 0.8 }],
  crafter_stats: null,
  gatherer_stats: null
};
const storedJournal = {
  gatherer_stats: null,
  model: "test-model",
  page_type: "journal",
  journal_entries: [{ confidence: 0.8, title: "誤分類された納品行" }],
  crafter_stats: null
};
assert.equal(sameJsonValue(genericPayloadForCachedAnalysis(cachedJournal), storedJournal), true);
assert.equal(sameJsonValue(genericPayloadForCachedAnalysis(cachedJournal), { ...storedJournal, model: "different" }), false);

const analysis = sanitizeGrandCompanyAnalysis({
  recognized: true,
  confidence: 0.94,
  company_name: "双蛇党",
  deliveries: [
    {
      class_or_job: "錬金術師",
      item_name: "テスト薬品",
      requested_quantity: 3,
      owned_quantity: 1,
      starred: true,
      bonus_text: "ボーナス",
      reward_text: "軍票 1000",
      confidence: 0.91
    },
    {
      class_or_job: "調理師",
      item_name: "テスト料理",
      requested_quantity: 1,
      owned_quantity: 1,
      starred: false,
      bonus_text: null,
      reward_text: null,
      confidence: 0.88
    },
    {
      class_or_job: "木工師",
      item_name: "怪しい文字",
      requested_quantity: null,
      owned_quantity: null,
      starred: false,
      bonus_text: null,
      reward_text: null,
      confidence: 0.4
    }
  ]
}, "test-model");

assert.equal(analysis.page_type, "grand_company_deliveries");
assert.equal(analysis.grand_company_deliveries.deliveries.length, 2, "low-confidence rows must be dropped");
assert.equal(analysis.grand_company_deliveries.company_name, "双蛇党");

// Known OCR/Vision mistakes are corrected synchronously so a broken external API
// cannot keep a confirmed bad spelling in today's saved evidence.
const correctedAnalysis = sanitizeGrandCompanyAnalysis({
  recognized: true,
  confidence: 0.95,
  deliveries: [{
    class_or_job: null,
    item_name: "オルコロクロマイト",
    requested_quantity: 20,
    owned_quantity: 0,
    starred: false,
    bonus_text: null,
    reward_text: null,
    confidence: 0.9
  }]
}, "test-model");
const correctedRow = correctedAnalysis.grand_company_deliveries.deliveries[0];
assert.equal(correctedRow.item_name, "オルコクロマイト");
assert.equal(correctedRow.item_name_raw, "オルコロクロマイト");
assert.equal(correctedRow.item_name_verified, true);
assert.equal(correctedRow.item_name_resolution, "known_alias");

const exact = await canonicalizeGrandCompanyDelivery({ item_name: "シューコン" }, {
  fetchImpl: async url => {
    assert.match(String(url), /v2\.xivapi\.com\/api\/search/);
    return new Response(JSON.stringify({
      results: [{ row_id: 36172, fields: { Name: "Sykon", "Name@lang(ja)": "シューコン" } }]
    }), { status: 200, headers: { "content-type": "application/json" } });
  }
});
assert.equal(exact.item_name, "シューコン");
assert.equal(exact.item_id, 36172);
assert.equal(exact.item_name_verified, true);
assert.equal(exact.item_name_resolution, "exact");

const unavailable = await canonicalizeGrandCompanyDelivery({ item_name: "名称検証用テスト品" }, {
  fetchImpl: async () => new Response("unavailable", { status: 503 })
});
assert.equal(unavailable.item_name, "名称検証用テスト品", "failed verification must preserve the screenshot evidence instead of guessing");
assert.equal(unavailable.item_name_verified, false);
assert.equal(unavailable.item_name_resolution, "unverified");

const batch = await canonicalizeGrandCompanyDeliveries([
  { item_name: "オルコロクロマイト" },
  { item_name: "シューコン", item_id: 36172, item_name_verified: true, item_name_resolution: "exact" }
], { fetchImpl: async () => { throw new Error("known/verified rows must not need the network"); } });
assert.deepEqual(batch.map(row => row.item_name), ["オルコクロマイト", "シューコン"]);

const jsonModeSource = readFileSync(new URL("../src/gc-jsonmode-wrapper.js", import.meta.url), "utf8");
assert.match(jsonModeSource, /canonicalizeGrandCompanyDeliveries/);
assert.match(jsonModeSource, /canonicalPages/);
assert.match(jsonModeSource, /gc_item_name_canonicalization/);

const ready = decorateGrandCompanyDelivery(analysis.grand_company_deliveries.deliveries[1]);
assert.equal(ready.ready_now, true);
assert.equal(ready.missing_quantity, 0);

const recommendation = chooseGrandCompanyDelivery(analysis.grand_company_deliveries.deliveries);
assert.equal(recommendation.item_name, "テスト料理", "ready-to-submit row should beat a starred row that still needs procurement");
assert.equal(recommendation.ready_now, true);
assert.match(recommendation.recommendation_reason, /追加調達なし/);

const starred = chooseGrandCompanyDelivery([
  {
    item_name: "通常品",
    requested_quantity: 4,
    owned_quantity: 0,
    starred: false,
    confidence: 0.9
  },
  {
    item_name: "ボーナス品",
    requested_quantity: 5,
    owned_quantity: 2,
    starred: true,
    confidence: 0.9
  }
]);
assert.equal(starred.item_name, "ボーナス品");
assert.equal(starred.missing_quantity, 3);
assert.match(starred.recommendation_reason, /あと3個/);

assert.equal(chooseGrandCompanyDelivery([]), null);

const unknown = sanitizeGrandCompanyAnalysis({ recognized: false, confidence: 0.2, deliveries: [] });
assert.equal(unknown.page_type, "unknown");
assert.equal(unknown.grand_company_deliveries, null);

console.log("grand-company delivery tests: ok");

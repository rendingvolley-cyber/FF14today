import assert from "node:assert/strict";
import {
  chooseGrandCompanyDelivery,
  decorateGrandCompanyDelivery,
  sanitizeGrandCompanyAnalysis
} from "../src/grand-company-deliveries.js";
import { isGrandCompanyWorkflowContext } from "../src/grand-company-wrapper.js";

assert.equal(isGrandCompanyWorkflowContext("grand-company"), true);
assert.equal(isGrandCompanyWorkflowContext(" plan "), false);
assert.equal(isGrandCompanyWorkflowContext("journal"), false);

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

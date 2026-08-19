import assert from "node:assert/strict";
import fs from "node:fs";
import {
  GC_SUPPLY_DUTY_OCR_PARSER_VERSION,
  buildSupplyDutyOcrDictionary,
  buildSupplyDutyOcrPrompt,
  grandCompanyDictionarySchema,
  materializeSupplyDutyDictionaryNames,
  shouldReuseDictionaryOcrCache
} from "../src/gc-supply-duty-ocr-dictionary.js";

const jobs = [
  { code: "CRP", level: 91 },
  { code: "ARM", level: 90 },
  { code: "MIN", level: 96 },
  { code: "BTN", level: 94 },
  { code: "FSH", level: 84 }
];

let requestedUrl = "";
const fetchImpl = async url => {
  requestedUrl = String(url);
  return {
    ok: true,
    async json() {
      return {
        rows: [
          {
            row_id: 90,
            fields: {
              SupplyData: [
                { Item: [{ fields: { Name: "コンドライトインゴット" } }] },
                { Item: [{ fields: { Name: "インテグラル材" } }] }
              ]
            }
          },
          {
            row_id: 91,
            fields: {
              SupplyData: [
                { Item: [{ fields: { Name: "オピオタウロスレザー" } }] },
                { Item: [{ fields: { Name: "コンドライトインゴット" } }] }
              ]
            }
          },
          {
            row_id: 96,
            fields: {
              SupplyData: [{ Item: [{ fields: { Name: "採集側だけの候補" } }] }]
            }
          }
        ]
      };
    }
  };
};

const dictionary = await buildSupplyDutyOcrDictionary(jobs, "crafting", { fetchImpl });
assert.equal(dictionary.ok, true);
assert.equal(dictionary.page_kind, "crafting");
assert.deepEqual(dictionary.levels, [90, 91]);
assert.deepEqual(dictionary.item_names, [
  "インテグラル材",
  "オピオタウロスレザー",
  "コンドライトインゴット"
]);
assert.match(requestedUrl, /GCSupplyDuty/);
assert.match(decodeURIComponent(requestedUrl), /rows=90,91/);
assert.doesNotMatch(requestedUrl, /96/);

const prompt = buildSupplyDutyOcrPrompt(dictionary);
assert.match(prompt, /品名を自由記述してはいけません/);
assert.match(prompt, /FF14公式データ由来候補/);
assert.match(prompt, /item_index/);
assert.match(prompt, /候補にない文字列をOCR結果として作らない/);
assert.match(prompt, /英語への翻訳/);
assert.match(prompt, /Item 12345/);
assert.match(prompt, /2: コンドライトインゴット/);

const schema = grandCompanyDictionarySchema(dictionary);
const itemIndex = schema.properties.deliveries.items.properties.item_index;
assert.equal(itemIndex.type, "integer");
assert.equal(itemIndex.minimum, 0);
assert.equal(itemIndex.maximum, dictionary.item_names.length - 1);
assert.equal(schema.properties.deliveries.maxItems, 20);
assert.equal("item_name" in schema.properties.deliveries.items.properties, false, "Gemini schema must never accept a free-form item name");
const schemaText = JSON.stringify(schema);
assert.doesNotMatch(schemaText, /コンドライトインゴット|Ambrosial Water|Item 36210/, "candidate names must stay in the prompt, not explode schema serving states");

const materialized = materializeSupplyDutyDictionaryNames({
  recognized: true,
  confidence: 0.94,
  deliveries: [
    {
      item_index: 2,
      requested_quantity: 1,
      owned_quantity: 0,
      starred: false,
      confidence: 0.95
    },
    {
      item_index: 999,
      requested_quantity: 1,
      owned_quantity: 0,
      starred: false,
      confidence: 0.99
    }
  ]
}, dictionary);
assert.equal(materialized.recognized, true);
assert.equal(materialized.deliveries.length, 1, "out-of-range indexes must fail closed");
assert.equal(materialized.deliveries[0].item_name, "コンドライトインゴット");
assert.equal(materialized.deliveries[0].class_or_job, null);
assert.equal(materialized.deliveries[0].bonus_text, null);
assert.equal(materialized.deliveries[0].reward_text, null);

const signature = "dictionary-signature";
assert.equal(shouldReuseDictionaryOcrCache({
  page_type: "grand_company_deliveries",
  parser_version: "supply-duty-v3-item-dictionary",
  ocr_dictionary_signature: signature
}, signature), false, "old enum-schema cache must be invalidated");
assert.equal(shouldReuseDictionaryOcrCache({
  page_type: "grand_company_deliveries",
  parser_version: GC_SUPPLY_DUTY_OCR_PARSER_VERSION,
  ocr_dictionary_signature: "old-levels"
}, signature), false, "cache from a different level dictionary must be invalidated");
assert.equal(shouldReuseDictionaryOcrCache({
  page_type: "grand_company_deliveries",
  parser_version: GC_SUPPLY_DUTY_OCR_PARSER_VERSION,
  ocr_dictionary_signature: signature
}, signature), true);

const gatherDictionary = await buildSupplyDutyOcrDictionary(jobs, "gathering", {
  fetchImpl: async url => {
    const decoded = decodeURIComponent(String(url));
    assert.match(decoded, /rows=84,94,96/);
    return {
      ok: true,
      async json() {
        return {
          rows: [
            { row_id: 84, fields: { SupplyData: [{ Item: [{ fields: { Name: "収集用ではない採集候補A" } }] }] } },
            { row_id: 94, fields: { SupplyData: [{ Item: [{ fields: { Name: "採集候補B" } }] }] } },
            { row_id: 96, fields: { SupplyData: [{ Item: [{ fields: { Name: "採集候補C" } }] }] } }
          ]
        };
      }
    };
  }
});
assert.equal(gatherDictionary.ok, true);
assert.deepEqual(gatherDictionary.levels, [84, 94, 96]);

const entrySource = fs.readFileSync(new URL("../src/gc-supply-duty-entry.js", import.meta.url), "utf8");
const pageWrapperSource = fs.readFileSync(new URL("../src/gc-jsonmode-wrapper.js", import.meta.url), "utf8");
const wrapperSource = fs.readFileSync(new URL("../src/gc-supply-duty-dictionary-recognition-wrapper.js", import.meta.url), "utf8");
assert.match(entrySource, /import app from "\.\/task-board-recovery-wrapper\.js";/);
assert.match(
  pageWrapperSource,
  /import app from "\.\/gc-supply-duty-dictionary-recognition-wrapper\.js";/,
  "the page router must send the already page-scoped request through dictionary OCR"
);
assert.match(pageWrapperSource, /app\.fetch\(requestWithGcBudgetToken\(request, kind\), env\)/);
assert.match(
  wrapperSource,
  /import app from "\.\/gc-jsonmode-core-wrapper\.js";/,
  "the dictionary-constrained recognizer must sit directly before the legacy free-form GC parser"
);
assert.match(wrapperSource, /responseJsonSchema: grandCompanyDictionarySchema\(dictionary\)/);
assert.match(wrapperSource, /materializeSupplyDutyDictionaryNames\(parsed, dictionary\)/);
assert.match(wrapperSource, /ocr_dictionary_transport: "item_index"/);
assert.match(wrapperSource, /temperature: 0/);
assert.match(wrapperSource, /gc_ocr_dictionary_required: true/);
assert.match(wrapperSource, /shouldReuseDictionaryOcrCache/);
assert.match(wrapperSource, /FROM character_state/);
assert.match(wrapperSource, /OWNER_LODESTONE_ID/);
assert.doesNotMatch(wrapperSource, /item_name:\s*\{\s*type:\s*"string"/, "free-form item_name schema must not return");

console.log("GC supply-duty OCR uses FF14 candidate indexes without a large serving-state enum");

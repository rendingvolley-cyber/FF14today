import assert from "node:assert/strict";
import fs from "node:fs";
import { sanitizeGrandCompanyAnalysis } from "../src/grand-company-deliveries.js";
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
assert.match(prompt, /FF14公式データ由来候補/);
assert.match(prompt, /raw_item_name/);
assert.match(prompt, /できるだけ忠実に転記/);
assert.match(prompt, /最終的なFF14正式品名への確定はサーバー側コード/);
assert.match(prompt, /1行も省略せず/);
assert.match(prompt, /コンドライトインゴット/);
assert.doesNotMatch(prompt, /item_index/);

const schema = grandCompanyDictionarySchema(dictionary);
const deliverySchema = schema.properties.deliveries.items;
assert.equal(deliverySchema.properties.raw_item_name.type, "string");
assert.equal("item_index" in deliverySchema.properties, false, "Gemini must not choose final GC item IDs/indexes");
assert.equal("item_name" in deliverySchema.properties, false, "Gemini must not return a final canonical item name");
assert.equal(schema.properties.deliveries.maxItems, 20);
const schemaText = JSON.stringify(schema);
assert.doesNotMatch(schemaText, /コンドライトインゴット|Ambrosial Water|Item 36210/, "GC candidate names belong in prompt/server dictionary, not JSON schema enum states");

const typoResolved = materializeSupplyDutyDictionaryNames({
  recognized: true,
  confidence: 0.94,
  deliveries: [{
    raw_item_name: "コンドライ卜インゴット",
    requested_quantity: 1,
    owned_quantity: 0,
    starred: false,
    confidence: 0.72
  }]
}, dictionary);
assert.equal(typoResolved.recognized, true);
assert.equal(typoResolved.dictionary_constrained, true);
assert.equal(typoResolved.deliveries.length, 1);
assert.equal(typoResolved.deliveries[0].item_name, "コンドライトインゴット");
assert.equal(typoResolved.deliveries[0].item_name_raw, "コンドライ卜インゴット");
assert.equal(typoResolved.deliveries[0].item_name_verified, true);

const almastyDictionary = {
  page_kind: "crafting",
  levels: [82],
  item_names: [
    "アルマスティ・ストライカーヘッドバンド",
    "アルマスティ・スカウトヘッドバンド"
  ]
};
const almasty = materializeSupplyDutyDictionaryNames({
  recognized: true,
  confidence: 0.91,
  deliveries: [{
    raw_item_name: "アルマスティ・ストライカー・ヘッドバンド",
    requested_quantity: 1,
    owned_quantity: 0,
    starred: false,
    confidence: 0.42
  }]
}, almastyDictionary);
const sanitizedAlmasty = sanitizeGrandCompanyAnalysis(almasty, "test-model");
assert.equal(sanitizedAlmasty.page_type, "grand_company_deliveries");
assert.equal(sanitizedAlmasty.grand_company_deliveries.deliveries.length, 1);
assert.equal(sanitizedAlmasty.grand_company_deliveries.deliveries[0].item_name, "アルマスティ・ストライカーヘッドバンド");
assert.equal(sanitizedAlmasty.grand_company_deliveries.deliveries[0].confidence, 0.42);

const ambiguous = materializeSupplyDutyDictionaryNames({
  recognized: true,
  confidence: 0.8,
  deliveries: [{
    raw_item_name: "アルマスティ・ヘッドバンド",
    requested_quantity: 1,
    owned_quantity: 0,
    starred: false,
    confidence: 0.3
  }]
}, almastyDictionary);
assert.equal(ambiguous.deliveries.length, 1, "visible rows are preserved even when canonical matching is ambiguous");
assert.equal(ambiguous.deliveries[0].item_name, "品名要確認");
assert.equal(ambiguous.deliveries[0].item_name_verified, false);

const genericLowConfidence = sanitizeGrandCompanyAnalysis({
  recognized: true,
  confidence: 0.91,
  deliveries: [{
    item_name: "アルマスティ・ストライカーヘッドバンド",
    requested_quantity: 1,
    owned_quantity: 0,
    starred: false,
    confidence: 0.42
  }]
}, "test-model");
assert.equal(genericLowConfidence.page_type, "unknown", "non-dictionary OCR keeps the existing confidence gate");

const signature = "dictionary-signature";
assert.equal(GC_SUPPLY_DUTY_OCR_PARSER_VERSION, "supply-duty-v6-raw-ocr-deterministic-match");
for (const oldVersion of [
  "supply-duty-v5-preserve-visible-rows",
  "supply-duty-v4-item-index-dictionary",
  "supply-duty-v3-item-dictionary"
]) {
  assert.equal(shouldReuseDictionaryOcrCache({
    page_type: "grand_company_deliveries",
    parser_version: oldVersion,
    ocr_dictionary_signature: signature
  }, signature), false, `old cache ${oldVersion} must be invalidated`);
}
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
            { row_id: 84, fields: { SupplyData: [{ Item: [{ fields: { Name: "採集候補A" } }] }] } },
            { row_id: 94, fields: { SupplyData: [{ Item: [{ fields: { Name: "採集候補B" } }] }] } },
            { row_id: 96, fields: { SupplyData: [{ Item: [{ fields: { Name: "採集候補C" } }] }] }
          ]
        };
      }
    };
  }
});
assert.equal(gatherDictionary.ok, true);
assert.deepEqual(gatherDictionary.levels, [84, 94, 96]);

const pageWrapperSource = fs.readFileSync(new URL("../src/gc-jsonmode-wrapper.js", import.meta.url), "utf8");
const wrapperSource = fs.readFileSync(new URL("../src/gc-supply-duty-dictionary-recognition-wrapper.js", import.meta.url), "utf8");
assert.match(pageWrapperSource, /gc-supply-duty-dictionary-recognition-wrapper/);
assert.match(wrapperSource, /responseJsonSchema: grandCompanyDictionarySchema\(dictionary\)/);
assert.match(wrapperSource, /materializeSupplyDutyDictionaryNames\(parsed, dictionary\)/);
assert.match(wrapperSource, /temperature: 0/);
assert.match(wrapperSource, /gc_ocr_dictionary_required: true/);
assert.match(wrapperSource, /FROM character_state/);
assert.match(wrapperSource, /OWNER_LODESTONE_ID/);

console.log("GC OCR reads raw row text, then resolves only against current GCSupplyDuty candidates in code");
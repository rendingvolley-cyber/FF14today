import assert from "node:assert/strict";
import fs from "node:fs";
import {
  GC_SUPPLY_DUTY_OCR_PARSER_VERSION,
  buildSupplyDutyOcrDictionary,
  buildSupplyDutyOcrPrompt,
  grandCompanyDictionarySchema,
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
assert.match(prompt, /item_name は自由記述ではありません/);
assert.match(prompt, /FF14公式データ由来候補/);
assert.match(prompt, /候補にない文字列をOCR結果として作らない/);
assert.match(prompt, /英語への翻訳/);
assert.match(prompt, /Item 12345/);
assert.match(prompt, /コンドライトインゴット/);

const schema = grandCompanyDictionarySchema(dictionary);
const itemEnum = schema.properties.deliveries.items.properties.item_name.enum;
assert.deepEqual(itemEnum, dictionary.item_names);
assert.equal(itemEnum.includes("Item 36210"), false);
assert.equal(itemEnum.includes("Ambrosial Water"), false);
assert.equal(itemEnum.includes("Water Crystal"), false);

const signature = "dictionary-signature";
assert.equal(shouldReuseDictionaryOcrCache({
  page_type: "grand_company_deliveries",
  parser_version: "supply-duty-v2",
  ocr_dictionary_signature: signature
}, signature), false, "old free-OCR cache must be invalidated");
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
assert.match(wrapperSource, /temperature: 0/);
assert.match(wrapperSource, /gc_ocr_dictionary_required: true/);
assert.match(wrapperSource, /shouldReuseDictionaryOcrCache/);
assert.match(wrapperSource, /FROM character_state/);
assert.match(wrapperSource, /OWNER_LODESTONE_ID/);
assert.doesNotMatch(wrapperSource, /item_name:\s*\{\s*type:\s*"string"\s*\}/, "free-form item_name schema must not return");

console.log("GC supply-duty OCR is constrained by the current FF14 item dictionary before legacy OCR can run");

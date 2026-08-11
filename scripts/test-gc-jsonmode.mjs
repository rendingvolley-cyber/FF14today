import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../src/gc-jsonmode-wrapper.js", import.meta.url), "utf8");
const costWrapper = readFileSync(new URL("../src/gc-delivery-cost-wrapper.js", import.meta.url), "utf8");
const entry = readFileSync(new URL("../src/gc-supply-duty-entry.js", import.meta.url), "utf8");

assert.match(source, /responseMimeType:\s*"application\/json"/, "GC image analysis must request JSON output");
assert.doesNotMatch(source, /responseJsonSchema/, "GC image analysis must not use Gemini responseJsonSchema because it can exceed serving-state limits");
assert.match(source, /SUPPLY DUTY/);
assert.match(source, /軍需品調達/);
assert.match(source, /調達依頼品/);
assert.match(source, /supply-duty-json-v3/);
assert.match(source, /画像解析側で一時的なエラー/);
assert.match(entry, /gc-delivery-cost-wrapper\.js/, "production entry must route through the outer GC cost wrapper");
assert.match(costWrapper, /gc-jsonmode-wrapper\.js/, "GC cost wrapper must preserve the JSON-mode parser underneath it");

console.log("GC JSON-mode schema regression: ok");

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const core = readFileSync(new URL("../public/grand-company-routine-core.js", import.meta.url), "utf8");
const inbox = readFileSync(new URL("../public/context-inbox-core.js", import.meta.url), "utf8");
const css = readFileSync(new URL("../public/grand-company-routine.css", import.meta.url), "utf8");
const twoPage = readFileSync(new URL("../public/gc-two-page-ui.js", import.meta.url), "utf8");

assert.doesNotMatch(core, /まずこれを納品/);
assert.doesNotMatch(core, /残りの納品候補/);
assert.doesNotMatch(core, /gc-recommendation|gc-remaining/);
assert.doesNotMatch(core, /最初の1件/);
assert.doesNotMatch(inbox, /最初の1件/);
assert.match(core, /data-gc-plain-list/);
assert.match(core, /for \(const row of rows\) section\.append\(buildDeliveryRow\(row\)\)/);
assert.match(twoPage, /今日の納品一覧/);
assert.doesNotMatch(css, /\.gc-recommendation|\.gc-remaining/);
assert.match(css, /grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/);

console.log("GC legacy single-item view removed; full-list fallback and three-step tabs remain");

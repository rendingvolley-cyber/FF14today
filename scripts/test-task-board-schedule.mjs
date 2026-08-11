import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { activateNowLayout, correctedPreparationRange } from "../public/task-board-schedule-correction.js";

assert.equal(correctedPreparationRange("18:20–18:26"), "18:13–18:20");
assert.equal(correctedPreparationRange("00:03–00:09"), "23:56–00:03");
assert.equal(correctedPreparationRange("09:30-09:36", 5), "09:25–09:30");
assert.equal(correctedPreparationRange("時刻確認"), null);

const classes = new Set();
const root = { body: { classList: { add: value => classes.add(value) } } };
assert.equal(activateNowLayout(root), true);
assert.equal(classes.has("task-board-now-active"), true);

const source = readFileSync(new URL("../public/task-board-schedule-correction.js", import.meta.url), "utf8");
assert.match(source, /body\.task-board-primary:not\(\.task-board-now-active\) #nowPanel/);
assert.match(source, /body\.task-board-primary\.task-board-now-active #nowPanel \.method-alternative/);
assert.match(source, /\.task-now-button/);
assert.doesNotMatch(source, /MutationObserver/);

console.log("task board schedule timing and layout de-dup: ok");

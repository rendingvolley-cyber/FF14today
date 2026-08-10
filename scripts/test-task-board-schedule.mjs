import assert from "node:assert/strict";
import { correctedPreparationRange } from "../public/task-board-schedule-correction.js";

assert.equal(correctedPreparationRange("18:20–18:26"), "18:13–18:20");
assert.equal(correctedPreparationRange("00:03–00:09"), "23:56–00:03");
assert.equal(correctedPreparationRange("09:30-09:36", 5), "09:25–09:30");
assert.equal(correctedPreparationRange("時刻確認"), null);

console.log("task board schedule timing: ok");

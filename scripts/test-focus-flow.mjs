import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  normalizeFlowState,
  elapsedMinutes,
  formatElapsed,
  chooseNextUnskipped,
  patchCompletionBody
} from "../public/focus-flow.js";

const state = normalizeFlowState({
  active: { title: "赤魔レベルレ", startedAt: 1000, plannedMinutes: 30 },
  skippedTitles: ["A", "A", "", "B"]
});
assert.equal(state.active.title, "赤魔レベルレ");
assert.deepEqual(state.skippedTitles, ["A", "B"]);
assert.equal(elapsedMinutes(0, 180000), 3);
assert.equal(formatElapsed(0, 65000), "1:05");
assert.equal(chooseNextUnskipped("A", [{ title: "B" }, { title: "C" }], ["A", "B"]).title, "C");
assert.equal(chooseNextUnskipped("A", [{ title: "B" }], []), null);

const patched = patchCompletionBody(
  { task_title: "赤魔レベルレ", actual_minutes: 99 },
  { title: "赤魔レベルレ", startedAt: 60_000 },
  661_000
);
assert.equal(patched.actual_minutes, 10);
assert.equal(
  patchCompletionBody({ task_title: "別タスク", actual_minutes: 7 }, state.active, 661_000).actual_minutes,
  7
);

const source = readFileSync(new URL("../public/focus-flow.js", import.meta.url), "utf8");
assert.match(source, /observer\.disconnect\(\)/, "Focus Flow must pause its observer before mutating methodList");
assert.match(source, /observeMethodList\(\)/, "Focus Flow must resume observation after its own DOM writes");
assert.match(source, /finally\s*\{\s*observeMethodList\(\);\s*\}/s, "observer pause/resume must be exception-safe");

console.log("focus-flow tests: ok");

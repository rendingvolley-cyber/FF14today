import assert from "node:assert/strict";
import {
  normalizeFlowState,
  elapsedMinutes,
  formatElapsed,
  chooseNextUnskipped
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
console.log("focus-flow tests: ok");

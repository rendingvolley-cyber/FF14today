import assert from "node:assert/strict";
import {
  rebuildEfficientTaskBoardPlan,
  shouldRebuildEfficientTaskBoardPlan
} from "../src/task-board-recovery.js";

const character = {
  jobs: [
    { code: "ARM", name_ja: "甲冑師", level: 81, role: "crafter" },
    { code: "PLD", name_ja: "ナイト", level: 90, role: "tank" }
  ]
};

{
  const craftPlan = {
    selected_mode: "craft",
    planner_kind: "craft-leve-procurement-v1",
    focus_job: { code: "ARM", name: "甲冑師", level: 81, role: "crafter" },
    methods: [{ task_key: "craft:arm80:leve:high-durium-nugget", title: "甲冑師リーヴ「ハイダリウムナゲット」3個納品" }]
  };
  assert.equal(shouldRebuildEfficientTaskBoardPlan(craftPlan), false);
  const result = rebuildEfficientTaskBoardPlan({
    character,
    currentPlan: craftPlan,
    focusJobCode: "ARM",
    availableMinutes: 60,
    energy: 3
  });
  assert.equal(result, craftPlan, "combat recovery must not rebuild a craft plan after craft focus policy has run");
  assert.match(result.methods[0].title, /リーヴ/);
  assert.doesNotMatch(result.methods[0].title, /レポリット族/);
}

{
  const gatherPlan = { selected_mode: "gather", methods: [{ task_key: "gather:min81:test" }] };
  assert.equal(shouldRebuildEfficientTaskBoardPlan(gatherPlan), false);
  assert.equal(rebuildEfficientTaskBoardPlan({ character, currentPlan: gatherPlan, focusJobCode: "MIN" }), gatherPlan);
}

{
  assert.equal(shouldRebuildEfficientTaskBoardPlan({ selected_mode: "efficient" }), true);
  assert.equal(shouldRebuildEfficientTaskBoardPlan({}), true, "legacy callers without selected_mode remain compatible");
}

console.log("task-board recovery mode guard: ok");

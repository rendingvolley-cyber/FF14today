import assert from "node:assert/strict";
import { applyCombatJobFocus, levelingCombatJobs } from "../src/combat-job-focus.js";

const character = {
  jobs: [
    { code: "WAR", name_ja: "戦士", level: 100, role: "tank" },
    { code: "RDM", name_ja: "赤魔道士", level: 92, role: "caster" },
    { code: "SAM", name_ja: "侍", level: 90, role: "melee" },
    { code: "WHM", name_ja: "白魔道士", level: 80, role: "healer" },
    { code: "ALC", name_ja: "錬金術師", level: 91, role: "crafter" }
  ]
};

const basePlan = {
  selected_mode: "efficient",
  planner_kind: "decision-owned-v1.3",
  session_complete: false,
  methods: [],
  skip_today: []
};

const selectable = levelingCombatJobs(character);
assert.deepEqual(selectable.map(job => job.code), ["RDM", "SAM", "WHM"]);

const rdm = applyCombatJobFocus(basePlan, character, {
  focusJobCode: "RDM",
  availableMinutes: 60,
  completedDaily: { leveling: false, alliance: false },
  completionCounts: {}
});
assert.equal(rdm.focus_job.code, "RDM");
assert.equal(rdm.focus_job.level, 92);
assert.equal(rdm.methods[0].job_code, "RDM");
assert.ok(rdm.methods.some(method => method.task_key === "leveling-dungeon:RDM:91"));

const sam = applyCombatJobFocus(basePlan, character, {
  focusJobCode: "SAM",
  availableMinutes: 60,
  completedDaily: { leveling: false, alliance: false },
  completionCounts: {}
});
assert.equal(sam.focus_job.code, "SAM");
assert.ok(sam.methods.every(method => !method.job_code || method.job_code === "SAM"));

const capped = applyCombatJobFocus(basePlan, character, {
  focusJobCode: "WAR",
  availableMinutes: 60,
  completedDaily: {},
  completionCounts: {}
});
assert.equal(capped, basePlan);

const lowerAfterDailies = applyCombatJobFocus(basePlan, character, {
  focusJobCode: "WHM",
  availableMinutes: 60,
  completedDaily: { leveling: true, alliance: true },
  completionCounts: {}
});
assert.equal(lowerAfterDailies.focus_job.code, "WHM");
assert.equal(lowerAfterDailies.session_complete, true);
assert.equal(lowerAfterDailies.methods.length, 0);
assert.match(lowerAfterDailies.notice, /候補不足|データが不足/);

console.log("combat job focus rules OK");

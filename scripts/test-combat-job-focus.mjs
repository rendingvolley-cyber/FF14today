import assert from "node:assert/strict";
import { applyCombatJobFocus, levelingCombatJobs } from "../src/combat-job-focus.js";

const character = {
  jobs: [
    { code: "WAR", name_ja: "戦士", level: 100, role: "tank" },
    { code: "RDM", name_ja: "赤魔道士", level: 92, role: "caster" },
    { code: "SAM", name_ja: "侍", level: 90, role: "melee" },
    { code: "SCH", name_ja: "学者", level: 81, role: "healer" },
    { code: "WHM", name_ja: "白魔道士", level: 80, role: "healer" },
    { code: "ALC", name_ja: "錬金術師", level: 90, role: "crafter" }
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
assert.deepEqual(selectable.map(job => job.code), ["RDM", "SAM", "SCH", "WHM"]);

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
  completedDaily: { leveling: true, alliance: true },
  completionCounts: {}
});
assert.equal(sam.focus_job.code, "SAM");
assert.equal(sam.session_complete, false);
assert.equal(sam.methods.length, 1);
assert.equal(sam.methods[0].task_key, "leveling-dungeon:SAM:89");
assert.match(sam.methods[0].title, /アイティオン星晶鏡/);

const scholar = applyCombatJobFocus(basePlan, character, {
  focusJobCode: "SCH",
  availableMinutes: 60,
  completedDaily: { leveling: true, alliance: true },
  completionCounts: {}
});
assert.equal(scholar.methods[0].task_key, "leveling-dungeon:SCH:81");
assert.match(scholar.methods[0].title, /ゾットの塔/);

const whiteMage = applyCombatJobFocus(basePlan, character, {
  focusJobCode: "WHM",
  availableMinutes: 60,
  completedDaily: { leveling: true, alliance: true },
  completionCounts: {}
});
assert.equal(whiteMage.focus_job.code, "WHM");
assert.equal(whiteMage.session_complete, false);
assert.equal(whiteMage.methods[0].task_key, "leveling-dungeon:WHM:79");
assert.match(whiteMage.methods[0].title, /グルグ火山/);

const midBandCases = [
  [82, 81, "ゾットの塔"],
  [83, 83, "バブイルの塔"],
  [84, 83, "バブイルの塔"],
  [85, 85, "ヴァナスパティ"],
  [86, 85, "ヴァナスパティ"],
  [87, 87, "ヒュペルボレア造物院"],
  [88, 87, "ヒュペルボレア造物院"],
  [89, 89, "アイティオン星晶鏡"]
];
for (const [level, dutyLevel, dutyName] of midBandCases) {
  const synthetic = { jobs: [{ code: "TST", name_ja: "テスト", level, role: "tank" }] };
  const plan = applyCombatJobFocus(basePlan, synthetic, {
    focusJobCode: "TST",
    availableMinutes: 60,
    completedDaily: { leveling: true, alliance: true },
    completionCounts: {}
  });
  assert.equal(plan.session_complete, false, `Lv${level} should have a grounded repeat route`);
  assert.equal(plan.methods[0].task_key, `leveling-dungeon:TST:${dutyLevel}`);
  assert.match(plan.methods[0].title, new RegExp(dutyName));
}

const capped = applyCombatJobFocus(basePlan, character, {
  focusJobCode: "WAR",
  availableMinutes: 60,
  completedDaily: {},
  completionCounts: {}
});
assert.equal(capped, basePlan);

console.log("combat job focus rules OK");

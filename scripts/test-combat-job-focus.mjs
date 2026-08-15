import assert from "node:assert/strict";
import { applyCombatJobFocus, levelingCombatJobs } from "../src/combat-job-focus.js";
import { makeConcretePlan } from "../src/concrete-plan.js";

const character = {
  bozja_rank: 23,
  jobs: [
    { code: "WAR", name_ja: "戦士", level: 100, role: "tank" },
    { code: "RDM", name_ja: "赤魔道士", level: 92, role: "caster" },
    { code: "SAM", name_ja: "侍", level: 90, role: "melee" },
    { code: "SCH", name_ja: "学者", level: 81, role: "healer" },
    { code: "WHM", name_ja: "白魔道士", level: 80, role: "healer" },
    { code: "BLU", name_ja: "青魔道士", level: 70, role: "limited" },
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
assert.deepEqual(selectable.map(job => job.code), ["RDM", "SAM", "SCH", "WHM", "BLU"]);

const catchupBase = makeConcretePlan(character, 60, 3, null, { leveling: false, alliance: false }, {}, "efficient");
assert.equal(catchupBase.focus_job.code, "WHM");
assert.equal(catchupBase.focus_job.level, 80);
assert.match(catchupBase.notice, /最低Lv側/);
assert.match(catchupBase.planner_kind, /low-level-catchup/);

const catchupCraft = makeConcretePlan({
  jobs: [
    { code: "BSM", name_ja: "鍛冶師", level: 95, role: "crafter" },
    { code: "ALC", name_ja: "錬金術師", level: 91, role: "crafter" }
  ]
}, 60, 3, null, {}, {}, "craft");
assert.equal(catchupCraft.focus_job.code, "ALC");

const catchupGather = makeConcretePlan({
  jobs: [
    { code: "BTN", name_ja: "園芸師", level: 90, role: "gatherer" },
    { code: "MIN", name_ja: "採掘師", level: 81, role: "gatherer" }
  ]
}, 60, 3, null, {}, {}, "gather");
assert.equal(catchupGather.focus_job.code, "MIN");

const rdmDaily = applyCombatJobFocus(basePlan, character, {
  focusJobCode: "RDM",
  availableMinutes: 60,
  completedDaily: { leveling: false, alliance: false },
  completionCounts: {}
});
assert.equal(rdmDaily.focus_job.code, "RDM");
assert.equal(rdmDaily.methods[0].task_key, "roulette:leveling");
assert.ok(rdmDaily.methods.some(method => method.task_key === "daily:frontline"));
assert.ok(rdmDaily.combat_efficiency_comparator);

const rdmAfterDailies = applyCombatJobFocus(basePlan, character, {
  focusJobCode: "RDM",
  availableMinutes: 60,
  completedDaily: { leveling: true, alliance: true },
  completionCounts: { "daily:frontline": 1 }
});
assert.equal(rdmAfterDailies.focus_job.code, "RDM");
assert.ok(rdmAfterDailies.methods.some(method => method.task_key === "leveling-dungeon:RDM:91"));
assert.ok(!rdmAfterDailies.methods.some(method => method.task_key === "daily:frontline"));

const sam = applyCombatJobFocus(basePlan, character, {
  focusJobCode: "SAM",
  availableMinutes: 60,
  completedDaily: { leveling: true, alliance: true },
  completionCounts: { "daily:frontline": 1 }
});
assert.equal(sam.focus_job.code, "SAM");
assert.ok(sam.methods.every(method => !method.job_code || method.job_code === "SAM"));
assert.ok(sam.methods.some(method => /アイティオン星晶鏡/.test(method.title)));
assert.ok(sam.methods.some(method => /ボズヤ/.test(method.title)));

const scholar = applyCombatJobFocus(basePlan, character, {
  focusJobCode: "SCH",
  availableMinutes: 60,
  completedDaily: { leveling: true, alliance: true },
  completionCounts: { "daily:frontline": 1 }
});
assert.ok(scholar.methods.some(method => method.task_key === "leveling-dungeon:SCH:81"));
assert.ok(scholar.methods.some(method => /ゾットの塔/.test(method.title)));

const whiteMage = applyCombatJobFocus(basePlan, character, {
  focusJobCode: "WHM",
  availableMinutes: 60,
  completedDaily: { leveling: true, alliance: true },
  completionCounts: { "daily:frontline": 1 }
});
assert.equal(whiteMage.focus_job.code, "WHM");
assert.ok(whiteMage.methods.some(method => method.task_key === "leveling-dungeon:WHM:79"));
assert.ok(whiteMage.methods.some(method => /グルグ火山/.test(method.title)));

const level70Normal = {
  jobs: [{ code: "TST", name_ja: "テストナイト", level: 70, role: "tank" }]
};
const level70Plan = applyCombatJobFocus(basePlan, level70Normal, {
  focusJobCode: "TST",
  availableMinutes: 60,
  completedDaily: { leveling: true, alliance: true },
  completionCounts: { "daily:frontline": 1 }
});
assert.equal(level70Plan.session_complete, false);
assert.equal(level70Plan.methods[0].task_key, "leveling-dungeon:TST:69");
assert.match(level70Plan.methods[0].title, /カストルム・アバニア/);

const midBandCases = [
  [71, 71, "ホルミンスター"],
  [73, 73, "ドォーヌ・メグ"],
  [75, 75, "キタンナ神影洞"],
  [77, 77, "マリカの大井戸"],
  [79, 79, "グルグ火山"],
  [82, 81, "ゾットの塔"],
  [83, 83, "バブイルの塔"],
  [85, 85, "ヴァナスパティ"],
  [87, 87, "ヒュペルボレア造物院"],
  [89, 89, "アイティオン星晶鏡"]
];
for (const [level, dutyLevel, dutyName] of midBandCases) {
  const synthetic = { jobs: [{ code: "TST", name_ja: "テスト", level, role: "tank" }] };
  const plan = applyCombatJobFocus(basePlan, synthetic, {
    focusJobCode: "TST",
    availableMinutes: 60,
    completedDaily: { leveling: true, alliance: true },
    completionCounts: { "daily:frontline": 1 }
  });
  assert.equal(plan.session_complete, false, `Lv${level} should have a grounded repeat route`);
  assert.equal(plan.methods[0].task_key, `leveling-dungeon:TST:${dutyLevel}`);
  assert.match(plan.methods[0].title, new RegExp(dutyName));
}

const blu = applyCombatJobFocus(basePlan, character, {
  focusJobCode: "BLU",
  availableMinutes: 30,
  completedDaily: { leveling: false, alliance: false },
  completionCounts: {}
});
assert.equal(blu.focus_job.code, "BLU");
assert.equal(blu.focus_job.level, 70);
assert.equal(blu.methods[0].task_key, "blu:70-79:tempest-clionid-solo");
assert.match(blu.methods[0].title, /ディープシーリーチ.*クリオニッド/);
assert.ok(!blu.methods.some(method => /ルーレット|フロントライン/.test(method.title)));
assert.match(blu.notice, /リミテッドジョブ/);

const capped = applyCombatJobFocus(basePlan, character, {
  focusJobCode: "WAR",
  availableMinutes: 60,
  completedDaily: {},
  completionCounts: {}
});
assert.equal(capped, basePlan);

console.log("combat job focus rules OK");

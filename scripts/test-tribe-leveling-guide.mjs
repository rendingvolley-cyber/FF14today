import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  ALLIED_SOCIETY_DAILY_LIMIT,
  ALLIED_SOCIETY_QUESTS_PER_GROUP,
  buildTribeDailyPlan,
  tribeGuideForJob
} from "../public/tribe-leveling-data.js";
import {
  buildEffectiveTribeGroups,
  canAllocateRankupExtra,
  countCompletedTribeQuests,
  countPlannedTribeQuests,
  rankupBatchKey
} from "../public/tribe-rankup-extra.js";

const pixie = tribeGuideForJob({ code: "DRG", role: "melee", level: 70 });
assert.equal(pixie.id, "pixie");
assert.match(pixie.first_step, /夢と現の狭間で/);
assert.match(pixie.first_step, /X:13\.1 Y:15\.3/);

const arkasodara = tribeGuideForJob({ code: "SCH", role: "healer", level: 81 });
assert.equal(arkasodara.id, "arkasodara");
assert.match(arkasodara.first_step, /アジムステップの若き冒険者/);
assert.ok(arkasodara.steps.some(step => /錬金術師と赤ん坊/.test(step)));
assert.ok(arkasodara.steps.some(step => /爆走ヒッポ、島を駆る/.test(step)));

const pelupelu = tribeGuideForJob({ code: "RDM", role: "caster", level: 92 });
assert.equal(pelupelu.id, "pelupelu");
assert.match(pelupelu.first_step, /新事業！ トラル旅行公司/);
assert.match(pelupelu.first_step, /X:13\.6 Y:12\.9/);
assert.equal(tribeGuideForJob({ code: "WAR", role: "tank", level: 100 })?.id, "pelupelu");

assert.equal(tribeGuideForJob({ code: "BLU", role: "limited", level: 70 }), null);
assert.equal(tribeGuideForJob({ code: "ALC", role: "crafter", level: 90 }), null);

const jobs = [
  { code: "RPR", name_ja: "リーパー", role: "melee", level: 73 },
  { code: "BLM", name_ja: "黒魔道士", role: "caster", level: 66 },
  { code: "CRP", name_ja: "木工師", role: "crafter", level: 75 },
  { code: "ALC", name_ja: "錬金術師", role: "crafter", level: 91 },
  { code: "MIN", name_ja: "採掘師", role: "gatherer", level: 85 },
  { code: "BTN", name_ja: "園芸師", role: "gatherer", level: 95 },
  { code: "FSH", name_ja: "漁師", role: "gatherer", level: 72 }
];

const daily = buildTribeDailyPlan({ jobs }, {
  focus: { combat: "RPR", craft: "ALC", gather: "BTN" }
});
assert.match(daily.version, /level-band-strict/);
assert.equal(daily.daily_limit, ALLIED_SOCIETY_DAILY_LIMIT);
assert.equal(daily.quests_per_society, ALLIED_SOCIETY_QUESTS_PER_GROUP);
assert.equal(daily.planned_quests, 12);
assert.equal(daily.remaining_quests, 0);
assert.equal(daily.groups.length, 4);
assert.ok(daily.groups.every(group => group.quests === 3));
assert.ok(daily.groups.every(group => group.kind === "leveling" && group.conditional === false));
assert.equal(new Set(daily.groups.map(group => group.society_id)).size, daily.groups.length);

// Combat/craft still catch up low jobs, but gathering follows the selected gathering job.
assert.ok(daily.groups.some(group => ["kojin", "ananta"].includes(group.society_id) && group.target_job_code === "BLM" && group.target_job_level === 66));
assert.ok(daily.groups.some(group => group.society_id === "dwarf" && group.target_job_code === "CRP" && group.target_job_level === 75));
assert.ok(daily.groups.some(group => group.society_id === "mamool_ja" && group.target_job_code === "BTN" && group.target_job_level === 95));
assert.equal(daily.groups.some(group => group.society_id === "omicron"), false);
assert.equal(daily.groups.some(group => group.target_job_code === "FSH"), false);
assert.equal(daily.conditional_quests, 0);
assert.match(daily.note, /適正帯外の旧友好部族/);

// Focus remains a tie-break for combat when two eligible jobs share a level.
const sameLevel = buildTribeDailyPlan({
  jobs: [
    { code: "DRG", name_ja: "竜騎士", role: "melee", level: 73 },
    { code: "RPR", name_ja: "リーパー", role: "melee", level: 73 }
  ]
}, { focus: { combat: "RPR" } });
assert.ok(sameLevel.groups.some(group => group.society_id === "pixie" && group.target_job_code === "RPR"));

// Old societies are never resurrected merely to fill 12 allowances.
const onlyCombat = buildTribeDailyPlan({
  jobs: [{ code: "RPR", name_ja: "リーパー", role: "melee", level: 73 }]
}, { focus: { combat: "RPR" } });
assert.deepEqual(onlyCombat.groups.map(group => group.society_id), ["pixie"]);
assert.equal(onlyCombat.planned_quests, 3);
assert.equal(onlyCombat.remaining_quests, 9);
assert.equal(onlyCombat.conditional_quests, 0);

// MIN/BTN above 90 must use the current gathering society even when Fisher is still in the 80s.
const gatherHigh = buildTribeDailyPlan({
  jobs: [
    { code: "MIN", name_ja: "採掘師", role: "gatherer", level: 91 },
    { code: "BTN", name_ja: "園芸師", role: "gatherer", level: 95 },
    { code: "FSH", name_ja: "漁師", role: "gatherer", level: 84 }
  ]
}, { focus: { gather: "BTN" } });
assert.ok(gatherHigh.groups.some(group => group.society_id === "mamool_ja" && group.target_job_code === "BTN"));
assert.equal(gatherHigh.groups.some(group => group.society_id === "omicron"), false);

// Without an explicit gathering focus, MIN/BTN are the default basis and a low Fisher does not drag the plan backwards.
const gatherDefault = buildTribeDailyPlan({
  jobs: [
    { code: "MIN", name_ja: "採掘師", role: "gatherer", level: 91 },
    { code: "BTN", name_ja: "園芸師", role: "gatherer", level: 95 },
    { code: "FSH", name_ja: "漁師", role: "gatherer", level: 84 }
  ]
});
assert.ok(gatherDefault.groups.some(group => group.society_id === "mamool_ja" && group.target_job_code === "MIN"));
assert.equal(gatherDefault.groups.some(group => group.society_id === "omicron"), false);

// Fisher can still intentionally use Omicron when Fisher itself is selected and in the 80s.
const fisherFocused = buildTribeDailyPlan({
  jobs: [
    { code: "MIN", name_ja: "採掘師", role: "gatherer", level: 91 },
    { code: "BTN", name_ja: "園芸師", role: "gatherer", level: 95 },
    { code: "FSH", name_ja: "漁師", role: "gatherer", level: 84 }
  ]
}, { focus: { gather: "FSH" } });
assert.ok(fisherFocused.groups.some(group => group.society_id === "omicron" && group.target_job_code === "FSH"));
assert.equal(fisherFocused.groups.some(group => group.society_id === "mamool_ja"), false);

const gatherCap = buildTribeDailyPlan({
  jobs: [
    { code: "MIN", name_ja: "採掘師", role: "gatherer", level: 100 },
    { code: "BTN", name_ja: "園芸師", role: "gatherer", level: 100 }
  ]
}, { focus: { gather: "MIN" } });
assert.ok(gatherCap.groups.some(group => group.society_id === "mamool_ja"));
assert.equal(gatherCap.groups.some(group => group.society_id === "omicron"), false);

const limitedOnly = buildTribeDailyPlan({
  jobs: [{ code: "BLU", name_ja: "青魔道士", role: "limited", level: 80 }]
});
assert.equal(limitedOnly.planned_quests, 0);
assert.equal(limitedOnly.remaining_quests, 12);
assert.deepEqual(limitedOnly.groups, []);

// A rank-up unlocks another batch of 3, but never increases the global daily total above 12.
const rankupBase = [
  { society_id: "a", society_name: "A族", quests: 3, priority_rank: 1, kind: "leveling" },
  { society_id: "b", society_name: "B族", quests: 3, priority_rank: 2, kind: "leveling" },
  { society_id: "c", society_name: "C族", quests: 3, priority_rank: 3, kind: "leveling" },
  { society_id: "d", society_name: "D族", quests: 3, priority_rank: 4, kind: "leveling" }
];
assert.equal(canAllocateRankupExtra({ baseGroups: rankupBase, doneKeys: [], societyId: "a" }), false, "first three must be completed before the rank-up button is valid");
assert.equal(canAllocateRankupExtra({ baseGroups: rankupBase, doneKeys: ["a"], societyId: "a" }), true);

const rankupGroups = buildEffectiveTribeGroups(rankupBase, ["a"], ["a"], 12);
assert.equal(rankupGroups.length, 4);
assert.equal(countPlannedTribeQuests(rankupGroups, 12), 12);
assert.ok(rankupGroups.some(group => group.batch_key === rankupBatchKey("a") && group.rankup_extra));
assert.equal(rankupGroups.some(group => group.society_id === "d"), false, "lowest-priority unfinished batch is replaced, not added as a 13th-15th quest");
assert.equal(countCompletedTribeQuests(rankupGroups, ["a"]), 3);
assert.equal(countCompletedTribeQuests(rankupGroups, ["a", rankupBatchKey("a")]), 6);
assert.equal(canAllocateRankupExtra({ baseGroups: rankupBase, rankupSocietyIds: ["a"], doneKeys: ["a"], societyId: "a" }), false, "same rank-up batch is not added twice");

const shortPlan = rankupBase.slice(0, 2);
const shortRankup = buildEffectiveTribeGroups(shortPlan, ["a"], ["a"], 12);
assert.equal(shortRankup.length, 3);
assert.equal(countPlannedTribeQuests(shortRankup, 12), 9, "unused daily allowance can be filled without displacing another batch");

const routineUi = await readFile(new URL("../public/routine-tribe-step.js", import.meta.url), "utf8");
assert.match(routineUi, /友好部族 今日の12枠/);
assert.match(routineUi, /data-tribe-group-toggle/);
assert.match(routineUi, /ランクアップしたので追加3件受注/);
assert.match(routineUi, /12枠内へ反映済み/);
assert.match(routineUi, /TRIBE_DAILY_RANKUP_PREFIX/);
assert.match(routineUi, /0\/12/);
assert.match(routineUi, /残りは今日はやらない/);
assert.doesNotMatch(routineUi, /今日の友好部族 \$\{count\}\/2/);

console.log("tribe leveling guide rules OK");

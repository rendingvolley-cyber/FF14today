import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  ALLIED_SOCIETY_DAILY_LIMIT,
  ALLIED_SOCIETY_QUESTS_PER_GROUP,
  buildTribeDailyPlan,
  tribeGuideForJob
} from "../public/tribe-leveling-data.js";

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

assert.equal(tribeGuideForJob({ code: "BLU", role: "limited", level: 70 }), null);
assert.equal(tribeGuideForJob({ code: "WAR", role: "tank", level: 100 }), null);
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
assert.equal(daily.daily_limit, ALLIED_SOCIETY_DAILY_LIMIT);
assert.equal(daily.quests_per_society, ALLIED_SOCIETY_QUESTS_PER_GROUP);
assert.equal(daily.planned_quests, 12);
assert.equal(daily.remaining_quests, 0);
assert.equal(daily.groups.length, 4);
assert.ok(daily.groups.every(group => group.quests === 3));
assert.equal(new Set(daily.groups.map(group => group.society_id)).size, daily.groups.length);
assert.ok(daily.groups.some(group => group.society_id === "pixie" && group.target_job_code === "RPR" && group.focused));
assert.ok(daily.groups.some(group => group.society_id === "yok_huy" && group.target_job_code === "ALC" && group.focused));
assert.ok(daily.groups.some(group => group.society_id === "mamool_ja" && group.target_job_code === "BTN" && group.focused));
assert.ok(daily.leveling_quests >= 9);
assert.ok(daily.planned_quests <= 12);

const onlyCombat = buildTribeDailyPlan({
  jobs: [{ code: "RPR", name_ja: "リーパー", role: "melee", level: 73 }]
}, { focus: { combat: "RPR" } });
assert.ok(onlyCombat.groups.some(group => group.society_id === "pixie" && group.kind === "leveling"));
assert.ok(onlyCombat.groups.filter(group => group.conditional).every(group => group.kind === "progression"));
assert.ok(onlyCombat.conditional_quests > 0);
assert.ok(onlyCombat.planned_quests <= 12);

const limitedOnly = buildTribeDailyPlan({
  jobs: [{ code: "BLU", name_ja: "青魔道士", role: "limited", level: 80 }]
});
assert.equal(limitedOnly.planned_quests, 0);
assert.equal(limitedOnly.remaining_quests, 12);
assert.deepEqual(limitedOnly.groups, []);

const routineUi = await readFile(new URL("../public/routine-tribe-step.js", import.meta.url), "utf8");
assert.match(routineUi, /友好部族 今日の12枠/);
assert.match(routineUi, /data-tribe-group-toggle/);
assert.match(routineUi, /0\/12/);
assert.match(routineUi, /残りは今日はやらない/);
assert.doesNotMatch(routineUi, /今日の友好部族 \$\{count\}\/2/);

console.log("tribe leveling guide rules OK");

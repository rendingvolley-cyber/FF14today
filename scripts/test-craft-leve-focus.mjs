import assert from "node:assert/strict";
import { armorerLeveMethods, replaceCraftSocietyFallback } from "../src/craft-leve-focus-wrapper.js";
import { buildLeveCostAdvice } from "../src/leve-cost-advisor.js";
import { collectReachableItemIds, leveTarget } from "../src/leve-cost-data.js";

const arm81 = { code: "ARM", name: "甲冑師", level: 81, role: "crafter" };
const methods = armorerLeveMethods(arm81, 60);
assert.equal(methods.length, 2);
assert.equal(methods[0].job_code, "ARM");
assert.match(methods[0].title, /ハイダリウム・スレイヤーアームガード/);
assert.match(methods[0].title, /1個納品/);
assert.equal(methods[0].leve_reward_exp, 935000);
assert.equal(methods[0].leve_reward_gil, null);
assert.doesNotMatch(methods[0].reason, /G。|ギル|Gil/i);
assert.equal(methods[1].delivery_quantity, 3);
assert.match(methods[1].title, /ハイダリウムナゲット/);

const arm90 = armorerLeveMethods({ code: "ARM", name: "甲冑師", level: 90, role: "crafter" }, 60);
assert.equal(arm90.length, 2, "ARM Lv90 must enter the Dawntrail leve catalog instead of becoming empty");
assert.match(arm90[0].title, /オルコクロマイトインゴット/);
assert.equal(arm90[0].delivery_quantity, 3);
assert.equal(arm90[0].leve_reward_exp, 1440660);
assert.equal(arm90[0].leve_location, "トライヨラ");
assert.match(arm90[0].condition, /トライヨラ/);
assert.match(arm90[1].title, /オルコクロマイト・タワーシールド/);

const arm91 = armorerLeveMethods({ code: "ARM", name: "甲冑師", level: 91, role: "crafter" }, 60);
assert.deepEqual(arm91.map(row => row.leve_level), [90, 90], "Lv91 must continue using the Lv90 leve band");

const arm99 = armorerLeveMethods({ code: "ARM", name: "甲冑師", level: 99, role: "crafter" }, 60);
assert.equal(arm99.length, 2);
assert.deepEqual(arm99.map(row => row.leve_level), [98, 98]);
assert.match(arm99[0].title, /カザナル・スカウトグローブ/);
assert.match(arm99[1].title, /カザナル・スレイヤーグリーヴ/);
assert.deepEqual(armorerLeveMethods({ code: "ARM", name: "甲冑師", level: 100, role: "crafter" }), [], "max-level ARM should not receive leveling leves from this catalog");

const armguardsTarget = leveTarget(methods[0].task_key);
const nuggetTarget = leveTarget(methods[1].task_key);
assert.equal(armguardsTarget?.itemId, 34107, "ARM Lv80 armguards leve must use the verified static material graph");
assert.equal(nuggetTarget?.itemId, 36168, "ARM Lv80 nugget leve must use the verified static material graph");
assert.equal(armguardsTarget?.hqRequired, false);
assert.equal(nuggetTarget?.requiredQuantity, 3);
assert.deepEqual(
  new Set(collectReachableItemIds(armguardsTarget)),
  new Set([34107, 36168, 36162, 5113, 9, 36247, 27757, 11])
);

const armPrices = {
  34107: { nq: 24978 },
  36168: { nq: 1200 },
  36162: { nq: 100 },
  5113: { nq: 50 },
  9: { nq: 20 },
  11: { nq: 20 },
  36247: { nq: 900 },
  27757: { nq: 700 }
};
const armguardsAdvice = buildLeveCostAdvice(armguardsTarget, armPrices, {
  energy: 4,
  availableMinutes: 60,
  preferTraining: true
});
const armguardsRaw = armguardsAdvice.routes.find(route =>
  route.crafts?.some(row => row.itemId === 34107)
  && route.purchases?.some(row => row.itemId === 36162)
);
assert.ok(armguardsRaw, "an expanded armguards craft route must be available");
const armguardsMaterials = new Map((armguardsRaw.purchases || []).map(row => [row.itemId, row.quantity]));
assert.equal(armguardsMaterials.get(36162), 10, "two ARM nuggets need ten High Durium Sand");
assert.equal(armguardsMaterials.get(5113), 2, "two ARM nuggets need two Silver Ore");
assert.equal(armguardsMaterials.get(9), 24, "ARM nugget crystals must combine with the final armguards crystals");
assert.equal(armguardsMaterials.get(11), 7);
assert.equal(armguardsMaterials.get(36247), 1);
assert.equal(armguardsMaterials.get(27757), 1);
assert.equal(armguardsMaterials.has(36168), false, "High Durium Nugget must be expanded instead of left as an unresolved purchase");

const nuggetAdvice = buildLeveCostAdvice(nuggetTarget, armPrices, {
  energy: 4,
  availableMinutes: 60,
  preferTraining: true
});
const nuggetRaw = nuggetAdvice.routes.find(route =>
  route.crafts?.some(row => row.itemId === 36168)
  && route.purchases?.some(row => row.itemId === 36162)
);
assert.ok(nuggetRaw, "an expanded ARM nugget craft route must be available");
const nuggetMaterials = new Map((nuggetRaw.purchases || []).map(row => [row.itemId, row.quantity]));
assert.equal(nuggetMaterials.get(36162), 15);
assert.equal(nuggetMaterials.get(5113), 3);
assert.equal(nuggetMaterials.get(9), 24, "ARM High Durium Nugget must use Ice Crystal, not the Blacksmith Fire Crystal recipe");

const data = {
  plan: {
    selected_mode: "craft",
    focus_job: arm81,
    methods: [{ task_key: "craft:arm:society:loporrit", badge: "友好部族・3件", job_code: "ARM", job_name: "甲冑師", job_level: 81 }],
    remaining_minutes: 60
  }
};
const replaced = replaceCraftSocietyFallback(structuredClone(data), { availableMinutes: 60 });
assert.equal(replaced.plan.planner_kind, "craft-leve-procurement-v1");
assert.equal(replaced.plan.methods.length, 2);
assert.ok(replaced.plan.methods.every(row => row.task_key.includes(":leve:")));
assert.doesNotMatch(replaced.plan.methods.map(row => row.title).join(" "), /レポリット|友好部族/);

const level90Data = {
  plan: {
    selected_mode: "craft",
    focus_job: { code: "ARM", name: "甲冑師", level: 90, role: "crafter" },
    methods: [{ task_key: "craft:arm:society:placeholder", badge: "友好部族・3件", job_code: "ARM", job_name: "甲冑師", job_level: 90 }],
    remaining_minutes: 60
  }
};
const replaced90 = replaceCraftSocietyFallback(structuredClone(level90Data), { availableMinutes: 60 });
assert.equal(replaced90.plan.methods.length, 2);
assert.equal(replaced90.plan.session_complete, false);
assert.match(replaced90.plan.methods[0].title, /オルコクロマイト/);
assert.ok(replaced90.plan.methods.every(row => row.leve_location === "トライヨラ"));

const alcConcrete = {
  plan: {
    selected_mode: "craft",
    focus_job: { code: "ALC", name: "錬金術師", level: 91, role: "crafter" },
    methods: [{ task_key: "craft:alc90:leve:ginseng-angle-brush", title: "existing concrete leve" }]
  }
};
assert.equal(replaceCraftSocietyFallback(structuredClone(alcConcrete)).plan.methods[0].title, "existing concrete leve");

const unsupportedSociety = {
  plan: {
    selected_mode: "craft",
    focus_job: { code: "BSM", name: "鍛冶師", level: 95, role: "crafter" },
    methods: [{ task_key: "craft:bsm:society:yok_huy", badge: "友好部族・3件" }]
  }
};
const removed = replaceCraftSocietyFallback(structuredClone(unsupportedSociety));
assert.equal(removed.plan.methods.length, 0);
assert.equal(removed.plan.session_complete, true);
assert.match(removed.plan.notice, /友好部族はログイン直後ルーチン/);

console.log("craft leve focus tests: ok");

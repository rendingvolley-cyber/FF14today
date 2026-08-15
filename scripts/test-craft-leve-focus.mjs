import assert from "node:assert/strict";
import { armorerLeveMethods, replaceCraftSocietyFallback } from "../src/craft-leve-focus-wrapper.js";

const arm81 = { code: "ARM", name: "甲冑師", level: 81, role: "crafter" };
const methods = armorerLeveMethods(arm81, 60);
assert.equal(methods.length, 2);
assert.equal(methods[0].job_code, "ARM");
assert.match(methods[0].title, /ハイダリウム・スレイヤーアームガード/);
assert.match(methods[0].title, /1個納品/);
assert.equal(methods[0].leve_reward_exp, 935000);
assert.equal(methods[0].leve_reward_gil, 4900);
assert.equal(methods[1].delivery_quantity, 3);
assert.match(methods[1].title, /ハイダリウムナゲット/);

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

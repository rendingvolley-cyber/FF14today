import assert from "node:assert/strict";
import { ametrineWindow, updatePlan } from "../src/gather-window-wrapper.js";

const PERIOD = 12 * 175 * 1000;
const baseStart = PERIOD * 1000;

function plan() {
  return {
    selected_mode: "gather",
    session_complete: false,
    remaining_minutes: 60,
    methods: [
      {
        rank: 1,
        task_key: "gather:min81:collectable:rarefied-raw-ametrine",
        title: "old",
        minutes: 30,
        reason: "old",
        condition: "old",
        steps: [],
        job_name: "採掘師",
        job_level: 81,
        repeat_count: 0
      },
      {
        rank: 2,
        task_key: "gather:min81:collectable:rarefied-high-durium-ore",
        title: "常設候補",
        minutes: 15,
        reason: "常設",
        condition: "常設",
        steps: [],
        job_name: "採掘師",
        job_level: 81,
        repeat_count: 0
      }
    ]
  };
}

{
  const now = baseStart + 60_000;
  const window = ametrineWindow(now);
  assert.equal(window.open, true);
  const result = updatePlan(plan(), now);
  assert.equal(result.methods[0].task_key, "gather:min81:collectable:rarefied-raw-ametrine");
  assert.equal(result.methods[0].minutes, 12);
  assert.match(result.methods[0].reason, /約18%/);
  assert.match(result.methods[0].steps.join(" "), /アルケイオン保管院/);
  assert.match(result.methods[0].steps.join(" "), /プシケ送風塔/);
  assert.doesNotMatch(result.methods[0].steps.join(" "), /The Archeion|Psyche/);
}

{
  const now = baseStart + 6 * 60_000;
  const window = ametrineWindow(now);
  assert.equal(window.open, false);
  assert.ok(window.waitMinutes > 15);
  const result = updatePlan(plan(), now);
  assert.equal(result.methods[0].task_key, "gather:min81:collectable:rarefied-high-durium-ore");
  const ametrine = result.methods.find(item => item.task_key.includes("ametrine"));
  assert.ok(ametrine);
  assert.equal(ametrine.minutes, window.waitMinutes + 10);
  assert.match(ametrine.reason, /今から待機するのは時間効率が悪い/);
  assert.match(ametrine.condition, /約35分周期/);
}

{
  const nextStart = baseStart + PERIOD;
  const now = nextStart - 5 * 60_000;
  const window = ametrineWindow(now);
  assert.equal(window.open, false);
  assert.ok(window.waitMinutes <= 5);
  const result = updatePlan(plan(), now);
  assert.equal(result.methods[0].task_key, "gather:min81:collectable:rarefied-raw-ametrine");
  assert.match(result.methods[0].reason, /窓が近い/);
}

console.log("gather-window-ux OK");

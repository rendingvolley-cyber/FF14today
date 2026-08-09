import assert from "node:assert/strict";
import { ametrineWindow, updatePlan } from "../src/gather-window-wrapper.js";

const PERIOD = 12 * 175 * 1000;
const baseStart = PERIOD * 1000;

function plan(remaining = 60) {
  return {
    selected_mode: "gather",
    session_complete: false,
    remaining_minutes: remaining,
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
  assert.equal(result.planner_kind, "gather-checklist-v1.5.1");
  assert.ok(result.gather_checklist);
  assert.match(result.gather_checklist.items[0].title, /アメトリン原石/);
  assert.match(result.gather_checklist.items[0].detail, /約18%/);
  assert.match(result.gather_checklist.items[0].detail, /プシケ送風塔/);
  assert.equal(result.now, null);
}

{
  const nextStart = baseStart + PERIOD;
  const now = nextStart - 20 * 60_000;
  const window = ametrineWindow(now);
  assert.equal(window.open, false);
  assert.ok(window.waitMinutes > 15);
  const result = updatePlan(plan(60), now);
  assert.ok(result.gather_checklist);
  assert.equal(result.gather_checklist.items.length, 2);
  assert.match(result.gather_checklist.items[0].title, /輝翠銀鉱/);
  assert.match(result.gather_checklist.items[1].timing, /JST/);
}

{
  const nextStart = baseStart + PERIOD;
  const now = nextStart - 20 * 60_000;
  const result = updatePlan(plan(15), now);
  assert.equal(result.gather_checklist, null);
  assert.equal(result.planner_kind, "gather-efficient-v1.5.1");
  assert.equal(result.methods[0].task_key, "gather:min81:collectable:rarefied-high-durium-ore");
  assert.match(result.methods[0].title, /収集用の輝翠銀鉱/);
}

console.log("gather-window-ux OK");

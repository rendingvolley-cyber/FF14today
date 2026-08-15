import assert from "node:assert/strict";
import { applyCategoryJobFocus } from "../src/category-job-focus.js";

const character = {
  jobs: [
    { code: "ARM", name_ja: "甲冑師", level: 81, role: "crafter" },
    { code: "ALC", name_ja: "錬金術師", level: 91, role: "crafter" },
    { code: "BSM", name_ja: "鍛冶師", level: 95, role: "crafter" },
    { code: "MIN", name_ja: "採掘師", level: 81, role: "gatherer" },
    { code: "BTN", name_ja: "園芸師", level: 90, role: "gatherer" }
  ]
};

function base(mode) {
  return {
    selected_mode: mode,
    planner_kind: "base",
    session_complete: true,
    remaining_minutes: 60,
    focus_job: null,
    methods: [],
    now: null,
    next: null,
    fallback: { title: "base", minutes: 0 }
  };
}

{
  const plan = applyCategoryJobFocus(base("craft"), character, { focusCraftJobCode: "ARM", availableMinutes: 60 });
  assert.equal(plan.session_complete, false);
  assert.equal(plan.focus_job.code, "ARM");
  assert.equal(plan.methods.length, 1);
  assert.equal(plan.methods[0].job_code, "ARM");
  assert.match(plan.methods[0].title, /レポリット族/);
  assert.match(plan.methods[0].title, /甲冑師/);
  assert.match(plan.methods[0].reason, /Lv80〜89/);
  assert.ok(plan.methods[0].steps.some(step => step.includes("嘆きの海")));
}

{
  const plan = applyCategoryJobFocus(base("craft"), character, { focusCraftJobCode: "ALC", availableMinutes: 60 });
  assert.equal(plan.session_complete, false);
  assert.equal(plan.focus_job.code, "ALC");
  assert.equal(plan.methods.length, 3);
  assert.ok(plan.methods.every(row => row.job_code === "ALC"));
  assert.ok(plan.methods.some(row => /ウコギ・アングルブラシ/.test(row.title)));
  const collectable = plan.methods.find(row => row.task_key === "craft:alc91:collectable:loboskin-grimoire");
  assert.ok(collectable);
  assert.match(collectable.title, /収集用のシルバリオ・グリモア/);
  assert.doesNotMatch(collectable.title, /^Lv91錬金術師の収集品を1個作って納品する$/);
  assert.ok(collectable.steps.some(step => step.includes("収集用のシルバリオ・グリモア")));
}

{
  const plan = applyCategoryJobFocus(base("craft"), character, { focusCraftJobCode: "BSM", availableMinutes: 60 });
  assert.equal(plan.session_complete, false);
  assert.equal(plan.focus_job.code, "BSM");
  assert.equal(plan.methods.length, 1);
  assert.match(plan.methods[0].title, /ヨカフイ族/);
}

{
  const plan = applyCategoryJobFocus(base("gather"), character, { focusGatherJobCode: "MIN", availableMinutes: 60 });
  assert.equal(plan.session_complete, false);
  assert.equal(plan.focus_job.code, "MIN");
  assert.equal(plan.methods.length, 2);
  assert.ok(plan.methods.every(row => row.job_code === "MIN"));
  assert.match(plan.methods[0].title, /アメトリン原石/);
}

{
  const plan = applyCategoryJobFocus(base("gather"), character, { focusGatherJobCode: "BTN", availableMinutes: 60 });
  assert.equal(plan.session_complete, true);
  assert.equal(plan.focus_job.code, "BTN");
  assert.equal(plan.methods.length, 0);
  assert.match(plan.notice, /別ジョブへ勝手に切り替えません/);
}

console.log("category-job-focus OK");

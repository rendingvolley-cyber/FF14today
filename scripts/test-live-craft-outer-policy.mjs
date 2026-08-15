import assert from "node:assert/strict";
import { applyCraftProcurementPolicyResponse } from "../src/gc-top3-entry.js";

function jsonResponse(plan) {
  return new Response(JSON.stringify({
    character: { jobs: [{ code: "ARM", name_ja: "甲冑師", level: 81, role: "crafter" }] },
    preferences: { available_minutes: 60 },
    plan
  }), { headers: { "content-type": "application/json" } });
}

const societyPlan = {
  selected_mode: "craft",
  planner_kind: "category-job-focus-craft-v1",
  remaining_minutes: 60,
  session_complete: false,
  focus_job: { code: "ARM", name: "甲冑師", level: 81, role: "crafter" },
  methods: [{
    task_key: "craft:arm:society:loporrit",
    badge: "友好部族・3件",
    title: "レポリット族のデイリーを甲冑師で3件やる",
    minutes: 20,
    reason: "旧フォールバック",
    job_code: "ARM",
    job_name: "甲冑師",
    job_level: 81,
    job_role: "crafter"
  }],
  now: null,
  next: null
};

{
  const request = new Request("https://example.test/api/state?planner_mode=craft&focus_craft_job_code=ARM");
  const response = await applyCraftProcurementPolicyResponse(request, jsonResponse(societyPlan));
  const data = await response.json();
  assert.equal(data.plan.planner_kind, "craft-leve-procurement-v1");
  assert.equal(data.plan.methods.length, 2);
  assert.ok(data.plan.methods.every(row => row.task_key.includes(":leve:")));
  assert.ok(data.plan.methods.every(row => !/レポリット族|友好部族/.test(`${row.title} ${row.badge}`)));
  assert.equal(data.plan.methods[0].delivery_item_name, "ハイダリウム・スレイヤーアームガード");
  assert.equal(data.plan.methods[1].delivery_item_name, "ハイダリウムナゲット");
}

{
  const request = new Request("https://example.test/api/state?planner_mode=efficient");
  const response = await applyCraftProcurementPolicyResponse(request, jsonResponse({ ...societyPlan, selected_mode: "efficient" }));
  const data = await response.json();
  assert.match(data.plan.methods[0].title, /レポリット族/);
}

console.log("live craft outer policy OK");

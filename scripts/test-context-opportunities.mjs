import assert from "node:assert/strict";
import { applyDecisionContextToPlan } from "../src/context-opportunities.js";

function basePlan() {
  return {
    session_complete: false,
    methods: [
      {
        task_key: "craft:alc90:leve:ginseng-angle-brush",
        title: "ギルドリーヴ用「Ginseng Angle Brush」をHQで1個作る",
        badge: "ギルドリーヴ納品",
        minutes: 20,
        reason: "TuliyollalのLv90ギルドリーヴ「Big Brush, Big Dreams」の納品物。",
        condition: "目的：錬金術師の経験値を進める。",
        steps: ["製作手帳でGinseng Angle Brushを開く"],
        job_role: "crafter",
        job_code: "ALC",
        job_level: 90
      },
      {
        task_key: "craft:alc90:leve:growth-formula-lambda",
        title: "Growth Formula Lambdaを作る",
        badge: "リーヴ",
        minutes: 18,
        reason: "Fast-forwarding Floraの納品物。",
        condition: "代替案",
        steps: ["Growth Formula Lambdaを開く"],
        job_role: "crafter",
        job_code: "ALC",
        job_level: 90
      },
      {
        task_key: "craft:alc91:collectable:loboskin-grimoire",
        title: "Rarefied Loboskin Grimoireを作る",
        badge: "収集品",
        minutes: 20,
        reason: "紫貨候補。",
        condition: "収集品",
        steps: ["Rarefied Loboskin Grimoireを開く"],
        job_role: "crafter",
        job_code: "ALC",
        job_level: 91
      }
    ],
    fallback: { title: "終了", minutes: 0 }
  };
}

{
  const context = {
    journal: {
      journal_entries: [{
        title: "サブクエスト：試しの一歩",
        objective: "NPCに話しかける",
        progress: "0/1",
        location: "トライヨラ",
        deadline_text: null,
        confidence: 0.95
      }]
    }
  };
  const result = applyDecisionContextToPlan(basePlan(), context, "craft", 60);
  assert.equal(result.methods.length, 3);
  assert.equal(result.methods[2].source_kind, "journal_screenshot");
  assert.match(result.methods[2].title, /試しの一歩/);
}

{
  const context = {
    crafter_stats: {
      crafter_stats: { level: 90, craftsmanship: 3400, control: 3200, cp: 580 }
    }
  };
  const result = applyDecisionContextToPlan(basePlan(), context, "craft", 60);
  assert.match(result.methods[0].condition, /作業精度3366をクリア/);
  assert.doesNotMatch(result.methods[0].condition, /製作対象外/);
  assert.match(result.methods[0].title, /ウコギ・アングルブラシ/);
  assert.match(result.methods[0].reason, /製作依頼：巨大な絵筆を試したい/);
}

{
  const context = {
    crafter_stats: {
      crafter_stats: { level: 90, craftsmanship: 3200, control: 3100, cp: 560 }
    }
  };
  const result = applyDecisionContextToPlan(basePlan(), context, "craft", 60);
  const brush = result.methods.find(method => method.task_key === "craft:alc90:leve:ginseng-angle-brush");
  assert.ok(brush);
  assert.match(brush.condition, /166下回っています/);
  assert.match(brush.condition, /製作不能とは断定しません/);
}

{
  const gatherPlan = {
    session_complete: false,
    methods: [{
      task_key: "gather:min81:collectable:rarefied-raw-ametrine",
      title: "Rarefied Raw Ametrineを採る",
      badge: "時間限定",
      minutes: 20,
      reason: "window",
      condition: "紫貨",
      steps: ["Labyrinthos The ArcheionからPsycheへ"],
      job_role: "gatherer",
      job_code: "MIN",
      job_level: 81
    }],
    fallback: { title: "終了", minutes: 0 }
  };
  const context = {
    gatherer_stats: {
      gatherer_stats: { level: 81, gathering: 2500, perception: 2400, gp: 700 }
    }
  };
  const result = applyDecisionContextToPlan(gatherPlan, context, "gather", 60);
  assert.match(result.methods[0].condition, /判定保留/);
  assert.match(result.methods[0].title, /収集用のアメトリン原石/);
}

console.log("context opportunities OK");

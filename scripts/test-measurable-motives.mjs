import assert from "node:assert/strict";
import { applyMeasurableMotives } from "../src/measurable-motive-wrapper.js";

function plan(methods) {
  return {
    selected_mode: "discover",
    session_complete: false,
    methods,
    notice: "old",
    now: null,
    next: null,
    fallback: null
  };
}

const baseMethods = [
  {
    task_key: "discover:gold-saucer-gate",
    rank: 1,
    badge: "短い寄り道",
    title: "ゴールドソーサーで次のGATEを1回だけ遊ぶ",
    minutes: 20,
    reason: "息抜き",
    condition: "",
    steps: []
  },
  {
    task_key: "discover:ocean-fishing",
    rank: 2,
    badge: "イベント釣り",
    title: "漁師でオーシャンフィッシングを1航海",
    minutes: 35,
    reason: "釣りイベント",
    condition: "",
    steps: [],
    job_name: "漁師",
    job_level: 80
  },
  {
    task_key: "discover:fate-three",
    rank: 3,
    badge: "フィールド寄り道",
    title: "FATEを3回",
    minutes: 20,
    reason: "寄り道",
    condition: "",
    steps: []
  }
];

const progressContext = {
  achievement_entries: [
    {
      name: "フンガー！：ランク3",
      current: 7,
      target: 10,
      objective: "G.A.T.E.『暴風！ はないきフンガー』を累計10回コンプリートする",
      reward_title: "the Fungah",
      reward_text: null,
      category: "ゴールドソーサー",
      confidence: 0.98
    }
  ]
};

const withProgress = applyMeasurableMotives(plan(baseMethods), progressContext, { history: [] });
assert.equal(withProgress.methods[0].task_key, "discover:gold-saucer-gate");
assert.match(withProgress.methods[0].reason, /7\/10/);
assert.match(withProgress.methods[0].reason, /8\/10/);
assert.match(withProgress.methods[0].reason, /残り2回/);
assert.match(withProgress.methods[0].badge, /残り3回/);
assert.equal(withProgress.methods[0].measurable_motive, true);

const completedFungah = {
  history: [{ name: "フンガー！：ランク3" }]
};
const noProgress = applyMeasurableMotives(plan(baseMethods), null, completedFungah);
assert.notEqual(noProgress.methods[0].task_key, "discover:gold-saucer-gate");
assert.equal(noProgress.methods.find(m => m.task_key === "discover:gold-saucer-gate").motive_score, 0);

const oceanIncomplete = applyMeasurableMotives(plan(baseMethods), null, { history: [] });
const ocean = oceanIncomplete.methods.find(m => m.task_key === "discover:ocean-fishing");
assert.match(ocean.reason, /16,000点/);
assert.match(ocean.reason, /Ocean Fisher/);
assert.match(ocean.reason, /経験値/);
assert.doesNotMatch(ocean.reason, /20%/);
assert.equal(ocean.measurable_motive, true);

const oceanRank3Done = applyMeasurableMotives(plan(baseMethods), null, {
  history: [{ name: "オーシャンフィッシャー：ランク3" }]
});
const ocean20k = oceanRank3Done.methods.find(m => m.task_key === "discover:ocean-fishing");
assert.match(ocean20k.reason, /20,000点/);
assert.match(ocean20k.reason, /Master of the Sea/);

console.log("measurable motive tests OK");

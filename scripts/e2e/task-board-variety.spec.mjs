import { test, expect } from "@playwright/test";
import {
  completedDailyFromHistory,
  rebuildDiscoverTaskBoardPlan,
  rebuildEfficientTaskBoardPlan
} from "../../src/task-board-recovery.js";

const character = {
  jobs: [
    { code: "RDM", name_ja: "赤魔道士", level: 97, role: "caster" },
    { code: "FSH", name_ja: "漁師", level: 80, role: "gatherer" }
  ],
  bozja_rank: 15
};

function basePlan(mode) {
  return {
    selected_mode: mode,
    remaining_minutes: 60,
    completed_daily: { leveling: false, alliance: false },
    methods: [],
    fallback: { title: "終了", minutes: 0 }
  };
}

test("activity history suppresses already completed leveling and alliance roulettes", () => {
  const counts = {
    "roulette:leveling": 1,
    "roulette:alliance": 1,
    "daily:frontline": 1
  };
  expect(completedDailyFromHistory(counts)).toEqual({ leveling: true, alliance: true });
  const plan = rebuildEfficientTaskBoardPlan({
    character,
    currentPlan: basePlan("efficient"),
    focusJobCode: "RDM",
    availableMinutes: 60,
    completionCounts: counts
  });
  const keys = plan.methods.map(row => row.task_key);
  expect(keys).not.toContain("roulette:leveling");
  expect(keys).not.toContain("roulette:alliance");
  expect(keys).not.toContain("daily:frontline");
  expect(keys.some(key => key.startsWith("leveling-dungeon:RDM:"))).toBeTruthy();
});

test("discover catalog restores normal fishing and other choices", () => {
  const plan = rebuildDiscoverTaskBoardPlan({
    character,
    currentPlan: basePlan("discover"),
    availableMinutes: 60,
    completionCounts: {}
  });
  expect(plan.task_board_catalog).toBeTruthy();
  expect(plan.methods.some(row => row.task_key === "discover:ocean-fishing")).toBeTruthy();
  expect(plan.methods.some(row => row.task_key === "discover:gold-saucer-gate")).toBeTruthy();
});

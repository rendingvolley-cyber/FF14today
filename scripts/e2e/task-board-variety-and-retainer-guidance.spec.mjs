import { test, expect } from "@playwright/test";
import {
  completedDailyFromHistory,
  rebuildDiscoverTaskBoardPlan,
  rebuildEfficientTaskBoardPlan
} from "../../src/task-board-recovery.js";
import { sanitizeRetainerWorkflowAnalysis } from "../../src/retainer-workflow-image.js";

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

test("retainer overview is guidance, not a hard error", () => {
  const overview = sanitizeRetainerWorkflowAnalysis({
    screen_type: "retainer_overview",
    confidence: 0.96,
    retainer_name: null,
    job_name: null,
    level: null,
    ventures: []
  });
  expect(overview.page_type).toBe("retainer_overview");
  expect(overview.retainer_ventures).toBeNull();

  const ventureList = sanitizeRetainerWorkflowAnalysis({
    screen_type: "venture_item_list",
    confidence: 0.94,
    retainer_name: "Retainer A",
    job_name: "採掘師",
    level: 100,
    ventures: [
      { item_name: "コンドライト", quantity: 30, venture_level: 88, duration_minutes: 60, confidence: 0.95 }
    ]
  });
  expect(ventureList.page_type).toBe("retainer_ventures");
  expect(ventureList.retainer_ventures.ventures).toHaveLength(1);
  expect(ventureList.retainer_ventures.ventures[0].item_name).toBe("コンドライト");
});

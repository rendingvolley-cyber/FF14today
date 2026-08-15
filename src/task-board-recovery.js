import { makeConcretePlan } from "./concrete-plan.js";
import { applyCombatJobFocus } from "./combat-job-focus.js";

function countFor(counts, keys) {
  const source = counts && typeof counts === "object" ? counts : {};
  return keys.some(key => Math.max(0, Number(source[key]) || 0) > 0);
}

export function completedDailyFromHistory(counts, explicit = {}) {
  return {
    leveling: Boolean(explicit?.leveling) || countFor(counts, ["roulette:leveling", "daily:leveling", "leveling"]),
    alliance: Boolean(explicit?.alliance) || countFor(counts, ["roulette:alliance", "daily:alliance", "alliance"])
  };
}

export function shouldRebuildEfficientTaskBoardPlan(currentPlan) {
  const selectedMode = String(currentPlan?.selected_mode || "").trim();
  return !selectedMode || selectedMode === "efficient";
}

export function rebuildEfficientTaskBoardPlan({
  character,
  currentPlan,
  focusJobCode,
  availableMinutes = 60,
  energy = 3,
  completionCounts = {},
  explicitCompletedDaily = {}
}) {
  // This recovery layer is combat/efficient-only. Craft/gather plans may already
  // have been rewritten by their own focus policies; rebuilding them here would
  // discard those policies and can resurrect login-routine society tasks.
  if (!shouldRebuildEfficientTaskBoardPlan(currentPlan)) return currentPlan;
  if (!character || !focusJobCode) return currentPlan;
  const completedDaily = completedDailyFromHistory(completionCounts, explicitCompletedDaily);
  const base = makeConcretePlan(
    character,
    availableMinutes,
    energy,
    currentPlan,
    completedDaily,
    completionCounts,
    "efficient"
  );
  if (!base) return currentPlan;
  const focused = applyCombatJobFocus(base, character, {
    focusJobCode,
    availableMinutes,
    completedDaily,
    completionCounts
  });
  return {
    ...focused,
    completed_daily: completedDaily,
    task_board_completion_recovery: true
  };
}

export function rebuildDiscoverTaskBoardPlan({
  character,
  currentPlan,
  availableMinutes = 60,
  energy = 3,
  completionCounts = {}
}) {
  if (!character) return currentPlan;
  const base = makeConcretePlan(
    character,
    availableMinutes,
    energy,
    currentPlan,
    currentPlan?.completed_daily || {},
    completionCounts,
    "discover"
  );
  if (!base || !Array.isArray(base.methods) || !base.methods.length) return currentPlan;
  return {
    ...base,
    planner_kind: "task-board-discover-catalog-v1",
    notice: "タスクボード用の選択肢として、時限でない発見・釣り候補も含めて表示しています。メイン推薦では従来どおり根拠の強い候補を優先します。",
    task_board_catalog: true
  };
}

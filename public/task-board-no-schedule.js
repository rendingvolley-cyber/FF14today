let applyQueued = false;

function activeCategory(board) {
  return String(board.querySelector("#taskBoardTabs .task-board-tab.active")?.dataset.category || "");
}

function visibleCandidateCount(board) {
  const regular = board.querySelectorAll("#taskBoardGrid .task-select-card").length;
  const timedPanel = board.querySelector("#taskBoardTimed");
  const timedVisible = timedPanel && !timedPanel.classList.contains("hidden") && getComputedStyle(timedPanel).display !== "none";
  const timed = timedVisible ? board.querySelectorAll("#taskBoardTimedList .timed-task").length : 0;
  return regular + timed;
}

function applyTaskBoardPresentation() {
  const board = document.getElementById("taskBoard");
  if (!board) return false;

  board.querySelector(".task-board-schedule")?.remove();

  const description = board.querySelector(".task-board-head .muted");
  const nextDescription = "カテゴリから選ぶ。時限は所属カテゴリ内だけに表示します。生産は選んだものを下でまとめて準備できます。";
  if (description && description.textContent !== nextDescription) description.textContent = nextDescription;

  const category = activeCategory(board);
  const summary = board.querySelector(".task-board-summary");
  if (summary) {
    const hideSummary = category !== "craft";
    if (summary.dataset.craftOnlyHidden !== String(hideSummary)) summary.dataset.craftOnlyHidden = String(hideSummary);
  }

  const activeTab = board.querySelector("#taskBoardTabs .task-board-tab.active");
  const countNode = activeTab?.querySelector("small");
  if (countNode) {
    const nextCount = String(visibleCandidateCount(board));
    if (countNode.textContent !== nextCount) countNode.textContent = nextCount;
  }

  return true;
}

function queueApply() {
  if (applyQueued) return;
  applyQueued = true;
  requestAnimationFrame(() => {
    applyQueued = false;
    applyTaskBoardPresentation();
  });
}

function boot() {
  const style = document.createElement("style");
  style.id = "taskBoardNoScheduleStyles";
  style.textContent = `
    .task-board-schedule{display:none!important}
    .task-board-summary[data-craft-only-hidden="true"]{display:none!important}
  `;
  if (!document.getElementById(style.id)) document.head.append(style);

  applyTaskBoardPresentation();

  const observer = new MutationObserver(queueApply);
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["class"]
  });

  document.addEventListener("click", event => {
    if (!event.target.closest("#taskBoardTabs .task-board-tab")) return;
    setTimeout(queueApply, 0);
    setTimeout(queueApply, 80);
  }, true);
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
else boot();

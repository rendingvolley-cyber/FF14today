function applyTaskBoardNoSchedule() {
  const board = document.getElementById("taskBoard");
  if (!board) return false;

  board.querySelector(".task-board-schedule")?.remove();

  const description = board.querySelector(".task-board-head .muted");
  if (description) {
    description.textContent = "カテゴリから選ぶ。時限は所属カテゴリ内だけに表示し、選んだものは下でまとめて準備できます。";
  }
  return true;
}

function boot() {
  const style = document.createElement("style");
  style.id = "taskBoardNoScheduleStyles";
  style.textContent = ".task-board-schedule{display:none!important}";
  if (!document.getElementById(style.id)) document.head.append(style);

  if (applyTaskBoardNoSchedule()) return;

  const observer = new MutationObserver(() => {
    if (!applyTaskBoardNoSchedule()) return;
    observer.disconnect();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
else boot();

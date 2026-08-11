const EXPECT_TIMED = new Set(["採集", "釣り", "イベント", "週次"]);

function injectStyles() {
  if (document.getElementById("taskBoardTimedZeroStyles")) return;
  const style = document.createElement("style");
  style.id = "taskBoardTimedZeroStyles";
  style.textContent = `
    .task-board-timed-zero{margin:0 14px 14px;border:1px dashed #d5e5f6;border-radius:14px;background:#f8fbff;padding:11px 12px;color:#69829c;font-size:.76rem;line-height:1.55}
    .task-board-timed-zero strong{color:#47698b}
  `;
  document.head.append(style);
}

function activeLabel(board) {
  const text = board.querySelector(".task-board-tab.active")?.textContent?.trim() || "";
  for (const label of EXPECT_TIMED) {
    if (text.startsWith(label)) return label;
  }
  return "";
}

function reconcile() {
  const board = document.getElementById("taskBoard");
  if (!board) return;
  injectStyles();

  let zero = board.querySelector(".task-board-timed-zero");
  const label = activeLabel(board);
  const timed = board.querySelector(".task-board-timed");
  const hasVisibleTimed = Boolean(timed && !timed.classList.contains("hidden") && timed.getClientRects().length);

  if (!label || hasVisibleTimed) {
    zero?.remove();
    return;
  }

  if (!zero) {
    zero = document.createElement("div");
    zero.className = "task-board-timed-zero";
    const tabs = board.querySelector(".task-board-tabs");
    if (tabs) tabs.insertAdjacentElement("afterend", zero);
    else board.prepend(zero);
  }
  zero.innerHTML = `<strong>${label}の時限候補：</strong>現在表示できる候補はありません。候補取得データが入れば、この場所に開始時刻・残り時間・準備開始時刻を表示します。`;
}

function boot() {
  reconcile();
  for (const delay of [100, 400, 1000]) setTimeout(reconcile, delay);
  document.addEventListener("click", event => {
    if (event.target?.closest?.(".task-board-tab")) setTimeout(reconcile, 0);
  });
  setInterval(reconcile, 1000);
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
else boot();

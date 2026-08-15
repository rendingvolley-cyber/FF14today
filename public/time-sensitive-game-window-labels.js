(() => {
  let observer = null;

  function applyLabels() {
    const section = document.getElementById("timeSensitiveDashboard");
    if (!section) return;

    section.dataset.scope = "game-windows";
    const heading = section.querySelector(".time-sensitive-head h3");
    if (heading) heading.textContent = "今夜の時間窓";

    const fishList = section.querySelector("[data-fish-list]");
    const gatherList = section.querySelector("[data-deadline-list]");
    const fishColumn = fishList?.closest(".time-sensitive-column");
    const gatherColumn = gatherList?.closest(".time-sensitive-column");
    const grid = section.querySelector(".time-sensitive-grid");

    if (fishColumn) fishColumn.dataset.timeGroup = "fish";
    if (gatherColumn) gatherColumn.dataset.timeGroup = "gather";
    if (grid && gatherColumn && fishColumn && grid.firstElementChild !== gatherColumn) {
      grid.insertBefore(gatherColumn, fishColumn);
    }

    const gatherTitle = gatherColumn?.querySelector(".time-sensitive-title");
    if (gatherTitle) {
      const strong = gatherTitle.querySelector("strong");
      const note = gatherTitle.querySelector("span");
      if (strong) strong.textContent = "時限採集";
      if (note) note.textContent = "次の窓を表示";
    }

    const empty = gatherList?.querySelector(".time-empty");
    if (empty && /期限|時限情報/.test(empty.textContent || "")) {
      empty.textContent = "現在の候補データに時限採集の時間窓はありません。";
    }
  }

  function boot() {
    applyLabels();
    if (observer) return;
    observer = new MutationObserver(() => applyLabels());
    observer.observe(document.body, { childList: true, subtree: true });

    const style = document.createElement("style");
    style.id = "timeSensitiveGameWindowLabelsStyle";
    style.textContent = `
      #timeSensitiveDashboard[data-scope="game-windows"] .time-sensitive-grid {
        grid-template-columns:1fr;
      }
      #timeSensitiveDashboard[data-scope="game-windows"] .time-sensitive-column + .time-sensitive-column {
        border-left:0;
        border-top:1px solid #e5edf5;
      }
      #timeSensitiveDashboard[data-scope="game-windows"] .time-sensitive-list {
        grid-template-columns:repeat(2,minmax(0,1fr));
        align-items:start;
      }
      #timeSensitiveDashboard[data-scope="game-windows"] [data-deadline-list] .time-card.deadline {
        border-color:#dce7f2;
        background:#fbfdff;
      }
      #timeSensitiveDashboard[data-scope="game-windows"] [data-deadline-list] .time-card.open {
        border-color:#8fb5de;
        background:#f0f7ff;
      }
      @media(max-width:760px) {
        #timeSensitiveDashboard[data-scope="game-windows"] .time-sensitive-list {
          grid-template-columns:1fr;
        }
      }
    `;
    if (!document.getElementById(style.id)) document.head.append(style);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
  else boot();
})();

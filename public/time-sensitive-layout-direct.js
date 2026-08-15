(() => {
  let observer = null;

  function apply() {
    const section = document.getElementById("timeSensitiveDashboard");
    if (!section) return;

    section.dataset.layout = "stacked-direct-v1";

    const grid = section.querySelector(".time-sensitive-grid");
    const fishList = section.querySelector("[data-fish-list]");
    const gatherList = section.querySelector("[data-deadline-list]");
    const fishColumn = fishList?.closest(".time-sensitive-column");
    const gatherColumn = gatherList?.closest(".time-sensitive-column");

    if (grid && gatherColumn && fishColumn && grid.firstElementChild !== gatherColumn) {
      grid.insertBefore(gatherColumn, fishColumn);
    }

    const gatherTitle = gatherColumn?.querySelector(".time-sensitive-title");
    const gatherStrong = gatherTitle?.querySelector("strong");
    const gatherNote = gatherTitle?.querySelector("span");
    if (gatherStrong) gatherStrong.textContent = "時限採集";
    if (gatherNote) gatherNote.textContent = "次の窓を表示";

    const empty = gatherList?.querySelector(".time-empty");
    if (empty && /期限|時限情報/.test(empty.textContent || "")) {
      empty.textContent = "現在の候補データに時限採集の時間窓はありません。";
    }
  }

  function boot() {
    if (!document.getElementById("timeSensitiveLayoutDirectStyle")) {
      const style = document.createElement("style");
      style.id = "timeSensitiveLayoutDirectStyle";
      style.textContent = `
        #timeSensitiveDashboard[data-layout="stacked-direct-v1"] .time-sensitive-grid {
          grid-template-columns:1fr!important;
        }
        #timeSensitiveDashboard[data-layout="stacked-direct-v1"] .time-sensitive-column + .time-sensitive-column {
          border-left:0!important;
          border-top:1px solid #e5edf5;
        }
        #timeSensitiveDashboard[data-layout="stacked-direct-v1"] .time-sensitive-list {
          grid-template-columns:repeat(2,minmax(0,1fr))!important;
          align-items:start;
        }
        @media(max-width:760px) {
          #timeSensitiveDashboard[data-layout="stacked-direct-v1"] .time-sensitive-list {
            grid-template-columns:1fr!important;
          }
        }
      `;
      document.head.append(style);
    }

    apply();
    if (!observer) {
      observer = new MutationObserver(apply);
      observer.observe(document.body, { childList: true, subtree: true });
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
  else boot();
})();

(() => {
  let observer = null;

  function applyLabels() {
    const section = document.getElementById("timeSensitiveDashboard");
    if (!section) return;

    section.dataset.scope = "game-windows";
    const heading = section.querySelector(".time-sensitive-head h3");
    if (heading) heading.textContent = "今夜の時間窓";

    const titles = section.querySelectorAll(".time-sensitive-title");
    const gatherTitle = titles[1];
    if (gatherTitle) {
      const strong = gatherTitle.querySelector("strong");
      const note = gatherTitle.querySelector("span");
      if (strong) strong.textContent = "時限採集";
      if (note) note.textContent = "次の窓を表示";
    }

    const empty = section.querySelector("[data-deadline-list] .time-empty");
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
      #timeSensitiveDashboard[data-scope="game-windows"] [data-deadline-list] .time-card.deadline {
        border-color:#dce7f2;
        background:#fbfdff;
      }
      #timeSensitiveDashboard[data-scope="game-windows"] [data-deadline-list] .time-card.open {
        border-color:#8fb5de;
        background:#f0f7ff;
      }
    `;
    if (!document.getElementById(style.id)) document.head.append(style);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
  else boot();
})();

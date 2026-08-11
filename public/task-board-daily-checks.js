(() => {
  let activeCategory = "";
  let timer = null;

  function injectStyle() {
    if (document.getElementById("taskBoardDailyChecksStyle")) return;
    const style = document.createElement("style");
    style.id = "taskBoardDailyChecksStyle";
    style.textContent = `
      #dailyChecklist.task-board-daily-checklist{margin:0 14px 12px;padding:10px 12px;border:1px solid #d9e6f3;border-radius:13px;background:#fff;display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}
      #dailyChecklist.task-board-daily-checklist.hidden{display:none!important}
      #dailyChecklist.task-board-daily-checklist .daily-checklist-head{display:flex;align-items:center;gap:8px}
      #dailyChecklist.task-board-daily-checklist .label{margin:0;font-size:.75rem;font-weight:900;color:#315e8e}
      #dailyChecklist.task-board-daily-checklist .daily-date{font-size:.7rem;color:#7a8da0}
      #dailyChecklist.task-board-daily-checklist .daily-check-status{font-size:.72rem;color:#6b829a;margin-top:3px}
      #dailyChecklist.task-board-daily-checklist .daily-checks{display:flex;gap:8px;flex-wrap:wrap}
      #dailyChecklist.task-board-daily-checklist .daily-check{display:flex;align-items:center;gap:6px;padding:8px 11px;border:1px solid #cbdced;border-radius:999px;background:#f8fbff;font-weight:800;color:#244c73;cursor:pointer}
      #dailyChecklist.task-board-daily-checklist .daily-check:has(input:checked){background:#e9f1ff;border-color:#7ea5ff;color:#174d98}
      #dailyChecklist.task-board-daily-checklist input{width:16px;height:16px;margin:0}
      @media(max-width:680px){#dailyChecklist.task-board-daily-checklist{align-items:stretch}#dailyChecklist.task-board-daily-checklist .daily-checks{width:100%}#dailyChecklist.task-board-daily-checklist .daily-check{flex:1;justify-content:center}}
    `;
    document.head.append(style);
  }

  function currentCategory() {
    return activeCategory || document.querySelector("#taskBoardTabs .task-board-tab.active")?.dataset.category || "";
  }

  function sync() {
    injectStyle();
    const checklist = document.getElementById("dailyChecklist");
    const tabs = document.getElementById("taskBoardTabs");
    if (!checklist || !tabs) return false;

    if (!checklist.classList.contains("task-board-daily-checklist")) {
      checklist.classList.add("task-board-daily-checklist");
      const heading = checklist.querySelector(".daily-checklist-head .label");
      if (heading) heading.textContent = "今日の戦闘日課";
      tabs.insertAdjacentElement("afterend", checklist);
    }

    const show = currentCategory() === "combat";
    checklist.classList.toggle("hidden", !show);
    return true;
  }

  document.addEventListener("click", event => {
    const tab = event.target.closest("#taskBoardTabs .task-board-tab");
    if (!tab) return;
    activeCategory = String(tab.dataset.category || "");
    sync();
    setTimeout(sync, 40);
    setTimeout(() => {
      activeCategory = "";
      sync();
    }, 250);
  }, true);

  function boot() {
    sync();
    timer = setInterval(() => {
      if (sync() && document.getElementById("dailyChecklist")?.classList.contains("task-board-daily-checklist")) {
        clearInterval(timer);
        timer = null;
      }
    }, 500);
    setTimeout(() => {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    }, 15000);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
  else boot();
})();

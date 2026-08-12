let panel = null;
const RETIRED_RETAINER_DONE_PREFIX = "ff14_today_retainer_done_";

function japanDateKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  const get = type => parts.find(part => part.type === type)?.value || "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function markRemovedStepComplete() {
  try { localStorage.setItem(`${RETIRED_RETAINER_DONE_PREFIX}${japanDateKey()}`, "1"); } catch {}
}

function setPlanSelected({ scroll = false } = {}) {
  const root = ensurePanel();
  if (!root) return;
  root.querySelectorAll("[data-gc-content],[data-tribe-content],[data-retainer-content]").forEach(node => { node.hidden = true; });
  root.querySelectorAll("[data-gc-open],[data-tribe-open],[data-plan-open]").forEach(tab => {
    const active = tab.matches("[data-plan-open]");
    tab.classList.toggle("active", active);
    tab.setAttribute("aria-selected", active ? "true" : "false");
  });
  if (scroll) {
    const planner = document.getElementById("planner");
    if (planner) setTimeout(() => planner.scrollIntoView({ behavior: "smooth", block: "start" }), 60);
  }
}

function ensurePanel() {
  if (panel?.isConnected) return panel;
  const topbar = document.querySelector(".topbar");
  if (!topbar) return null;
  markRemovedStepComplete();
  panel = document.createElement("section");
  panel.className = "retainer-routine";
  panel.id = "retainerAdvice";
  panel.innerHTML = `
    <div class="retainer-flow-tabs" role="tablist" aria-label="ログイン後のおすすめ順">
      <button type="button" data-retainer-open aria-hidden="true" tabindex="-1" style="display:none">
        <span class="retainer-flow-step">2</span><span>削除済み</span><small data-retainer-tab-status>✓</small>
      </button>
      <button type="button" class="retainer-flow-tab" data-plan-open role="tab" aria-selected="false">
        <span class="retainer-flow-step">3</span><span>今日のプラン</span><small>次にやる</small>
      </button>
    </div>
    <div data-retainer-content hidden aria-hidden="true" style="display:none">
      <button type="button" data-retainer-done tabindex="-1" aria-hidden="true"></button>
    </div>
  `;
  topbar.insertAdjacentElement("afterend", panel);
  panel.querySelector("[data-plan-open]")?.addEventListener("click", () => setPlanSelected({ scroll: true }));
  return panel;
}

function boot() {
  ensurePanel();
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
else boot();

import "./hunt-section.js";
import "./hunt-native-file-picker.js";
import "./island-sanctuary.js";

if (!document.querySelector('link[data-island-sanctuary-style]')) {
  const islandStyle = document.createElement("link");
  islandStyle.rel = "stylesheet";
  islandStyle.href = "/island-sanctuary.css";
  islandStyle.setAttribute("data-island-sanctuary-style", "");
  document.head.append(islandStyle);
}

let panel = null;

function setPlanSelected({ scroll = false } = {}) {
  const root = ensurePanel();
  if (!root) return;
  root.querySelectorAll("[data-gc-content],[data-tribe-content],[data-island-content]").forEach(node => { node.hidden = true; });
  root.querySelectorAll("[data-gc-open],[data-tribe-open],[data-island-open],[data-plan-open]").forEach(tab => {
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
  panel = document.createElement("section");
  panel.className = "retainer-routine";
  panel.id = "retainerAdvice";
  panel.innerHTML = `
    <div class="retainer-flow-tabs" role="tablist" aria-label="ログイン後のおすすめ順">
      <button type="button" class="retainer-flow-tab" data-plan-open role="tab" aria-selected="false">
        <span class="retainer-flow-step">4</span><span>今日のプラン</span><small>次にやる</small>
      </button>
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

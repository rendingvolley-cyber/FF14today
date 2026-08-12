const TRIBE_CRAFT_DONE_PREFIX = "ff14_today_tribe_craft_done_";
const TRIBE_GATHER_DONE_PREFIX = "ff14_today_tribe_gather_done_";

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

function key(prefix) {
  return `${prefix}${japanDateKey()}`;
}

function isCraftDone() {
  return localStorage.getItem(key(TRIBE_CRAFT_DONE_PREFIX)) === "1";
}

function isGatherDone() {
  return localStorage.getItem(key(TRIBE_GATHER_DONE_PREFIX)) === "1";
}

function setDone(prefix, done) {
  if (done) localStorage.setItem(key(prefix), "1");
  else localStorage.removeItem(key(prefix));
}

function tribeDone() {
  return isCraftDone() && isGatherDone();
}

function gcDone() {
  return localStorage.getItem(`ff14_today_grand_company_done_${japanDateKey()}`) === "1";
}

function retainerDone() {
  return localStorage.getItem(`ff14_today_retainer_done_${japanDateKey()}`) === "1";
}

function root() {
  return document.getElementById("retainerAdvice");
}

function injectStyles() {
  if (document.getElementById("tribeRoutineStyles")) return;
  const style = document.createElement("style");
  style.id = "tribeRoutineStyles";
  style.textContent = `
    .tribe-routine-list{display:grid;gap:10px;margin-top:4px}
    .tribe-routine-row{display:flex;align-items:center;justify-content:space-between;gap:14px;border:1px solid var(--line);border-radius:15px;background:#fff;padding:13px 14px}
    .tribe-routine-copy strong{display:block;font-size:14px}.tribe-routine-copy small{display:block;margin-top:4px;color:var(--muted);font-size:11px;line-height:1.5}
    .tribe-routine-toggle{flex:0 0 auto;border:1px solid rgba(79,124,255,.38);border-radius:11px;background:var(--accent-soft);color:var(--accent);padding:8px 11px;font-weight:900;cursor:pointer}
    .tribe-routine-toggle.done{background:var(--accent);border-color:var(--accent);color:#fff}
    .tribe-routine-progress{margin:12px 0 0;color:var(--muted);font-size:12px;font-weight:800}
    @media(max-width:620px){.tribe-routine-row{align-items:flex-start;flex-direction:column}.tribe-routine-toggle{width:100%}}
  `;
  document.head.append(style);
}

function tribeTab() {
  return root()?.querySelector("[data-tribe-open]") || null;
}

function setVisualStep(name) {
  const panel = root();
  if (!panel) return;
  const contents = {
    "grand-company": panel.querySelector("[data-gc-content]"),
    retainer: panel.querySelector("[data-retainer-content]"),
    tribe: panel.querySelector("[data-tribe-content]")
  };
  for (const [keyName, node] of Object.entries(contents)) {
    if (node) node.hidden = keyName !== name;
  }

  const tabs = {
    "grand-company": panel.querySelector("[data-gc-open]"),
    retainer: panel.querySelector("[data-retainer-open]"),
    tribe: panel.querySelector("[data-tribe-open]"),
    plan: panel.querySelector("[data-plan-open]")
  };
  for (const [keyName, tab] of Object.entries(tabs)) {
    const active = keyName === name;
    tab?.classList.toggle("active", active);
    tab?.setAttribute("aria-selected", active ? "true" : "false");
  }
}

function updateUi() {
  const panel = root();
  if (!panel) return;
  const craftDone = isCraftDone();
  const gatherDone = isGatherDone();
  const count = Number(craftDone) + Number(gatherDone);
  const status = panel.querySelector("[data-tribe-tab-status]");
  if (status) status.textContent = count === 2 ? "✓ 完了" : `${count}/2`;

  for (const [kind, done] of [["craft", craftDone], ["gather", gatherDone]]) {
    const button = panel.querySelector(`[data-tribe-${kind}-toggle]`);
    if (!button) continue;
    button.classList.toggle("done", done);
    button.textContent = done ? "✓ 完了" : "終えた";
    button.setAttribute("aria-pressed", done ? "true" : "false");
  }
  const progress = panel.querySelector("[data-tribe-progress]");
  if (progress) {
    progress.textContent = count === 2
      ? "生産・採集の友好部族は今日ぶん完了。次は今日のプランです。"
      : `今日の友好部族 ${count}/2 完了。生産と採集をそれぞれ終えたら今日のプランへ進みます。`;
  }
}

function ensureStep() {
  const panel = root();
  if (!panel) return false;
  injectStyles();

  const tabs = panel.querySelector(".retainer-flow-tabs");
  const retainerTab = panel.querySelector("[data-retainer-open]");
  const planTab = panel.querySelector("[data-plan-open]");
  const retainerContent = panel.querySelector("[data-retainer-content]");
  if (!tabs || !retainerTab || !planTab || !retainerContent) return false;

  let tab = tribeTab();
  if (!tab) {
    tab = document.createElement("button");
    tab.type = "button";
    tab.className = "retainer-flow-tab";
    tab.setAttribute("data-tribe-open", "");
    tab.setAttribute("role", "tab");
    tab.setAttribute("aria-selected", "false");
    tab.setAttribute("aria-controls", "tribeRoutineContent");
    tab.innerHTML = '<span class="retainer-flow-step">2</span><span>友好部族</span><small data-tribe-tab-status>0/2</small>';
    tabs.insertBefore(tab, planTab);
  }

  const retainerStep = retainerTab.querySelector(".retainer-flow-step");
  const planStep = planTab.querySelector(".retainer-flow-step");
  if (retainerStep) retainerStep.textContent = "2";
  if (planStep) planStep.textContent = "3";

  let content = panel.querySelector("[data-tribe-content]");
  if (!content) {
    content = document.createElement("div");
    content.id = "tribeRoutineContent";
    content.className = "retainer-advice";
    content.setAttribute("data-tribe-content", "");
    content.hidden = true;
    content.innerHTML = `
      <div class="retainer-advice-head">
        <div>
          <div class="retainer-advice-title"><span class="retainer-advice-icon">T</span><span>双蛇党納品の次に友好部族（生産・採集）</span></div>
          <p class="retainer-advice-sub">戦闘系はここに混ぜず、生産系と採集系の日課だけ片付けます。</p>
        </div>
      </div>
      <div class="tribe-routine-list">
        <div class="tribe-routine-row">
          <div class="tribe-routine-copy"><strong>生産系の友好部族</strong><small>今日ぶんの生産系デイリーを終えたらチェック。</small></div>
          <button type="button" class="tribe-routine-toggle" data-tribe-craft-toggle aria-pressed="false">終えた</button>
        </div>
        <div class="tribe-routine-row">
          <div class="tribe-routine-copy"><strong>採集系の友好部族</strong><small>今日ぶんの採集系デイリーを終えたらチェック。</small></div>
          <button type="button" class="tribe-routine-toggle" data-tribe-gather-toggle aria-pressed="false">終えた</button>
        </div>
      </div>
      <p class="tribe-routine-progress" data-tribe-progress></p>
    `;
    retainerContent.insertAdjacentElement("afterend", content);
  }

  if (panel.dataset.tribeRoutineBound !== "1") {
    panel.dataset.tribeRoutineBound = "1";
    panel.addEventListener("click", event => {
      const button = event.target?.closest?.("button");
      if (!button) return;

      if (button.matches("[data-tribe-open]")) {
        setTimeout(() => setVisualStep("tribe"), 0);
        return;
      }
      if (button.matches("[data-gc-open],[data-retainer-open],[data-plan-open]")) {
        setTimeout(() => {
          const tribeContent = panel.querySelector("[data-tribe-content]");
          if (tribeContent) tribeContent.hidden = true;
        }, 0);
        return;
      }
      if (button.matches("[data-tribe-craft-toggle]")) {
        setDone(TRIBE_CRAFT_DONE_PREFIX, !isCraftDone());
        updateUi();
        if (tribeDone()) setVisualStep("plan");
        else setVisualStep("tribe");
        return;
      }
      if (button.matches("[data-tribe-gather-toggle]")) {
        setDone(TRIBE_GATHER_DONE_PREFIX, !isGatherDone());
        updateUi();
        if (tribeDone()) setVisualStep("plan");
        else setVisualStep("tribe");
        return;
      }
      if (button.matches("[data-gc-done],[data-retainer-done]")) {
        setTimeout(enforceAutomaticStep, 20);
      }
    });
  }

  updateUi();
  return true;
}

function enforceAutomaticStep() {
  if (!ensureStep()) return false;
  if (!gcDone()) {
    setVisualStep("grand-company");
    return true;
  }
  if (!retainerDone()) {
    setVisualStep("retainer");
    return true;
  }
  if (!tribeDone()) {
    setVisualStep("tribe");
    return true;
  }
  setVisualStep("plan");
  return true;
}

function boot() {
  for (const delay of [0, 100, 350, 900, 1800]) {
    setTimeout(() => {
      ensureStep();
      enforceAutomaticStep();
    }, delay);
  }
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
else boot();

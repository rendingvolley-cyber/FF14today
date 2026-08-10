import { tribeGuideForJob } from "./tribe-leveling-data.js";

const JOB_KEY = "ff14_today_combat_job_v1";
const MODE_KEY = "ff14_today_planner_mode_v1";
const TRIBE_UNLOCK_KEY = "ff14_today_tribe_unlocks_v1";
const originalFetch = window.fetch.bind(window);
let knownJobs = [];
let switcher = null;

const roleOrder = new Map([["tank", 0], ["healer", 1], ["melee", 2], ["ranged", 2], ["caster", 2], ["limited", 3]]);
const roleLabel = role => role === "tank" ? "TANK" : role === "healer" ? "HEALER" : role === "limited" ? "LIMITED" : "DPS";
const roleIcon = role => role === "tank" ? "◆" : role === "healer" ? "✚" : role === "limited" ? "★" : "⚔";

function selectedCode() {
  return String(localStorage.getItem(JOB_KEY) || "").trim().toUpperCase();
}

function loadTribeUnlocks() {
  try {
    const parsed = JSON.parse(localStorage.getItem(TRIBE_UNLOCK_KEY) || "{}");
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function setTribeUnlocked(id, unlocked) {
  const state = loadTribeUnlocks();
  if (unlocked) state[id] = true;
  else delete state[id];
  localStorage.setItem(TRIBE_UNLOCK_KEY, JSON.stringify(state));
}

function isLevelingJob(job) {
  const level = Number(job?.level);
  if (!Number.isInteger(level) || level < 70) return false;
  const code = String(job?.code || "").toUpperCase();
  if (code === "BLU" || (job?.role === "limited" && /青魔/.test(String(job?.name_ja || "")))) return level < 80;
  return ["tank", "healer", "melee", "ranged", "caster"].includes(job?.role) && level < 100;
}

function validLevelingJobs(character) {
  return (character?.jobs || [])
    .filter(isLevelingJob)
    .sort((a, b) => (roleOrder.get(a.role) - roleOrder.get(b.role)) || (b.level - a.level) || String(a.code).localeCompare(String(b.code)));
}

function currentJob() {
  const code = selectedCode();
  return knownJobs.find(job => String(job.code).toUpperCase() === code) || null;
}

function ensureSwitcher() {
  if (switcher?.isConnected) return switcher;
  const daily = document.getElementById("dailyChecklist");
  if (!daily) return null;
  switcher = document.createElement("section");
  switcher.id = "combatJobSwitcher";
  switcher.className = "combat-job-switcher hidden";
  switcher.innerHTML = `
    <div class="combat-job-head">
      <div>
        <p class="label">戦闘ジョブ</p>
        <strong>育てるジョブを切り替える</strong>
      </div>
      <div class="combat-job-current" data-combat-current><span class="combat-role-icon">⚔</span><span>—</span></div>
    </div>
    <div class="combat-job-select-row">
      <select id="combatJobSelect" aria-label="レベル上げする戦闘ジョブ"></select>
      <span class="combat-job-note" data-combat-note>Lv70以上の未カンストだけ表示。青魔は専用プラン。</span>
    </div>
    <section class="tribe-leveling-guide hidden" data-tribe-guide aria-live="polite">
      <div class="tribe-guide-head">
        <div>
          <span class="tribe-guide-kicker">育成の準備</span>
          <strong data-tribe-name>—</strong>
        </div>
        <span class="tribe-guide-status" data-tribe-status>未確認</span>
      </div>
      <p class="tribe-guide-why" data-tribe-why></p>
      <div class="tribe-first-step" data-tribe-first-step></div>
      <details class="tribe-guide-details" data-tribe-details>
        <summary>解放までを見る</summary>
        <ol data-tribe-steps></ol>
        <p class="tribe-guide-prereq" data-tribe-prereq></p>
      </details>
      <div class="tribe-guide-actions">
        <button type="button" class="tribe-unlocked-button" data-tribe-mark-unlocked>✓ これは解放済み</button>
        <button type="button" class="tribe-reset-button hidden" data-tribe-reset>未解放として表示</button>
      </div>
    </section>
  `;
  daily.insertAdjacentElement("beforebegin", switcher);
  switcher.querySelector("#combatJobSelect")?.addEventListener("change", event => {
    const code = String(event.target.value || "").toUpperCase();
    if (!code) return;
    localStorage.setItem(JOB_KEY, code);
    updateCurrentBadge();
    renderTribeGuide();
    const efficient = document.querySelector('#modeChoices button[data-mode="efficient"]');
    if (efficient) efficient.click();
  });
  switcher.querySelector("[data-tribe-mark-unlocked]")?.addEventListener("click", () => {
    const guide = tribeGuideForJob(currentJob());
    if (!guide) return;
    setTribeUnlocked(guide.id, true);
    renderTribeGuide();
  });
  switcher.querySelector("[data-tribe-reset]")?.addEventListener("click", () => {
    const guide = tribeGuideForJob(currentJob());
    if (!guide) return;
    setTribeUnlocked(guide.id, false);
    renderTribeGuide();
  });
  return switcher;
}

function updateCurrentBadge() {
  const root = ensureSwitcher();
  const job = currentJob();
  const badge = root?.querySelector("[data-combat-current]");
  if (!badge) return;
  if (!job) {
    badge.innerHTML = '<span class="combat-role-icon">⚔</span><span>—</span>';
    return;
  }
  badge.dataset.role = job.role;
  badge.replaceChildren();
  const icon = document.createElement("span");
  icon.className = "combat-role-icon";
  icon.textContent = roleIcon(job.role);
  const text = document.createElement("span");
  text.textContent = `${job.name_ja} Lv${job.level}`;
  badge.append(icon, text);
}

function renderTribeGuide() {
  const root = ensureSwitcher();
  const panel = root?.querySelector("[data-tribe-guide]");
  if (!panel) return;
  const job = currentJob();
  const guide = tribeGuideForJob(job);
  if (!guide) {
    panel.classList.add("hidden");
    return;
  }

  panel.classList.remove("hidden");
  const unlocked = Boolean(loadTribeUnlocks()[guide.id]);
  root.querySelector("[data-tribe-name]").textContent = `${guide.name} · ${guide.range_label}`;
  const status = root.querySelector("[data-tribe-status]");
  status.textContent = unlocked ? "解放済み" : "解放状況 未確認";
  status.classList.toggle("done", unlocked);
  root.querySelector("[data-tribe-why]").textContent = unlocked
    ? `${job.name_ja} Lv${job.level}のレベル帯で使える友好部族。解放済みとして保存しています。`
    : `${job.name_ja} Lv${job.level}のレベル帯で使える友好部族。未解放なら、最初の1歩はアプリ側でここまで絞ります。`;

  const first = root.querySelector("[data-tribe-first-step]");
  first.replaceChildren();
  const label = document.createElement("span");
  label.textContent = unlocked ? "使うとき" : "まずこれ";
  const text = document.createElement("strong");
  text.textContent = unlocked
    ? `${guide.name}のデイリークエストを確認する`
    : guide.first_step;
  first.append(label, text);

  const steps = root.querySelector("[data-tribe-steps]");
  steps.replaceChildren(...guide.steps.map(step => {
    const li = document.createElement("li");
    li.textContent = step;
    return li;
  }));
  root.querySelector("[data-tribe-prereq]").textContent = `前提：${guide.prerequisite}。${guide.unlock_result}`;
  root.querySelector("[data-tribe-details]").open = false;
  root.querySelector("[data-tribe-mark-unlocked]").classList.toggle("hidden", unlocked);
  root.querySelector("[data-tribe-reset]").classList.toggle("hidden", !unlocked);
}

function fillSelector(character, planFocusCode = null) {
  knownJobs = validLevelingJobs(character);
  const root = ensureSwitcher();
  const select = root?.querySelector("#combatJobSelect");
  if (!select) return;

  let code = selectedCode();
  if (!knownJobs.some(job => String(job.code).toUpperCase() === code)) {
    const planned = String(planFocusCode || "").toUpperCase();
    code = knownJobs.some(job => String(job.code).toUpperCase() === planned)
      ? planned
      : String(knownJobs[0]?.code || "").toUpperCase();
    if (code) localStorage.setItem(JOB_KEY, code);
  }

  const groups = new Map([["TANK", []], ["HEALER", []], ["DPS", []], ["LIMITED", []]]);
  for (const job of knownJobs) groups.get(roleLabel(job.role)).push(job);
  const nodes = [];
  for (const [label, jobs] of groups) {
    if (!jobs.length) continue;
    const group = document.createElement("optgroup");
    group.label = label;
    for (const job of jobs) {
      const option = document.createElement("option");
      option.value = job.code;
      option.textContent = `${job.name_ja} · Lv${job.level}`;
      option.selected = String(job.code).toUpperCase() === code;
      group.append(option);
    }
    nodes.push(group);
  }
  select.replaceChildren(...nodes);
  select.disabled = knownJobs.length === 0;
  updateCurrentBadge();
  renderTribeGuide();
  syncVisibility();
}

function syncVisibility() {
  const root = ensureSwitcher();
  if (!root) return;
  const activeMode = document.querySelector('#modeChoices button[data-mode].active')?.dataset.mode
    || localStorage.getItem(MODE_KEY)
    || "efficient";
  root.classList.toggle("hidden", activeMode !== "efficient" || knownJobs.length === 0);
}

function withFocusInUrl(rawUrl) {
  const code = selectedCode();
  if (!code) return rawUrl;
  const url = new URL(rawUrl, location.href);
  if (url.pathname === "/api/state") url.searchParams.set("focus_combat_job_code", code);
  return url.toString();
}

async function interceptedFetch(input, init = {}) {
  let nextInput = input;
  let nextInit = init;
  try {
    const rawUrl = typeof input === "string" ? input : input?.url || "";
    const url = new URL(rawUrl, location.href);
    const code = selectedCode();
    if (code && url.pathname === "/api/state" && (!init.method || String(init.method).toUpperCase() === "GET")) {
      nextInput = withFocusInUrl(rawUrl);
    }
    if (code && url.pathname === "/api/plan" && String(init.method || "GET").toUpperCase() === "POST" && typeof init.body === "string") {
      try {
        const payload = JSON.parse(init.body);
        if ((payload.planner_mode || "efficient") === "efficient") {
          payload.focus_combat_job_code = code;
          nextInit = { ...init, body: JSON.stringify(payload) };
        }
      } catch {}
    }
  } catch {}

  const response = await originalFetch(nextInput, nextInit);
  try {
    const rawUrl = typeof nextInput === "string" ? nextInput : nextInput?.url || "";
    const url = new URL(rawUrl, location.href);
    if (["/api/state", "/api/sync"].includes(url.pathname) && (response.headers.get("content-type") || "").includes("application/json")) {
      response.clone().json().then(data => {
        if (data?.character) fillSelector(data.character, data?.plan?.focus_job?.code);
      }).catch(() => {});
    }
  } catch {}
  return response;
}

window.fetch = interceptedFetch;

document.addEventListener("click", event => {
  if (event.target.closest("#modeChoices button[data-mode]")) setTimeout(syncVisibility, 0);
});

function boot() {
  ensureSwitcher();
  syncVisibility();
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
else boot();

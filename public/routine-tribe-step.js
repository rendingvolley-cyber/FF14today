import {
  ALLIED_SOCIETY_DAILY_LIMIT,
  alliedSocietyCategoryLabel,
  buildTribeDailyPlan
} from "./tribe-leveling-data.js";
import {
  buildEffectiveTribeGroups,
  canAllocateRankupExtra,
  countCompletedTribeQuests,
  countPlannedTribeQuests,
  rankupBatchKey
} from "./tribe-rankup-extra.js";

const PROFILE_TOKEN_KEY = "ff14_today_profile_token_v1";
const TRIBE_DAILY_DONE_PREFIX = "ff14_today_tribe_daily12_done_";
const TRIBE_DAILY_DEFER_PREFIX = "ff14_today_tribe_daily12_defer_";
const TRIBE_DAILY_RANKUP_PREFIX = "ff14_today_tribe_daily12_rankup_extra_";
const FOCUS_KEYS = {
  combat: "ff14_today_combat_job_v1",
  craft: "ff14_today_craft_job_v1",
  gather: "ff14_today_gather_job_v1"
};

let currentPlan = null;
let refreshInFlight = false;

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

function loadDoneIds() {
  try {
    const parsed = JSON.parse(localStorage.getItem(key(TRIBE_DAILY_DONE_PREFIX)) || "[]");
    return new Set(Array.isArray(parsed) ? parsed.map(String) : []);
  } catch {
    return new Set();
  }
}

function saveDoneIds(done) {
  localStorage.setItem(key(TRIBE_DAILY_DONE_PREFIX), JSON.stringify([...done]));
}

function setGroupDone(batchKey, done) {
  const ids = loadDoneIds();
  if (done) ids.add(String(batchKey));
  else ids.delete(String(batchKey));
  saveDoneIds(ids);
}

function loadRankupSocietyIds() {
  try {
    const parsed = JSON.parse(localStorage.getItem(key(TRIBE_DAILY_RANKUP_PREFIX)) || "[]");
    return new Set(Array.isArray(parsed) ? parsed.map(String) : []);
  } catch {
    return new Set();
  }
}

function saveRankupSocietyIds(ids) {
  localStorage.setItem(key(TRIBE_DAILY_RANKUP_PREFIX), JSON.stringify([...ids]));
}

function setRankupExtra(societyId, enabled) {
  const ids = loadRankupSocietyIds();
  if (enabled) ids.add(String(societyId));
  else ids.delete(String(societyId));
  saveRankupSocietyIds(ids);
}

function isDeferred() {
  return localStorage.getItem(key(TRIBE_DAILY_DEFER_PREFIX)) === "1";
}

function setDeferred(value) {
  if (value) localStorage.setItem(key(TRIBE_DAILY_DEFER_PREFIX), "1");
  else localStorage.removeItem(key(TRIBE_DAILY_DEFER_PREFIX));
}

function effectiveGroups() {
  if (!currentPlan) return [];
  return buildEffectiveTribeGroups(
    currentPlan.groups,
    [...loadRankupSocietyIds()],
    [...loadDoneIds()],
    ALLIED_SOCIETY_DAILY_LIMIT
  );
}

function completedQuestCount() {
  return countCompletedTribeQuests(effectiveGroups(), [...loadDoneIds()]);
}

function plannedQuestCount() {
  return countPlannedTribeQuests(effectiveGroups(), ALLIED_SOCIETY_DAILY_LIMIT);
}

function tribeDone() {
  if (!currentPlan) return false;
  if (isDeferred()) return true;
  return completedQuestCount() >= plannedQuestCount();
}

function gcDone() {
  return localStorage.getItem(`ff14_today_grand_company_done_${japanDateKey()}`) === "1";
}

function profileToken() {
  const token = String(localStorage.getItem(PROFILE_TOKEN_KEY) || "");
  return /^[A-Za-z0-9_-]{43,128}$/.test(token) ? token : "";
}

function focusCodes() {
  return Object.fromEntries(Object.entries(FOCUS_KEYS).map(([category, storageKey]) => [
    category,
    String(localStorage.getItem(storageKey) || "").trim().toUpperCase()
  ]));
}

function root() {
  return document.getElementById("retainerAdvice");
}

function injectStyles() {
  if (document.getElementById("tribeRoutineStyles")) return;
  const style = document.createElement("style");
  style.id = "tribeRoutineStyles";
  style.textContent = `
    .tribe-routine-summary{display:flex;justify-content:space-between;gap:14px;align-items:flex-end;margin:2px 0 12px;padding:12px 14px;border:1px solid var(--line);border-radius:14px;background:#f8fbff}
    .tribe-routine-summary strong{display:block;font-size:18px;color:#183f69}.tribe-routine-summary small{display:block;margin-top:4px;color:var(--muted);font-size:11px;line-height:1.5}
    .tribe-routine-count{font-weight:950;color:var(--accent);white-space:nowrap;font-size:14px}
    .tribe-routine-list{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin-top:4px}
    .tribe-routine-row{display:flex;min-width:0;flex-direction:column;gap:9px;border:1px solid var(--line);border-radius:15px;background:#fff;padding:13px 14px}
    .tribe-routine-row.conditional{background:#fffaf2;border-color:#eadcbf}.tribe-routine-row.rankup-extra{background:#f6fbff;border-color:#bdd8f2}
    .tribe-routine-top{display:flex;align-items:flex-start;justify-content:space-between;gap:10px}.tribe-routine-copy{min-width:0}.tribe-routine-copy strong{display:block;font-size:14px;line-height:1.45}.tribe-routine-copy small{display:block;margin-top:4px;color:var(--muted);font-size:11px;line-height:1.5}
    .tribe-routine-badges{display:flex;gap:5px;flex-wrap:wrap;margin-top:7px}.tribe-routine-badge{display:inline-flex;border-radius:999px;background:#edf4fc;color:#34628f;padding:3px 7px;font-size:10px;font-weight:900}.tribe-routine-row.conditional .tribe-routine-badge.kind{background:#f7ead2;color:#805d24}.tribe-routine-row.rankup-extra .tribe-routine-badge.kind{background:#dceeff;color:#245f92}
    .tribe-routine-quests{flex:0 0 auto;border-radius:999px;background:var(--accent-soft);color:var(--accent);padding:4px 8px;font-size:11px;font-weight:950}
    .tribe-routine-reason{margin:0;color:#5f7890;font-size:11px;line-height:1.55}
    .tribe-routine-toggle{margin-top:auto;border:1px solid rgba(79,124,255,.38);border-radius:11px;background:var(--accent-soft);color:var(--accent);padding:8px 11px;font-weight:900;cursor:pointer}
    .tribe-routine-toggle.done{background:var(--accent);border-color:var(--accent);color:#fff}
    .tribe-routine-rankup{border:1px solid #8fbce7;border-radius:11px;background:#fff;color:#245f92;padding:8px 11px;font-weight:900;cursor:pointer}.tribe-routine-rankup:hover{background:#eef7ff}
    .tribe-routine-rankup-note{margin:0;color:#3373a8;font-size:10px;font-weight:850;line-height:1.5}
    .tribe-routine-footer{display:flex;gap:10px;align-items:center;justify-content:space-between;margin-top:12px;flex-wrap:wrap}.tribe-routine-progress{margin:0;color:var(--muted);font-size:12px;font-weight:800;line-height:1.5;flex:1;min-width:220px}
    .tribe-routine-defer{border:1px solid var(--line);border-radius:11px;background:#fff;color:#55718c;padding:8px 11px;font-weight:850;cursor:pointer}.tribe-routine-defer.active{background:#eef3f8}
    .tribe-routine-note{margin:9px 0 0;color:#8294a6;font-size:10px;line-height:1.5}
    .tribe-routine-loading{padding:16px;border:1px dashed var(--line);border-radius:14px;color:var(--muted);font-size:12px}
    @media(max-width:760px){.tribe-routine-list{grid-template-columns:1fr}.tribe-routine-summary{align-items:flex-start;flex-direction:column}.tribe-routine-count{white-space:normal}.tribe-routine-defer{width:100%}}
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
    tribe: panel.querySelector("[data-tribe-content]")
  };
  for (const [keyName, node] of Object.entries(contents)) {
    if (node) node.hidden = keyName !== name;
  }

  const tabs = {
    "grand-company": panel.querySelector("[data-gc-open]"),
    tribe: panel.querySelector("[data-tribe-open]"),
    plan: panel.querySelector("[data-plan-open]")
  };
  for (const [keyName, tab] of Object.entries(tabs)) {
    const active = keyName === name;
    tab?.classList.toggle("active", active);
    tab?.setAttribute("aria-selected", active ? "true" : "false");
  }
}

function makeGroupCard(group, done, { canRankup = false, rankupAllocated = false } = {}) {
  const card = document.createElement("article");
  card.className = `tribe-routine-row${group.conditional ? " conditional" : ""}${group.rankup_extra ? " rankup-extra" : ""}`;

  const top = document.createElement("div");
  top.className = "tribe-routine-top";
  const copy = document.createElement("div");
  copy.className = "tribe-routine-copy";
  const title = document.createElement("strong");
  title.textContent = `${group.priority_rank}. ${group.society_name}${group.rankup_extra ? "（追加3件）" : ""}`;
  const target = document.createElement("small");
  target.textContent = `${alliedSocietyCategoryLabel(group.category)} · ${group.target_job_name} Lv${group.target_job_level} · ${group.area}`;
  const badges = document.createElement("div");
  badges.className = "tribe-routine-badges";
  const range = document.createElement("span");
  range.className = "tribe-routine-badge";
  range.textContent = group.range_label;
  const kind = document.createElement("span");
  kind.className = "tribe-routine-badge kind";
  kind.textContent = group.rankup_extra ? "ランクアップ追加" : group.conditional ? "余力・友好度枠" : group.focused ? "選択ジョブ優先" : "経験値適正";
  badges.append(range, kind);
  copy.append(title, target, badges);

  const quests = document.createElement("span");
  quests.className = "tribe-routine-quests";
  quests.textContent = `${group.quests}件`;
  top.append(copy, quests);

  const reason = document.createElement("p");
  reason.className = "tribe-routine-reason";
  reason.textContent = group.reason;

  const button = document.createElement("button");
  button.type = "button";
  button.className = `tribe-routine-toggle${done ? " done" : ""}`;
  button.dataset.tribeGroupToggle = String(group.batch_key || group.society_id || "");
  button.setAttribute("aria-pressed", done ? "true" : "false");
  button.textContent = done ? `✓ ${group.quests}件完了` : `${group.quests}件終えた`;

  card.append(top, reason, button);

  if (!group.rankup_extra && done && canRankup) {
    const rankup = document.createElement("button");
    rankup.type = "button";
    rankup.className = "tribe-routine-rankup";
    rankup.dataset.tribeRankupExtra = String(group.society_id || "");
    rankup.textContent = "ランクアップしたので追加3件受注";
    card.append(rankup);
  } else if (!group.rankup_extra && done && rankupAllocated) {
    const note = document.createElement("p");
    note.className = "tribe-routine-rankup-note";
    note.textContent = "追加3件を今日の12枠内へ反映済み";
    card.append(note);
  }

  if (group.rankup_extra && !done) {
    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.className = "tribe-routine-rankup";
    cancel.dataset.tribeRankupCancel = String(group.society_id || "");
    cancel.textContent = "追加3件を取り消す";
    card.append(cancel);
  }

  return card;
}

function renderPlan() {
  const panel = root();
  const content = panel?.querySelector("[data-tribe-content]");
  if (!content) return;
  const list = content.querySelector("[data-tribe-plan-list]");
  const summary = content.querySelector("[data-tribe-summary]");
  const progress = content.querySelector("[data-tribe-progress]");
  const note = content.querySelector("[data-tribe-note]");
  const deferButton = content.querySelector("[data-tribe-defer]");

  if (!currentPlan) {
    if (summary) summary.innerHTML = '<div><strong>今日の12枠を計算中…</strong><small>LodestoneのジョブLvを読み込んでいます。</small></div>';
    if (list) list.innerHTML = '<div class="tribe-routine-loading">友好部族の配分を読み込み中です。</div>';
    return;
  }

  const doneIds = loadDoneIds();
  const rankupIds = loadRankupSocietyIds();
  const groups = effectiveGroups();
  const completed = countCompletedTribeQuests(groups, [...doneIds]);
  const deferred = isDeferred();
  const planned = countPlannedTribeQuests(groups, ALLIED_SOCIETY_DAILY_LIMIT);
  const remaining = Math.max(0, ALLIED_SOCIETY_DAILY_LIMIT - planned);
  const rankupQuests = groups.filter(group => group.rankup_extra).reduce((sum, group) => sum + Number(group.quests || 0), 0);
  const levelingQuests = groups.filter(group => !group.rankup_extra && group.kind === "leveling").reduce((sum, group) => sum + Number(group.quests || 0), 0);
  const conditionalQuests = groups.filter(group => !group.rankup_extra && group.conditional).reduce((sum, group) => sum + Number(group.quests || 0), 0);

  if (summary) {
    summary.replaceChildren();
    const copy = document.createElement("div");
    const strong = document.createElement("strong");
    strong.textContent = "友好部族 今日の12枠";
    const small = document.createElement("small");
    const pieces = [`経験値優先 ${levelingQuests}件`];
    if (conditionalQuests) pieces.push(`余力 ${conditionalQuests}件`);
    if (rankupQuests) pieces.push(`ランクアップ追加 ${rankupQuests}件（12枠内）`);
    if (remaining) pieces.push(`未配分 ${remaining}件`);
    small.textContent = pieces.join(" · ");
    copy.append(strong, small);
    const count = document.createElement("span");
    count.className = "tribe-routine-count";
    count.textContent = `${completed}/${planned || ALLIED_SOCIETY_DAILY_LIMIT}件完了`;
    summary.append(copy, count);
  }

  if (list) {
    if (groups.length) {
      list.replaceChildren(...groups.map(group => {
        const batchKey = String(group.batch_key || group.society_id || "");
        const canRankup = !group.rankup_extra && canAllocateRankupExtra({
          baseGroups: currentPlan.groups,
          rankupSocietyIds: [...rankupIds],
          doneKeys: [...doneIds],
          societyId: group.society_id,
          dailyLimit: ALLIED_SOCIETY_DAILY_LIMIT
        });
        return makeGroupCard(group, doneIds.has(batchKey), {
          canRankup,
          rankupAllocated: rankupIds.has(String(group.society_id || ""))
        });
      }));
    } else {
      const empty = document.createElement("div");
      empty.className = "tribe-routine-loading";
      empty.textContent = "Lv50〜99で経験値の適正帯に入る友好部族候補がありません。";
      list.replaceChildren(empty);
    }
  }

  if (progress) {
    if (!planned) progress.textContent = "今日ここで優先する友好部族はありません。今日のプランへ進めます。";
    else if (completed >= planned) progress.textContent = `今日の友好部族 ${completed}/${planned}件 完了。`;
    else if (deferred) progress.textContent = `${completed}/${planned}件まで完了。残りは今日は保留にしています。`;
    else if (rankupQuests) progress.textContent = `${completed}/${planned}件 完了。ランクアップ追加3件も1日合計12件の受注枠に含めています。`;
    else progress.textContent = `${completed}/${planned}件 完了。3件単位で終えた部族をチェックできます。ランクアップした部族は追加3件へ振り替え可能です。`;
  }
  if (note) {
    const baseNote = currentPlan.note || "";
    note.textContent = rankupQuests
      ? `${baseNote} ランクアップ追加は受注上限を増やさず、未完了の3枠と入れ替えています。`.trim()
      : baseNote;
  }
  if (deferButton) {
    deferButton.hidden = !planned || completed >= planned;
    deferButton.classList.toggle("active", deferred);
    deferButton.textContent = deferred ? "保留を解除する" : "残りは今日はやらない";
  }

  const status = panel?.querySelector("[data-tribe-tab-status]");
  if (status) {
    if (!planned || completed >= planned) status.textContent = "✓ 完了";
    else if (deferred) status.textContent = `${completed}/${planned} 保留`;
    else status.textContent = `${completed}/${planned}`;
  }
}

function ensureStep() {
  const panel = root();
  if (!panel) return false;
  injectStyles();

  const tabs = panel.querySelector(".retainer-flow-tabs");
  const planTab = panel.querySelector("[data-plan-open]");
  if (!tabs || !planTab) return false;

  let tab = tribeTab();
  if (!tab) {
    tab = document.createElement("button");
    tab.type = "button";
    tab.className = "retainer-flow-tab";
    tab.setAttribute("data-tribe-open", "");
    tab.setAttribute("role", "tab");
    tab.setAttribute("aria-selected", "false");
    tab.setAttribute("aria-controls", "tribeRoutineContent");
    tab.innerHTML = '<span class="retainer-flow-step">2</span><span>友好部族</span><small data-tribe-tab-status>0/12</small>';
    tabs.insertBefore(tab, planTab);
  }

  const planStep = planTab.querySelector(".retainer-flow-step");
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
          <div class="retainer-advice-title"><span class="retainer-advice-icon">T</span><span>友好部族デイリーを12枠で配分</span></div>
          <p class="retainer-advice-sub">1日合計12件を上限に、LodestoneのジョブLvと選択中ジョブから3件単位で優先順を作ります。ランクアップ時の追加3件も12枠内で振り替えます。</p>
        </div>
      </div>
      <div class="tribe-routine-summary" data-tribe-summary></div>
      <div class="tribe-routine-list" data-tribe-plan-list></div>
      <div class="tribe-routine-footer">
        <p class="tribe-routine-progress" data-tribe-progress></p>
        <button type="button" class="tribe-routine-defer" data-tribe-defer>残りは今日はやらない</button>
      </div>
      <p class="tribe-routine-note" data-tribe-note></p>
    `;
    const gcContent = panel.querySelector("[data-gc-content]");
    if (gcContent) gcContent.insertAdjacentElement("afterend", content);
    else tabs.insertAdjacentElement("afterend", content);
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
      if (button.matches("[data-gc-open],[data-plan-open]")) {
        setTimeout(() => {
          const tribeContent = panel.querySelector("[data-tribe-content]");
          if (tribeContent) tribeContent.hidden = true;
        }, 0);
        return;
      }
      if (button.matches("[data-tribe-group-toggle]")) {
        const id = String(button.dataset.tribeGroupToggle || "");
        const doneIds = loadDoneIds();
        const nextDone = !doneIds.has(id);
        setGroupDone(id, nextDone);
        if (!nextDone && !id.startsWith("rankup:")) {
          setRankupExtra(id, false);
          setGroupDone(rankupBatchKey(id), false);
        }
        setDeferred(false);
        renderPlan();
        if (tribeDone()) setVisualStep("plan");
        return;
      }
      if (button.matches("[data-tribe-rankup-extra]")) {
        const id = String(button.dataset.tribeRankupExtra || "");
        const allowed = canAllocateRankupExtra({
          baseGroups: currentPlan?.groups || [],
          rankupSocietyIds: [...loadRankupSocietyIds()],
          doneKeys: [...loadDoneIds()],
          societyId: id,
          dailyLimit: ALLIED_SOCIETY_DAILY_LIMIT
        });
        if (allowed) {
          setRankupExtra(id, true);
          setDeferred(false);
          renderPlan();
          setVisualStep("tribe");
        }
        return;
      }
      if (button.matches("[data-tribe-rankup-cancel]")) {
        const id = String(button.dataset.tribeRankupCancel || "");
        setRankupExtra(id, false);
        setGroupDone(rankupBatchKey(id), false);
        setDeferred(false);
        renderPlan();
        return;
      }
      if (button.matches("[data-tribe-defer]")) {
        setDeferred(!isDeferred());
        renderPlan();
        if (isDeferred()) setVisualStep("plan");
        return;
      }
      if (button.matches("[data-gc-done]")) {
        setTimeout(enforceAutomaticStep, 20);
      }
    });
  }

  renderPlan();
  return true;
}

async function refreshTribePlan() {
  if (refreshInFlight) return;
  refreshInFlight = true;
  try {
    const headers = {};
    const token = profileToken();
    if (token) headers["x-profile-token"] = token;
    const params = new URLSearchParams({ lodestone_id: "3091607", planner_mode: "efficient" });
    const response = await fetch(`/api/state?${params.toString()}`, { headers });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    currentPlan = buildTribeDailyPlan(data?.character || { jobs: [] }, { focus: focusCodes() });
    ensureStep();
    renderPlan();
    enforceAutomaticStep();
  } catch (error) {
    currentPlan = null;
    ensureStep();
    const content = root()?.querySelector("[data-tribe-content]");
    const list = content?.querySelector("[data-tribe-plan-list]");
    if (list) list.innerHTML = `<div class="tribe-routine-loading">友好部族の配分を取得できませんでした：${String(error?.message || error)}</div>`;
  } finally {
    refreshInFlight = false;
  }
}

function enforceAutomaticStep() {
  if (!ensureStep()) return false;
  if (!gcDone()) {
    setVisualStep("grand-company");
    return true;
  }
  if (!currentPlan || !tribeDone()) {
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
  void refreshTribePlan();

  for (const eventName of ["ff14today:context-saved", "ff14today:context-updated", "ff14today:inventory-evidence-updated"]) {
    window.addEventListener(eventName, () => setTimeout(() => void refreshTribePlan(), 300));
  }
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
else boot();

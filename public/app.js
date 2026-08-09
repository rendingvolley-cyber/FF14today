const PROFILE_TOKEN_KEY = "ff14_today_profile_token_v1";
const DAILY_CHECKLIST_PREFIX = "ff14_today_daily_checklist_";
const SESSION_PREFIX = "ff14_today_session_";

function japanDateKey() {
  const parts = new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date());
  const get = type => parts.find(part => part.type === type)?.value || "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function dailyStorageKey(dateKey = japanDateKey()) {
  return `${DAILY_CHECKLIST_PREFIX}${dateKey}`;
}

function sessionStorageKey(dateKey = japanDateKey()) {
  return `${SESSION_PREFIX}${dateKey}`;
}

function loadDailyCompletion(dateKey = japanDateKey()) {
  try {
    const raw = localStorage.getItem(dailyStorageKey(dateKey));
    const parsed = raw ? JSON.parse(raw) : {};
    return { leveling: Boolean(parsed.leveling), alliance: Boolean(parsed.alliance) };
  } catch {
    return { leveling: false, alliance: false };
  }
}

function loadSession(dateKey = japanDateKey()) {
  try {
    const raw = localStorage.getItem(sessionStorageKey(dateKey));
    const parsed = raw ? JSON.parse(raw) : null;
    if (!parsed) return null;
    const original = Number(parsed.original_minutes);
    const remaining = Number(parsed.remaining_minutes);
    if (!Number.isFinite(original) || !Number.isFinite(remaining)) return null;
    return {
      originalMinutes: Math.max(0, original),
      remainingMinutes: Math.max(0, remaining)
    };
  } catch {
    return null;
  }
}

const state = {
  minutes: 60,
  energy: 2,
  character: null,
  achievements: null,
  plan: null,
  currentMethod: null,
  activeTaskKey: null,
  activeTaskStartedAt: null,
  todayCompletedCount: 0,
  profileToken: getOrCreateProfileToken(),
  dailyDate: japanDateKey(),
  dailyCompletion: loadDailyCompletion(),
  session: loadSession()
};

const $ = id => document.getElementById(id);

function getOrCreateProfileToken() {
  let token = localStorage.getItem(PROFILE_TOKEN_KEY);
  if (token && /^[A-Za-z0-9_-]{43,128}$/.test(token)) return token;
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let binary = "";
  bytes.forEach(byte => { binary += String.fromCharCode(byte); });
  token = btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  localStorage.setItem(PROFILE_TOKEN_KEY, token);
  return token;
}

function setStatus(message, error = false) {
  $("statusMessage").textContent = message || "";
  $("statusMessage").classList.toggle("error", error);
}

function formatSync(iso) {
  if (!iso) return "未同期";
  return `最終同期 ${new Date(iso).toLocaleString("ja-JP", { hour12: false })}`;
}

async function api(path, options = {}) {
  const headers = { "x-profile-token": state.profileToken, ...(options.headers || {}) };
  if (options.body !== undefined) headers["content-type"] = "application/json";
  const response = await fetch(path, { ...options, headers });
  const data = await response.json();
  if (!response.ok) throw new Error(data.detail || data.error || `HTTP ${response.status}`);
  return data;
}

function saveDailyCompletion() {
  localStorage.setItem(dailyStorageKey(state.dailyDate), JSON.stringify(state.dailyCompletion));
}

function saveSession() {
  if (!state.session) {
    localStorage.removeItem(sessionStorageKey(state.dailyDate));
    return;
  }
  localStorage.setItem(sessionStorageKey(state.dailyDate), JSON.stringify({
    original_minutes: state.session.originalMinutes,
    remaining_minutes: state.session.remainingMinutes
  }));
}

function beginSession() {
  state.session = {
    originalMinutes: state.minutes,
    remainingMinutes: state.minutes
  };
  saveSession();
  renderSessionMeta();
}

function renderSessionMeta() {
  const sessionText = $("sessionRemaining");
  const completedText = $("todayCompletedCount");
  if (sessionText) {
    sessionText.textContent = state.session
      ? `残り 約${Math.max(0, Math.round(state.session.remainingMinutes))}分`
      : "まだ開始していません";
  }
  if (completedText) completedText.textContent = `今日完了 ${state.todayCompletedCount}件`;
}

function ensureDailyDateCurrent() {
  const today = japanDateKey();
  if (today === state.dailyDate) return false;
  state.dailyDate = today;
  state.dailyCompletion = loadDailyCompletion(today);
  state.session = loadSession(today);
  state.todayCompletedCount = 0;
  state.currentMethod = null;
  state.activeTaskKey = null;
  state.activeTaskStartedAt = null;
  renderDailyChecklist();
  renderSessionMeta();
  return true;
}

function stateQuery() {
  const params = new URLSearchParams({ lodestone_id: "3091607" });
  if (state.dailyCompletion.leveling) params.set("completed_leveling", "1");
  if (state.dailyCompletion.alliance) params.set("completed_alliance", "1");
  return `/api/state?${params.toString()}`;
}

function showCharacterUI(show) {
  ["identity", "planner", "nowPanel", "jobsPanel"].forEach(id => {
    $(id).classList.toggle("hidden", !show);
  });
}

function renderCharacter(character) {
  state.character = character;
  showCharacterUI(Boolean(character));
  if (!character) return;

  $("characterName").textContent = character.name;
  $("characterWorld").textContent = character.data_center
    ? `${character.world} [${character.data_center}]`
    : character.world;
  $("syncDot").classList.add("ok");
  $("syncText").textContent = formatSync(character.synced_at);

  const jobs = character.jobs || [];
  const unlocked = jobs.filter(job => job.level !== null);
  const capped = unlocked.filter(job => job.level >= 100);
  $("jobsSummary").textContent = `${unlocked.length} Job解放 / Lv100 ${capped.length}`;
  $("jobsGrid").replaceChildren(...jobs.map(job => {
    const card = document.createElement("div");
    card.className = `job ${job.level === null ? "locked" : ""}`;
    const code = document.createElement("div");
    code.className = "code";
    code.textContent = `${job.code} · ${job.name_ja}`;
    const level = document.createElement("div");
    level.className = "level";
    level.textContent = job.level === null ? "—" : `Lv ${job.level}`;
    card.append(code, level);
    return card;
  }));
  $("planKind").textContent = "READY";
}

function renderAchievements(achievements) {
  state.achievements = achievements;
  if (!achievements) return;

  $("achievementCount").textContent = Number(achievements.total_achievements || 0).toLocaleString("ja-JP");
  $("achievementPoints").textContent = achievements.achievement_points == null
    ? "—"
    : Number(achievements.achievement_points).toLocaleString("ja-JP");
  $("achievementPages").textContent = Number(achievements.page_total || 0).toLocaleString("ja-JP");
  $("achievementSyncText").textContent = `${formatSync(achievements.synced_at)}${achievements.cached ? " · cache" : ""}`;

  const recent = (achievements.history || []).slice(0, 8);
  if (!recent.length) {
    const li = document.createElement("li");
    li.className = "muted";
    li.textContent = "達成履歴なし";
    $("recentAchievements").replaceChildren(li);
    return;
  }

  $("recentAchievements").replaceChildren(...recent.map(entry => {
    const li = document.createElement("li");
    const name = document.createElement("strong");
    name.textContent = entry.name || entry.activity_text || `Achievement ${entry.achievement_id}`;
    li.append(name);
    if (entry.achieved_at) {
      const time = document.createElement("time");
      time.dateTime = entry.achieved_at;
      time.textContent = new Date(entry.achieved_at).toLocaleDateString("ja-JP");
      li.append(time);
    }
    return li;
  }));
}

function renderDailyChecklist() {
  $("dailyLeveling").checked = state.dailyCompletion.leveling;
  $("dailyAlliance").checked = state.dailyCompletion.alliance;
  $("dailyDate").textContent = state.dailyDate;

  const done = Number(state.dailyCompletion.leveling) + Number(state.dailyCompletion.alliance);
  if (done === 0) {
    $("dailyCheckStatus").textContent = "完了ボタンを押すと、該当する日課も自動でチェックされます。";
  } else if (done === 1) {
    $("dailyCheckStatus").textContent = "1つ消化済み。残っている日課を優先します。";
  } else {
    $("dailyCheckStatus").textContent = "日課2つ完了。反復できる候補へ切り替えます。";
  }
}

function appendMethodBody(container, method, compact = false) {
  const meta = document.createElement("div");
  meta.className = "method-meta";
  if (method.minutes) {
    const minutes = document.createElement("span");
    minutes.textContent = `目安 ${method.minutes}分`;
    meta.append(minutes);
  }
  container.append(meta);

  if (method.reason) {
    const reason = document.createElement("p");
    reason.className = "method-reason";
    reason.textContent = method.reason;
    container.append(reason);
  }

  if (method.condition) {
    const condition = document.createElement("p");
    condition.className = "method-condition";
    condition.textContent = `選ぶ条件：${method.condition}`;
    container.append(condition);
  }

  if (!compact && method.steps?.length) {
    const steps = document.createElement("ol");
    steps.className = "method-steps";
    steps.replaceChildren(...method.steps.map(step => {
      const li = document.createElement("li");
      li.textContent = step;
      return li;
    }));
    container.append(steps);
  }
}

function makePrimaryMethod(method) {
  const card = document.createElement("article");
  card.className = "method-card recommended";

  const top = document.createElement("div");
  top.className = "method-top";
  const rank = document.createElement("span");
  rank.className = "method-rank";
  rank.textContent = "1";
  const recommended = document.createElement("span");
  recommended.className = "recommended-label";
  recommended.textContent = "今日はこれ";
  top.append(rank, recommended);
  if (method.badge) {
    const badge = document.createElement("span");
    badge.className = "method-badge";
    badge.textContent = method.badge;
    top.append(badge);
  }

  const title = document.createElement("h3");
  title.textContent = method.title || "候補";
  card.append(top, title);
  appendMethodBody(card, method, false);

  const completeButton = document.createElement("button");
  completeButton.type = "button";
  completeButton.className = "complete-button";
  completeButton.dataset.completeCurrent = "1";
  completeButton.textContent = "✓ 完了！";
  card.append(completeButton);
  return card;
}

function makeAlternativeMethod(method, index) {
  const details = document.createElement("details");
  details.className = "method-alternative";

  const summary = document.createElement("summary");
  const rank = document.createElement("span");
  rank.className = "method-rank small";
  rank.textContent = String(method.rank || index + 1);
  const text = document.createElement("span");
  text.className = "alternative-title";
  text.textContent = method.title || "代替案";
  const minutes = document.createElement("span");
  minutes.className = "alternative-minutes";
  minutes.textContent = method.minutes ? `約${method.minutes}分` : "";
  summary.append(rank, text, minutes);
  details.append(summary);

  const body = document.createElement("div");
  body.className = "alternative-body";
  if (method.badge) {
    const badge = document.createElement("p");
    badge.className = "method-badge";
    badge.textContent = method.badge;
    body.append(badge);
  }
  appendMethodBody(body, method, true);
  if (method.steps?.length) {
    const steps = document.createElement("ol");
    steps.className = "method-steps";
    steps.replaceChildren(...method.steps.map(step => {
      const li = document.createElement("li");
      li.textContent = step;
      return li;
    }));
    body.append(steps);
  }
  details.append(body);
  return details;
}

function makeSessionCompleteCard(plan) {
  const card = document.createElement("article");
  card.className = "session-complete-card";
  const mark = document.createElement("div");
  mark.className = "session-complete-mark";
  mark.textContent = "✓";
  const title = document.createElement("h3");
  title.textContent = "今日はここで終了";
  const text = document.createElement("p");
  text.textContent = plan.notice || "今日の予定分は完了。";
  card.append(mark, title, text);
  if (plan.deferred_task) {
    const next = document.createElement("p");
    next.className = "muted";
    next.textContent = `次回候補：${plan.deferred_task.title}`;
    card.append(next);
  }
  return card;
}

function startTaskTimer(method) {
  if (!method) return;
  const key = method.task_key || method.title;
  if (state.activeTaskKey === key && state.activeTaskStartedAt) return;
  state.activeTaskKey = key;
  state.activeTaskStartedAt = Date.now();
}

function renderPlan(plan, { startTimer = false } = {}) {
  state.plan = plan;
  if (!plan) return;

  $("emptyState").classList.add("hidden");
  $("planContent").classList.remove("hidden");
  $("planKind").textContent = plan.planner_kind || "PLAN";
  $("planNotice").textContent = plan.notice || "";

  const focus = plan.focus_job;
  $("focusJob").textContent = focus ? `${focus.name} Lv${focus.level}` : "現在の育成候補";
  renderSessionMeta();

  if (plan.session_complete) {
    state.currentMethod = null;
    state.activeTaskKey = null;
    state.activeTaskStartedAt = null;
    $("methodList").replaceChildren(makeSessionCompleteCard(plan));
    $("nextTask").textContent = "今日は追加しなくてOK";
    $("fallbackTask").textContent = "ゲームを閉じてもOK";
    $("skipList").replaceChildren(...(plan.skip_today || []).map(item => {
      const li = document.createElement("li");
      li.textContent = item;
      return li;
    }));
    return;
  }

  const methods = Array.isArray(plan.methods) && plan.methods.length
    ? plan.methods.slice(0, 3)
    : [plan.now ? { rank: 1, ...plan.now } : null].filter(Boolean);

  state.currentMethod = methods[0] || null;
  const nodes = [];
  if (methods[0]) nodes.push(makePrimaryMethod(methods[0]));
  methods.slice(1).forEach((method, index) => nodes.push(makeAlternativeMethod(method, index + 1)));
  $("methodList").replaceChildren(...nodes);

  $("nextTask").textContent = plan.next
    ? `${plan.next.title}（約${plan.next.minutes}分）`
    : "#1だけで終了してOK";
  $("fallbackTask").textContent = plan.fallback?.title || "Lodestone同期だけして終了";
  $("skipList").replaceChildren(...(plan.skip_today || []).map(item => {
    const li = document.createElement("li");
    li.textContent = item;
    return li;
  }));

  if (startTimer && state.currentMethod) startTaskTimer(state.currentMethod);
}

function setActive() {
  document.querySelectorAll("#timeChoices button").forEach(button => {
    button.classList.toggle("active", Number(button.dataset.minutes) === state.minutes);
  });
  document.querySelectorAll("#energyChoices button").forEach(button => {
    button.classList.toggle("active", Number(button.dataset.energy) === state.energy);
  });
}

async function loadSavedState() {
  try {
    const [characterData, achievementData, activityData] = await Promise.all([
      api(stateQuery()),
      api("/api/achievements"),
      api("/api/activity/today")
    ]);
    if (characterData.character) renderCharacter(characterData.character);
    if (characterData.preferences) {
      state.minutes = Number(characterData.preferences.available_minutes) || 60;
      state.energy = Number(characterData.preferences.energy) || 2;
      setActive();
    }
    if (characterData.plan) renderPlan(characterData.plan);
    if (achievementData.achievements) renderAchievements(achievementData.achievements);
    state.todayCompletedCount = Number(activityData.count || 0);
    renderSessionMeta();
  } catch (error) {
    setStatus(`保存済みデータの読込失敗: ${error.message}`, true);
  }
}

async function syncEverything(force = false) {
  const button = $("syncButton");
  button.disabled = true;
  button.textContent = "同期中…";
  $("achievementSyncText").textContent = "Lodestone実績を同期中…";
  setStatus("Lodestoneを同期しています。");

  try {
    const [characterData, achievementData] = await Promise.all([
      api("/api/sync", { method: "POST", body: JSON.stringify({}) }),
      api(`/api/achievements/sync${force ? "?force=1" : ""}`, { method: "POST", body: JSON.stringify({}) })
    ]);
    renderCharacter(characterData.character);
    renderAchievements(achievementData.achievements);
    setStatus(`Lodestone同期完了。アチーブメント ${Number(achievementData.achievements.total_achievements).toLocaleString("ja-JP")}件を取得しました。`);
  } catch (error) {
    $("achievementSyncText").textContent = "同期失敗";
    setStatus(`Lodestone同期失敗: ${error.message}`, true);
  } finally {
    button.disabled = false;
    button.textContent = "Lodestone再同期";
  }
}

async function generatePlan({ silent = false, resetSession = false, startTimer = true } = {}) {
  if (!state.character) return;
  ensureDailyDateCurrent();
  if (resetSession || !state.session) beginSession();

  const button = $("planButton");
  button.disabled = true;
  if (!silent) button.textContent = "絞っています…";
  if (!silent) setStatus("");

  try {
    const availableMinutes = Math.max(0, Math.round(state.session?.remainingMinutes ?? state.minutes));
    const data = await api("/api/plan", {
      method: "POST",
      body: JSON.stringify({
        lodestone_id: "3091607",
        available_minutes: availableMinutes,
        energy: state.energy,
        completed_daily: state.dailyCompletion
      })
    });
    renderPlan(data.plan, { startTimer });
    if (!silent) setStatus("#1をそのまま実行。終わったら「✓ 完了！」だけ押せば次へ進みます。");
  } catch (error) {
    setStatus(`プラン生成失敗: ${error.message}`, true);
  } finally {
    button.disabled = false;
    button.textContent = "今日やることを決める / やり直す";
  }
}

async function handleDailyChecklistChange() {
  ensureDailyDateCurrent();
  state.dailyCompletion = {
    leveling: $("dailyLeveling").checked,
    alliance: $("dailyAlliance").checked
  };
  saveDailyCompletion();
  renderDailyChecklist();
  if (state.character) {
    await generatePlan({ silent: true, startTimer: true });
    setStatus("日課チェックを更新しました。おすすめ順位を入れ替えました。");
  }
}

function measuredActualMinutes() {
  if (!state.activeTaskStartedAt) return null;
  const elapsed = Math.round((Date.now() - state.activeTaskStartedAt) / 60000);
  if (!Number.isFinite(elapsed) || elapsed < 1 || elapsed > 480) return null;
  return elapsed;
}

async function handleCompleteCurrent() {
  ensureDailyDateCurrent();
  const method = state.currentMethod;
  if (!method) return;

  const button = $("methodList").querySelector("[data-complete-current]");
  if (button) {
    button.disabled = true;
    button.textContent = "記録中…";
  }

  const actualMinutes = measuredActualMinutes();
  const plannedMinutes = Math.max(1, Number(method.minutes) || 15);
  const focus = state.plan?.focus_job || {};
  const completionId = crypto.randomUUID().replace(/-/g, "_");

  try {
    await api("/api/activity/complete", {
      method: "POST",
      body: JSON.stringify({
        completion_id: completionId,
        task_key: method.task_key || `todo:${Date.now()}`,
        task_title: method.title || "TODO",
        daily_key: method.daily_key || null,
        job_code: focus.code || null,
        job_level: focus.level || null,
        planned_minutes: plannedMinutes,
        actual_minutes: actualMinutes
      })
    });

    state.todayCompletedCount += 1;
    if (method.daily_key && Object.hasOwn(state.dailyCompletion, method.daily_key)) {
      state.dailyCompletion[method.daily_key] = true;
      saveDailyCompletion();
      renderDailyChecklist();
    }

    if (!state.session) beginSession();
    const consumed = actualMinutes && actualMinutes >= 5 && actualMinutes <= 180
      ? actualMinutes
      : plannedMinutes;
    state.session.remainingMinutes = Math.max(0, state.session.remainingMinutes - consumed);
    saveSession();
    renderSessionMeta();

    state.activeTaskKey = null;
    state.activeTaskStartedAt = null;
    await generatePlan({ silent: true, startTimer: true });

    const actualText = actualMinutes ? `（経過 約${actualMinutes}分）` : "";
    const remaining = Math.max(0, Math.round(state.session.remainingMinutes));
    setStatus(`✓ 「${method.title}」完了 ${actualText}。残り約${remaining}分に合わせて次を更新しました。`);
  } catch (error) {
    setStatus(`完了記録失敗: ${error.message}`, true);
    if (button) {
      button.disabled = false;
      button.textContent = "✓ 完了！";
    }
  }
}

$("timeChoices").addEventListener("click", event => {
  const button = event.target.closest("button[data-minutes]");
  if (!button) return;
  state.minutes = Number(button.dataset.minutes);
  setActive();
});

$("energyChoices").addEventListener("click", event => {
  const button = event.target.closest("button[data-energy]");
  if (!button) return;
  state.energy = Number(button.dataset.energy);
  setActive();
});

$("dailyLeveling").addEventListener("change", handleDailyChecklistChange);
$("dailyAlliance").addEventListener("change", handleDailyChecklistChange);
$("syncButton").addEventListener("click", () => syncEverything(true));
$("planButton").addEventListener("click", () => generatePlan({ resetSession: true, startTimer: true }));
$("methodList").addEventListener("click", event => {
  if (event.target.closest("[data-complete-current]")) void handleCompleteCurrent();
});

window.addEventListener("focus", async () => {
  if (ensureDailyDateCurrent() && state.character) {
    const activityData = await api("/api/activity/today");
    state.todayCompletedCount = Number(activityData.count || 0);
    await generatePlan({ silent: true, startTimer: false });
    setStatus("日付が変わったので、今日の日課とプレイ枠をリセットしました。");
  }
});

setActive();
renderDailyChecklist();
renderSessionMeta();
void (async function boot() {
  await loadSavedState();
  await syncEverything(false);
  if (state.character && state.session) await generatePlan({ silent: true, startTimer: false });
})();

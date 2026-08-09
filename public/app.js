const PROFILE_TOKEN_KEY = "ff14_today_profile_token_v1";
const DAILY_CHECKLIST_PREFIX = "ff14_today_daily_checklist_";

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

function loadDailyCompletion(dateKey = japanDateKey()) {
  try {
    const raw = localStorage.getItem(dailyStorageKey(dateKey));
    const parsed = raw ? JSON.parse(raw) : {};
    return {
      leveling: Boolean(parsed.leveling),
      alliance: Boolean(parsed.alliance)
    };
  } catch {
    return { leveling: false, alliance: false };
  }
}

const state = {
  minutes: 60,
  energy: 2,
  character: null,
  achievements: null,
  plan: null,
  profileToken: getOrCreateProfileToken(),
  dailyDate: japanDateKey(),
  dailyCompletion: loadDailyCompletion()
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
    $("dailyCheckStatus").textContent = "終わったらチェック。おすすめ順位がすぐ変わります。";
  } else if (done === 1) {
    $("dailyCheckStatus").textContent = "1つ消化済み。残っている日課を優先して並べ替えます。";
  } else {
    $("dailyCheckStatus").textContent = "日課2つ完了。反復できる具体案を#1に切り替えます。";
  }
}

function saveDailyCompletion() {
  localStorage.setItem(dailyStorageKey(state.dailyDate), JSON.stringify(state.dailyCompletion));
}

function ensureDailyDateCurrent() {
  const today = japanDateKey();
  if (today === state.dailyDate) return false;
  state.dailyDate = today;
  state.dailyCompletion = loadDailyCompletion(today);
  renderDailyChecklist();
  return true;
}

function stateQuery() {
  const params = new URLSearchParams({ lodestone_id: "3091607" });
  if (state.dailyCompletion.leveling) params.set("completed_leveling", "1");
  if (state.dailyCompletion.alliance) params.set("completed_alliance", "1");
  return `/api/state?${params.toString()}`;
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
  if (method.badge) {
    const badge = document.createElement("span");
    badge.className = "method-badge";
    badge.textContent = method.badge;
    top.append(rank, recommended, badge);
  } else {
    top.append(rank, recommended);
  }

  const title = document.createElement("h3");
  title.textContent = method.title || "候補";
  card.append(top, title);
  appendMethodBody(card, method, false);
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

function renderPlan(plan) {
  state.plan = plan;
  if (!plan) return;

  $("emptyState").classList.add("hidden");
  $("planContent").classList.remove("hidden");
  $("planKind").textContent = plan.planner_kind || "PLAN";
  $("planNotice").textContent = plan.notice || "";

  const focus = plan.focus_job;
  $("focusJob").textContent = focus ? `${focus.name} Lv${focus.level}` : "現在の育成候補";

  const methods = Array.isArray(plan.methods) && plan.methods.length
    ? plan.methods.slice(0, 3)
    : [plan.now ? { rank: 1, ...plan.now } : null].filter(Boolean);

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
    const [characterData, achievementData] = await Promise.all([
      api(stateQuery()),
      api("/api/achievements")
    ]);
    if (characterData.character) renderCharacter(characterData.character);
    if (characterData.preferences) {
      state.minutes = Number(characterData.preferences.available_minutes) || 60;
      state.energy = Number(characterData.preferences.energy) || 2;
      setActive();
    }
    if (characterData.plan) renderPlan(characterData.plan);
    if (achievementData.achievements) renderAchievements(achievementData.achievements);
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

async function generatePlan({ silent = false } = {}) {
  if (!state.character) return;
  ensureDailyDateCurrent();
  const button = $("planButton");
  button.disabled = true;
  if (!silent) button.textContent = "絞っています…";
  if (!silent) setStatus("");

  try {
    const data = await api("/api/plan", {
      method: "POST",
      body: JSON.stringify({
        lodestone_id: "3091607",
        available_minutes: state.minutes,
        energy: state.energy,
        completed_daily: state.dailyCompletion
      })
    });
    renderPlan(data.plan);
    if (!silent) setStatus("#1をそのまま実行。日課が終わったらチェックするだけで次へ切り替わります。");
  } catch (error) {
    setStatus(`プラン生成失敗: ${error.message}`, true);
  } finally {
    button.disabled = false;
    button.textContent = "今日やることを決める";
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
    await generatePlan({ silent: true });
    setStatus("日課チェックを更新しました。おすすめ順位を入れ替えました。");
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
$("planButton").addEventListener("click", () => generatePlan());

window.addEventListener("focus", async () => {
  if (ensureDailyDateCurrent() && state.character) {
    await generatePlan({ silent: true });
    setStatus("日付が変わったので、今日の日課チェックをリセットしました。");
  }
});

setActive();
renderDailyChecklist();
void (async function boot() {
  await loadSavedState();
  await syncEverything(false);
  if (state.character) await generatePlan({ silent: true });
})();

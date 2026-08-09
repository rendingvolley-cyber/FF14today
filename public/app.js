const PROFILE_TOKEN_KEY = "ff14_today_profile_token_v1";

const state = {
  minutes: 60,
  energy: 2,
  character: null,
  achievements: null,
  plan: null,
  profileToken: getOrCreateProfileToken()
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

function renderPlan(plan) {
  state.plan = plan;
  if (!plan) return;
  $("emptyState").classList.add("hidden");
  $("planContent").classList.remove("hidden");
  $("planKind").textContent = plan.planner_kind || "PLAN";
  $("planNotice").textContent = plan.notice || "";
  $("nowTitle").textContent = plan.now?.title || "";
  $("nowMinutes").textContent = plan.now?.minutes ? `約 ${plan.now.minutes}分` : "";
  $("nowReason").textContent = plan.now?.reason || "";
  $("nowSteps").replaceChildren(...(plan.now?.steps || []).map(step => {
    const li = document.createElement("li");
    li.textContent = step;
    return li;
  }));
  $("nextTask").textContent = plan.next
    ? `${plan.next.title}（約${plan.next.minutes}分）`
    : "今日は追加しなくてOK";
  $("fallbackTask").textContent = plan.fallback?.title || "同期だけして終了";
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
      api("/api/state?lodestone_id=3091607"),
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
  setStatus("Lodestoneを同期しています。初回の実績同期は21ページ前後読むので少し待ちます。");

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

$("syncButton").addEventListener("click", () => syncEverything(true));

$("planButton").addEventListener("click", async () => {
  if (!state.character) return;
  const button = $("planButton");
  button.disabled = true;
  button.textContent = "決めています…";
  setStatus("");
  try {
    const data = await api("/api/plan", {
      method: "POST",
      body: JSON.stringify({
        lodestone_id: "3091607",
        available_minutes: state.minutes,
        energy: state.energy
      })
    });
    renderPlan(data.plan);
    setStatus("今日の暫定プランを更新しました。次の版で未達実績も候補に入れます。");
  } catch (error) {
    setStatus(`プラン生成失敗: ${error.message}`, true);
  } finally {
    button.disabled = false;
    button.textContent = "今日やることを決める";
  }
});

setActive();
void (async function boot() {
  await loadSavedState();
  await syncEverything(false);
})();

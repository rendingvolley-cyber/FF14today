const state = {
  minutes: 60,
  energy: 2,
  character: null,
  plan: null,
  lodestoneUrl: localStorage.getItem("ff14_today_lodestone_url") || ""
};

const $ = id => document.getElementById(id);

function parseLodestoneId(value) {
  try {
    const url = new URL(value);
    const match = url.pathname.match(/\/lodestone\/character\/(\d+)\//);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

function setStatus(message, error = false) {
  $("statusMessage").textContent = message || "";
  $("statusMessage").classList.toggle("error", error);
}

function formatSync(iso) {
  if (!iso) return "未同期";
  return `最終同期 ${new Date(iso).toLocaleString("ja-JP", { hour12:false })}`;
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
  const unlocked = jobs.filter(j => j.level !== null);
  const capped = unlocked.filter(j => j.level >= 100);
  $("jobsSummary").textContent = `${unlocked.length} Job解放 / Lv100 ${capped.length}`;
  $("jobsGrid").innerHTML = jobs.map(j => `
    <div class="job ${j.level === null ? "locked" : ""}">
      <div class="code">${j.code} · ${j.name_ja}</div>
      <div class="level">${j.level === null ? "—" : `Lv ${j.level}`}</div>
    </div>
  `).join("");

  $("planKind").textContent = "READY";
  $("emptyState").querySelector(".big").textContent = "今日はどれくらい遊べる？";
  $("emptyState").querySelector("p:last-child").textContent =
    "時間と気力を選んだら、やることはこちらで絞ります。";
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
  $("nowSteps").innerHTML = (plan.now?.steps || []).map(x => `<li>${x}</li>`).join("");
  $("nextTask").textContent = plan.next
    ? `${plan.next.title}（約${plan.next.minutes}分）`
    : "今日は追加しなくてOK";
  $("fallbackTask").textContent = plan.fallback?.title || "同期だけして終了";
  $("skipList").innerHTML = (plan.skip_today || []).map(x => `<li>${x}</li>`).join("");
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: { "content-type": "application/json", ...(options.headers || {}) }
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || data.detail || `HTTP ${response.status}`);
  return data;
}

function setActive() {
  document.querySelectorAll("#timeChoices button").forEach(btn => {
    btn.classList.toggle("active", Number(btn.dataset.minutes) === state.minutes);
  });
  document.querySelectorAll("#energyChoices button").forEach(btn => {
    btn.classList.toggle("active", Number(btn.dataset.energy) === state.energy);
  });
}

async function loadSavedCharacter() {
  if (!state.lodestoneUrl) return;
  $("lodestoneInput").value = state.lodestoneUrl;
  const id = parseLodestoneId(state.lodestoneUrl);
  if (!id) return;
  try {
    const data = await api(`/api/state?lodestone_id=${encodeURIComponent(id)}`);
    if (data.character) {
      renderCharacter(data.character);
      if (data.preferences) {
        state.minutes = Number(data.preferences.available_minutes) || 60;
        state.energy = Number(data.preferences.energy) || 2;
        setActive();
      }
      if (data.plan) renderPlan(data.plan);
    }
  } catch (error) {
    setStatus(`保存済みキャラの読込失敗: ${error.message}`, true);
  }
}

$("timeChoices").addEventListener("click", e => {
  const button = e.target.closest("button[data-minutes]");
  if (!button) return;
  state.minutes = Number(button.dataset.minutes);
  setActive();
});

$("energyChoices").addEventListener("click", e => {
  const button = e.target.closest("button[data-energy]");
  if (!button) return;
  state.energy = Number(button.dataset.energy);
  setActive();
});

$("lodestoneForm").addEventListener("submit", async e => {
  e.preventDefault();
  const url = $("lodestoneInput").value.trim();
  if (!parseLodestoneId(url)) {
    setStatus("LodestoneのキャラクターページURLを貼ってください。", true);
    return;
  }

  const button = $("syncButton");
  button.disabled = true;
  button.textContent = "読込中…";
  setStatus("Lodestoneを確認しています。");

  try {
    const data = await api("/api/sync", {
      method:"POST",
      body:JSON.stringify({ lodestone_url:url })
    });
    state.lodestoneUrl = data.character.lodestone_url;
    localStorage.setItem("ff14_today_lodestone_url", state.lodestoneUrl);
    $("lodestoneInput").value = state.lodestoneUrl;
    renderCharacter(data.character);

    const data2 = await api(`/api/state?lodestone_id=${encodeURIComponent(data.character.lodestone_id)}`);
    if (data2.preferences) {
      state.minutes = Number(data2.preferences.available_minutes) || 60;
      state.energy = Number(data2.preferences.energy) || 2;
      setActive();
    }
    if (data2.plan) renderPlan(data2.plan);
    setStatus("キャラクターを読み込みました。");
  } catch (error) {
    setStatus(`読込失敗: ${error.message}`, true);
  } finally {
    button.disabled = false;
    button.textContent = "読み込む";
  }
});

$("planButton").addEventListener("click", async () => {
  if (!state.character) return;
  const button = $("planButton");
  button.disabled = true;
  button.textContent = "決めています…";
  setStatus("");
  try {
    const data = await api("/api/plan", {
      method:"POST",
      body:JSON.stringify({
        lodestone_id: state.character.lodestone_id,
        available_minutes: state.minutes,
        energy: state.energy
      })
    });
    renderPlan(data.plan);
    setStatus("今日の暫定プランを更新しました。");
  } catch (error) {
    setStatus(`プラン生成失敗: ${error.message}`, true);
  } finally {
    button.disabled = false;
    button.textContent = "今日やることを決める";
  }
});

if (state.lodestoneUrl) $("lodestoneInput").value = state.lodestoneUrl;
loadSavedCharacter();

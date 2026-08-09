const PROFILE_TOKEN_KEY = "ff14_today_profile_token_v1";
const LODESTONE_URL_KEY = "ff14_today_lodestone_url";
const AI_ACCESS_CODE_KEY = "ff14_today_ai_access_code";

const state = {
  minutes: 60,
  energy: 2,
  character: null,
  plan: null,
  progressSummary: null,
  lodestoneUrl: localStorage.getItem(LODESTONE_URL_KEY) || "",
  profileToken: getOrCreateProfileToken(),
  selectedFile: null,
  activeImport: null
};

const $ = id => document.getElementById(id);

function getOrCreateProfileToken() {
  let token = localStorage.getItem(PROFILE_TOKEN_KEY);
  if (token && /^[A-Za-z0-9_-]{43,128}$/.test(token)) return token;
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let binary = "";
  bytes.forEach(b => { binary += String.fromCharCode(b); });
  token = btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  localStorage.setItem(PROFILE_TOKEN_KEY, token);
  return token;
}

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
  ["identity", "planner", "evidencePanel", "nowPanel", "jobsPanel"].forEach(id => {
    $(id).classList.toggle("hidden", !show);
  });
}

function renderCharacter(character) {
  state.character = character;
  showCharacterUI(Boolean(character));
  if (!character) return;
  $("characterName").textContent = character.name;
  $("characterWorld").textContent = character.data_center ? `${character.world} [${character.data_center}]` : character.world;
  $("syncDot").classList.add("ok");
  $("syncText").textContent = formatSync(character.synced_at);

  const jobs = character.jobs || [];
  const unlocked = jobs.filter(j => j.level !== null);
  const capped = unlocked.filter(j => j.level >= 100);
  $("jobsSummary").textContent = `${unlocked.length} Job解放 / Lv100 ${capped.length}`;

  $("jobsGrid").replaceChildren(...jobs.map(j => {
    const card = document.createElement("div");
    card.className = `job ${j.level === null ? "locked" : ""}`;
    const code = document.createElement("div");
    code.className = "code";
    code.textContent = `${j.code} · ${j.name_ja}`;
    const level = document.createElement("div");
    level.className = "level";
    level.textContent = j.level === null ? "—" : `Lv ${j.level}`;
    card.append(code, level);
    return card;
  }));

  $("planKind").textContent = "READY";
}

function renderProgressSummary(summary) {
  state.progressSummary = summary;
  if (!summary) return;
  $("factCount").textContent = `実績 ${summary.achievement_facts || 0}件`;
  const request = summary.evidence_request;
  if (!request) return;
  $("evidenceTitle").textContent = request.title || "実績画面";
  $("evidenceReason").textContent = request.reason || "";
  $("evidenceSteps").replaceChildren(...(request.instructions || []).map(step => {
    const li = document.createElement("li");
    li.textContent = step;
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
  $("nextTask").textContent = plan.next ? `${plan.next.title}（約${plan.next.minutes}分）` : "今日は追加しなくてOK";
  $("fallbackTask").textContent = plan.fallback?.title || "同期だけして終了";
  $("skipList").replaceChildren(...(plan.skip_today || []).map(item => {
    const li = document.createElement("li");
    li.textContent = item;
    return li;
  }));
}

async function api(path, options = {}) {
  const headers = { "x-profile-token": state.profileToken, ...(options.headers || {}) };
  if (!(options.body instanceof FormData) && options.body !== undefined) headers["content-type"] = "application/json";
  const response = await fetch(path, { ...options, headers });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || data.detail || `HTTP ${response.status}`);
  return data;
}

function setActive() {
  document.querySelectorAll("#timeChoices button").forEach(btn => btn.classList.toggle("active", Number(btn.dataset.minutes) === state.minutes));
  document.querySelectorAll("#energyChoices button").forEach(btn => btn.classList.toggle("active", Number(btn.dataset.energy) === state.energy));
}

async function loadCharacterState(lodestoneId) {
  const data = await api(`/api/state?lodestone_id=${encodeURIComponent(lodestoneId)}`);
  if (data.character) renderCharacter(data.character);
  if (data.preferences) {
    state.minutes = Number(data.preferences.available_minutes) || 60;
    state.energy = Number(data.preferences.energy) || 2;
    setActive();
  }
  if (data.progress_summary) renderProgressSummary(data.progress_summary);
  if (data.plan) renderPlan(data.plan);
  return data;
}

async function loadSavedCharacter() {
  if (!state.lodestoneUrl) return;
  $("lodestoneInput").value = state.lodestoneUrl;
  const id = parseLodestoneId(state.lodestoneUrl);
  if (!id) return;
  try { await loadCharacterState(id); }
  catch (error) { setStatus(`保存済みキャラの読込失敗: ${error.message}`, true); }
}

function setSelectedFile(file) {
  state.selectedFile = file || null;
  if (!file) {
    $("selectedFile").textContent = "SS未選択";
    $("analyzeButton").disabled = true;
    return;
  }
  const mb = (file.size / 1024 / 1024).toFixed(2);
  $("selectedFile").textContent = `${file.name} · ${mb} MB`;
  $("analyzeButton").disabled = !state.character;
}

function confidenceLabel(value) {
  const pct = Math.round(Number(value || 0) * 100);
  if (pct >= 90) return { text: `${pct}% · 高`, cls: "high" };
  if (pct >= 70) return { text: `${pct}% · 確認`, cls: "mid" };
  return { text: `${pct}% · 要確認`, cls: "low" };
}

function formatProgress(candidate) {
  if (Number.isInteger(candidate.current_value) && Number.isInteger(candidate.target_value)) return `${candidate.current_value} / ${candidate.target_value}`;
  if (candidate.completed === true) return "達成済み";
  if (candidate.completed === false) return "未達";
  return candidate.visible_progress_text || "数値なし";
}

function renderImportPreview(result) {
  state.activeImport = result;
  $("importPreview").classList.remove("hidden");
  const metaParts = [];
  if (result.category) metaParts.push(result.category);
  metaParts.push(result.model_id || "Gemini");
  if (result.duplicate) metaParts.push("同じSSを再利用");
  $("importMeta").textContent = metaParts.join(" · ");

  const fragment = document.createDocumentFragment();
  (result.candidates || []).forEach(candidate => {
    const row = document.createElement("label");
    row.className = "candidate-row";
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.value = candidate.candidate_id;
    checkbox.checked = candidate.decision === "accepted" || (candidate.decision === "pending" && Number(candidate.confidence) >= 0.9);
    checkbox.disabled = result.status === "confirmed";
    const body = document.createElement("span");
    body.className = "candidate-body";
    const top = document.createElement("span");
    top.className = "candidate-top";
    const name = document.createElement("strong");
    name.textContent = candidate.achievement_name;
    const confidence = confidenceLabel(candidate.confidence);
    const badge = document.createElement("span");
    badge.className = `confidence ${confidence.cls}`;
    badge.textContent = confidence.text;
    top.append(name, badge);
    const progress = document.createElement("span");
    progress.className = "candidate-progress";
    progress.textContent = formatProgress(candidate);
    body.append(top, progress);
    row.append(checkbox, body);
    fragment.append(row);
  });
  $("candidateList").replaceChildren(fragment);
  updatePreviewSummary();
  if (result.status === "confirmed") {
    $("confirmImportButton").disabled = true;
    $("confirmImportButton").textContent = "インポート済み";
  } else {
    $("confirmImportButton").disabled = false;
    $("confirmImportButton").textContent = "選択した実績をインポート";
  }
}

function updatePreviewSummary() {
  const boxes = [...$("candidateList").querySelectorAll('input[type="checkbox"]')];
  const checked = boxes.filter(box => box.checked).length;
  $("previewSummary").textContent = `${checked} / ${boxes.length}件を登録`;
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

$("lodestoneForm").addEventListener("submit", async event => {
  event.preventDefault();
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
    const data = await api("/api/sync", { method: "POST", body: JSON.stringify({ lodestone_url: url }) });
    state.lodestoneUrl = data.character.lodestone_url;
    localStorage.setItem(LODESTONE_URL_KEY, state.lodestoneUrl);
    $("lodestoneInput").value = state.lodestoneUrl;
    renderCharacter(data.character);
    if (data.progress_summary) renderProgressSummary(data.progress_summary);
    await loadCharacterState(data.character.lodestone_id);
    setStatus(data.cached ? "キャラクターを読み込みました（最近の同期データを再利用）。" : "Lodestone同期完了。");
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
      method: "POST",
      body: JSON.stringify({ lodestone_id: state.character.lodestone_id, available_minutes: state.minutes, energy: state.energy })
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

$("achievementImage").addEventListener("change", event => setSelectedFile(event.target.files?.[0] || null));
["dragenter", "dragover"].forEach(type => $("dropZone").addEventListener(type, event => {
  event.preventDefault();
  $("dropZone").classList.add("dragging");
}));
["dragleave", "drop"].forEach(type => $("dropZone").addEventListener(type, event => {
  event.preventDefault();
  $("dropZone").classList.remove("dragging");
}));
$("dropZone").addEventListener("drop", event => {
  const file = event.dataTransfer?.files?.[0];
  if (file) setSelectedFile(file);
});

$("aiAccessCode").value = localStorage.getItem(AI_ACCESS_CODE_KEY) || "";
$("aiAccessCode").addEventListener("change", () => {
  const value = $("aiAccessCode").value.trim();
  if (value) localStorage.setItem(AI_ACCESS_CODE_KEY, value);
  else localStorage.removeItem(AI_ACCESS_CODE_KEY);
});

$("analyzeButton").addEventListener("click", async () => {
  if (!state.character || !state.selectedFile) return;
  const accessCode = $("aiAccessCode").value.trim();
  if (!accessCode) {
    setStatus("SS解析には共有AIアクセスコードが必要です。", true);
    $("aiAccessCode").focus();
    return;
  }
  const button = $("analyzeButton");
  button.disabled = true;
  button.textContent = "解析中…";
  setStatus("SSをGeminiで読み取っています。画像本体はD1へ保存しません。");
  const form = new FormData();
  form.append("lodestone_id", state.character.lodestone_id);
  form.append("image", state.selectedFile, state.selectedFile.name);
  try {
    const data = await api("/api/achievement-import/analyze", {
      method: "POST",
      headers: { "x-ai-access-code": accessCode },
      body: form
    });
    renderImportPreview(data);
    setStatus(data.duplicate ? "同じSSの解析結果を再利用しました。" : `${data.candidates.length}件を読み取りました。確認してインポートしてください。`);
    $("importPreview").scrollIntoView({ behavior: "smooth", block: "nearest" });
  } catch (error) {
    setStatus(`SS解析失敗: ${error.message}`, true);
  } finally {
    button.disabled = false;
    button.textContent = "SSを解析する";
  }
});

$("candidateList").addEventListener("change", event => {
  if (event.target.matches('input[type="checkbox"]')) updatePreviewSummary();
});

$("confirmImportButton").addEventListener("click", async () => {
  if (!state.activeImport || state.activeImport.status === "confirmed") return;
  const accepted = [...$("candidateList").querySelectorAll('input[type="checkbox"]:checked')].map(box => box.value);
  const button = $("confirmImportButton");
  button.disabled = true;
  button.textContent = "保存中…";
  try {
    const data = await api("/api/achievement-import/confirm", {
      method: "POST",
      body: JSON.stringify({ import_id: state.activeImport.import_id, accepted_candidate_ids: accepted })
    });
    renderProgressSummary(data.progress_summary);
    state.activeImport.status = "confirmed";
    button.textContent = `${data.accepted_count}件インポート済み`;
    setStatus(`実績進捗を${data.accepted_count}件保存しました。`);
  } catch (error) {
    button.disabled = false;
    button.textContent = "選択した実績をインポート";
    setStatus(`インポート失敗: ${error.message}`, true);
  }
});

if (state.lodestoneUrl) $("lodestoneInput").value = state.lodestoneUrl;
setActive();
loadSavedCharacter();

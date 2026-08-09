const PROFILE_TOKEN_KEY = "ff14_today_profile_token_v1";
const $ = id => document.getElementById(id);

function profileToken() {
  let token = localStorage.getItem(PROFILE_TOKEN_KEY);
  if (token && /^[A-Za-z0-9_-]{43,128}$/.test(token)) return token;
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let binary = "";
  bytes.forEach(byte => { binary += String.fromCharCode(byte); });
  token = btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  localStorage.setItem(PROFILE_TOKEN_KEY, token);
  return token;
}

function setInboxState(message, kind = "idle") {
  const status = $("contextInboxStatus");
  if (!status) return;
  status.textContent = message;
  status.dataset.kind = kind;
}

function statSummary(analysis) {
  if (analysis.page_type === "crafter_stats" && analysis.crafter_stats) {
    const s = analysis.crafter_stats;
    return `製作ステータスを取得：作業精度 ${s.craftsmanship ?? "—"} / 加工精度 ${s.control ?? "—"} / CP ${s.cp ?? "—"}`;
  }
  if (analysis.page_type === "gatherer_stats" && analysis.gatherer_stats) {
    const s = analysis.gatherer_stats;
    return `採集ステータスを取得：獲得力 ${s.gathering ?? "—"} / 技術力 ${s.perception ?? "—"} / GP ${s.gp ?? "—"}`;
  }
  if (analysis.page_type === "journal") {
    const entries = analysis.journal_entries || [];
    const first = entries[0]?.title ? `「${entries[0].title}」など` : "";
    return `ジャーナルから ${entries.length}件 ${first}を判断材料に追加しました。`;
  }
  return "この画像はジャーナル/製作ステータス/採集ステータスとして確定できませんでした。";
}

function renderSavedContext(context) {
  const list = $("contextInboxSaved");
  if (!list) return;
  const chips = [];
  const journal = context?.journal;
  if (journal?.journal_entries?.length) {
    chips.push(`ジャーナル ${journal.journal_entries.length}件`);
  }
  const crafter = context?.crafter_stats?.crafter_stats;
  if (crafter) {
    chips.push(`製作：作業${crafter.craftsmanship ?? "—"} / 加工${crafter.control ?? "—"} / CP${crafter.cp ?? "—"}`);
  }
  const gatherer = context?.gatherer_stats?.gatherer_stats;
  if (gatherer) {
    chips.push(`採集：獲得${gatherer.gathering ?? "—"} / 技術${gatherer.perception ?? "—"} / GP${gatherer.gp ?? "—"}`);
  }
  list.replaceChildren(...chips.map(label => {
    const span = document.createElement("span");
    span.className = "context-chip";
    span.textContent = label;
    return span;
  }));
}

async function loadSavedContext() {
  try {
    const response = await fetch("/api/context", {
      headers: { "x-profile-token": profileToken() }
    });
    if (!response.ok) return;
    const data = await response.json();
    renderSavedContext(data.context || {});
  } catch {}
}

async function refreshPlanWithoutResettingSession() {
  const active = document.querySelector("#modeChoices button[data-mode].active");
  if (active) active.click();
}

async function uploadImage(file) {
  if (!file || !file.type.startsWith("image/")) return;
  if (file.size > 8 * 1024 * 1024) {
    setInboxState("画像が8MBを超えています。", "error");
    return;
  }
  setInboxState("画像を解析中… ジャーナルか装備ステータスかを判定しています。", "working");
  const box = $("contextInbox");
  box?.classList.add("working");
  try {
    const form = new FormData();
    form.append("image", file, file.name || "clipboard.png");
    const response = await fetch("/api/context/image", {
      method: "POST",
      headers: { "x-profile-token": profileToken() },
      body: form
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.detail || data.error || `HTTP ${response.status}`);
    const analysis = data.analysis || {};
    setInboxState(statSummary(analysis), analysis.page_type === "unknown" ? "warning" : "success");
    await loadSavedContext();
    if (data.context_saved) await refreshPlanWithoutResettingSession();
  } catch (error) {
    setInboxState(`画像解析に失敗：${error.message}`, "error");
  } finally {
    box?.classList.remove("working");
  }
}

function clipboardImage(event) {
  for (const item of event.clipboardData?.items || []) {
    if (item.type?.startsWith("image/")) return item.getAsFile();
  }
  return null;
}

document.addEventListener("paste", event => {
  const file = clipboardImage(event);
  if (!file) return;
  event.preventDefault();
  void uploadImage(file);
});

$("contextInbox")?.addEventListener("click", () => {
  $("contextInbox")?.focus();
  setInboxState("FF14のスクショをコピーして、ここで Ctrl+V。画像種別は自動判定します。", "idle");
});

void loadSavedContext();

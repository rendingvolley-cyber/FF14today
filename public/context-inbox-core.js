const PROFILE_TOKEN_KEY = "ff14_today_profile_token_v1";
const $ = id => document.getElementById(id);
let lastSavedContext = {};

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

function activeWorkflowContext() {
  return $("contextInbox")?.dataset.workflowContext || "plan";
}

function retainerExpectedScreen() {
  return "リテイナーを1人開く → ベンチャー → 調達依頼 → アイテム候補が複数行並ぶ画面";
}

function statSummary(analysis, workflowContext = "plan") {
  if (analysis.page_type === "grand_company_deliveries" && analysis.grand_company_deliveries) {
    const entries = analysis.grand_company_deliveries.deliveries || [];
    const first = entries[0]?.item_name ? `「${entries[0].item_name}」など` : "";
    return `今日の双蛇党納品を ${entries.length}件 ${first}読み取りました。必要数と所持数から最初の1件を決めます。`;
  }
  if (analysis.page_type === "retainer_ventures" && analysis.retainer_ventures) {
    const entries = analysis.retainer_ventures.ventures || [];
    return `リテイナー調達候補を ${entries.length}件読み取りました。市場を比較して派遣先を更新します。`;
  }
  if (analysis.page_type === "retainer_overview") {
    return `リテイナー一覧は確認できました。ただし派遣アイテム候補はこの画面には出ていません。${retainerExpectedScreen()}を貼ってください。`;
  }
  if (analysis.page_type === "inventory_items" && analysis.inventory_items) {
    const relevant = analysis.inventory_items.relevant_items || [];
    if (relevant.length) {
      return `手持ち素材を ${relevant.length}件ひも付けました。リーヴの追加支出と実質コストを再計算します。`;
    }
    return "所持数は読み取れましたが、現在のリーヴ対象素材とは一致しませんでした。";
  }
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
  if (analysis.page_type === "achievement_progress") {
    const entries = analysis.achievement_entries || [];
    const first = entries[0];
    if (first?.name && Number.isInteger(first.current) && Number.isInteger(first.target)) {
      return `アチーブメント進捗を保存：「${first.name}」 ${first.current}/${first.target}。おすすめの残り回数計算に使います。`;
    }
    return `アチーブメント画面から ${entries.length}件を判断材料に追加しました。`;
  }
  if (workflowContext === "grand-company") {
    return "双蛇党の納品一覧として認識できませんでした。納品行・必要数・所持数が見える状態で貼り直してください。";
  }
  if (workflowContext === "retainer") {
    return `リテイナーの調達依頼候補として認識できませんでした。${retainerExpectedScreen()}を貼ってください。複数リテイナーが並ぶ一覧画面だけでは判定できません。`;
  }
  return "この画像は双蛇党納品/リテイナー調達/手持ち素材/ジャーナル/アチーブメント進捗/製作ステータス/採集ステータスとして確定できませんでした。";
}

function renderSavedContext(context = lastSavedContext) {
  const list = $("contextInboxSaved");
  if (!list) return;
  lastSavedContext = context || {};
  if (activeWorkflowContext() !== "plan") {
    list.replaceChildren();
    return;
  }
  const chips = [];
  const journal = context?.journal;
  if (journal?.journal_entries?.length) {
    chips.push(`ジャーナル ${journal.journal_entries.length}件`);
  }
  const achievement = context?.achievement_progress;
  if (achievement?.achievement_entries?.length) {
    const entry = achievement.achievement_entries[0];
    const progress = Number.isInteger(entry?.current) && Number.isInteger(entry?.target)
      ? ` ${entry.current}/${entry.target}`
      : "";
    chips.push(`実績：${entry?.name || `${achievement.achievement_entries.length}件`}${progress}`);
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

function announceContextSaved(analysis, data) {
  window.dispatchEvent(new CustomEvent("ff14today:context-saved", {
    detail: {
      pageType: analysis?.page_type || "unknown",
      analysis,
      inventorySavedCount: Number(data?.inventory_context_saved || 0),
      grandCompanySaved: Boolean(data?.grand_company_context_saved),
      retainerSaved: Boolean(data?.retainer_context_saved)
    }
  }));
}

async function uploadImage(file) {
  if (!file || !file.type.startsWith("image/")) return;
  if (file.size > 8 * 1024 * 1024) {
    setInboxState("画像が8MBを超えています。", "error");
    return;
  }
  const workflowContext = activeWorkflowContext();
  const workingMessage = workflowContext === "grand-company"
    ? "画像を解析中… 双蛇党の納品一覧として読み取っています。"
    : workflowContext === "retainer"
      ? `画像を解析中… ${retainerExpectedScreen()}か確認しています。`
      : "画像を解析中… 双蛇党納品・リテイナー調達・手持ち素材・ジャーナル・実績進捗・装備ステータスを自動判定しています。";
  setInboxState(workingMessage, "working");
  const box = $("contextInbox");
  box?.classList.add("working");
  try {
    const form = new FormData();
    form.append("image", file, file.name || "clipboard.png");
    form.append("workflow_context", workflowContext);
    const response = await fetch("/api/context/image", {
      method: "POST",
      headers: { "x-profile-token": profileToken() },
      body: form
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.detail || data.error || `HTTP ${response.status}`);
    const analysis = data.analysis || {};
    const warning = analysis.page_type === "unknown" || analysis.page_type === "retainer_overview";
    setInboxState(statSummary(analysis, workflowContext), warning ? "warning" : "success");
    announceContextSaved(analysis, data);
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

document.addEventListener("click", event => {
  if (!event.target?.closest?.("[data-gc-open],[data-retainer-open],[data-tribe-open],[data-plan-open]")) return;
  setTimeout(() => renderSavedContext(lastSavedContext), 20);
});

window.addEventListener("ff14today:workflow-context-changed", () => {
  renderSavedContext(lastSavedContext);
});

$("contextInbox")?.addEventListener("click", () => {
  $("contextInbox")?.focus();
  if (activeWorkflowContext() === "retainer") {
    setInboxState(`貼る画面：${retainerExpectedScreen()}。リテイナー一覧画面ではなく、1人を開いた後の調達依頼候補一覧です。`, "idle");
    return;
  }
  setInboxState("FF14のスクショをコピーして、ここで Ctrl+V。双蛇党納品・リテイナー調達・手持ち素材・ジャーナル・実績・装備情報を自動判定します。", "idle");
});

void loadSavedContext();
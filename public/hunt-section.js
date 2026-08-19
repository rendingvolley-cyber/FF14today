const PROFILE_TOKEN_KEY = "ff14_today_profile_token_v1";
let state = null;
let busy = false;

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

function styles() {
  return `
.hunt-board{margin:18px 0;border:1px solid rgba(32,71,117,.14);border-radius:18px;background:rgba(255,255,255,.86);box-shadow:0 12px 34px rgba(45,77,116,.08);overflow:hidden}
.hunt-head{padding:18px;display:flex;justify-content:space-between;gap:16px;align-items:flex-start;border-bottom:1px solid #e5edf6}.hunt-kicker{margin:0 0 4px;font-size:.72rem;font-weight:850;letter-spacing:.13em;color:#52729a}.hunt-head h2{margin:0;font-size:1.18rem}.hunt-copy{margin:5px 0 0;color:#627b94;font-size:.82rem;line-height:1.55}.hunt-upload{border:1px solid #bfd1e4;background:#f8fbff;color:#315b86;border-radius:10px;padding:9px 12px;font-weight:850;cursor:pointer;white-space:nowrap}.hunt-summary{display:flex;gap:8px;flex-wrap:wrap;padding:13px 18px;background:#f7faff;border-bottom:1px solid #e5edf6}.hunt-chip{background:#eaf2fb;border-radius:999px;padding:6px 9px;color:#355f89;font-size:.76rem;font-weight:800}.hunt-paste{margin:14px 18px;border:1px dashed #b9cfe5;border-radius:14px;padding:12px 14px;background:#fbfdff;outline:none;cursor:pointer}.hunt-paste:focus{border-style:solid;box-shadow:0 0 0 3px rgba(80,129,179,.12)}.hunt-paste strong{display:block;color:#244f7f;font-size:.84rem}.hunt-paste span{display:block;margin-top:3px;color:#6c839b;font-size:.74rem}.hunt-status{margin:0 18px 13px;font-size:.77rem;color:#657d95}.hunt-status[data-kind="error"]{color:#a63e3e}.hunt-status[data-kind="success"]{color:#26704b}.hunt-groups{display:grid;gap:11px;padding:0 18px 18px}.hunt-empty{padding:20px;text-align:center;color:#71879e;background:#f8fbfe;border-radius:13px}.hunt-area{border:1px solid #dbe7f2;border-radius:14px;overflow:hidden;background:#fff}.hunt-area-head{display:flex;justify-content:space-between;gap:10px;align-items:center;padding:10px 12px;background:#f4f8fc}.hunt-area-head strong{font-size:.88rem}.hunt-area-head span{font-size:.73rem;color:#698099;font-weight:800}.hunt-target{display:grid;grid-template-columns:1fr auto;gap:10px;align-items:center;padding:11px 12px;border-top:1px solid #edf2f7}.hunt-target:first-of-type{border-top:0}.hunt-target.done{opacity:.58}.hunt-target-name{font-weight:820;font-size:.84rem}.hunt-target-meta{margin-top:3px;display:flex;gap:6px;flex-wrap:wrap;color:#71879e;font-size:.69rem}.hunt-target-meta span{background:#f1f5f9;border-radius:999px;padding:2px 6px}.hunt-stepper{display:flex;gap:6px;align-items:center}.hunt-stepper button{border:1px solid #c6d7e8;background:#fff;color:#315b86;border-radius:8px;min-width:34px;height:32px;font-weight:850;cursor:pointer}.hunt-stepper button[data-delta="1"]{padding:0 9px}.hunt-progress{font-variant-numeric:tabular-nums;font-size:.78rem;font-weight:900;min-width:42px;text-align:center;color:#244f7f}.hunt-footer{display:flex;justify-content:flex-end;padding:0 18px 18px}.hunt-complete-all{border:0;border-radius:10px;background:#244f7f;color:#fff;padding:9px 12px;font-weight:850;cursor:pointer}.hunt-open-button{margin-left:8px;border:1px solid #bfd1e4;background:#f8fbff;color:#315b86;border-radius:9px;padding:6px 9px;font-weight:800;cursor:pointer}
@media(max-width:680px){.hunt-head{display:block}.hunt-upload{margin-top:12px}.hunt-target{grid-template-columns:1fr}.hunt-stepper{justify-content:flex-start}}
`;
}

function injectStyles() {
  if (document.getElementById("huntSectionStyles")) return;
  const style = document.createElement("style");
  style.id = "huntSectionStyles";
  style.textContent = styles();
  document.head.append(style);
}

function ensureSection() {
  let root = document.getElementById("huntSection");
  if (root) return root;
  const planner = document.getElementById("planner");
  if (!planner) return null;
  root = document.createElement("section");
  root.id = "huntSection";
  root.className = "hunt-board";
  root.innerHTML = `
    <div class="hunt-head">
      <div>
        <p class="hunt-kicker">TODAY'S HUNT</p>
        <h2>今日のモブハント</h2>
        <p class="hunt-copy">手配書スクショを貼ると、今日の討伐対象をエリア別にまとめて進捗管理します。</p>
      </div>
      <button type="button" class="hunt-upload" data-hunt-file-open>手配書スクショを追加</button>
      <input type="file" accept="image/png,image/jpeg,image/webp" hidden data-hunt-file>
    </div>
    <div class="hunt-summary" data-hunt-summary></div>
    <div class="hunt-paste" tabindex="0" data-hunt-paste>
      <strong>ここを選んで Ctrl+V</strong>
      <span>モブ手配書が見えるFF14スクショだけを登録します。座標や見えていない情報は推測しません。</span>
    </div>
    <p class="hunt-status" data-hunt-status>まだ今日の手配書は登録されていません。</p>
    <div class="hunt-groups" data-hunt-groups></div>
    <div class="hunt-footer"><button type="button" class="hunt-complete-all" data-hunt-complete-all hidden>今日分をすべて完了</button></div>
  `;
  planner.insertAdjacentElement("afterend", root);
  return root;
}

function setStatus(message, kind = "idle") {
  const node = document.querySelector("[data-hunt-status]");
  if (!node) return;
  node.textContent = message;
  node.dataset.kind = kind;
}

function fmt(value) {
  return Number(value || 0).toLocaleString("ja-JP");
}

function renderSummary(today) {
  const host = document.querySelector("[data-hunt-summary]");
  if (!host) return;
  const chips = [
    `${fmt(today.completed_count)} / ${fmt(today.total_count)}体`,
    `残り${fmt(today.remaining_areas)}エリア`,
    today.estimated_minutes ? `推定${fmt(today.estimated_minutes)}分` : "完了"
  ];
  if (today.total_exp_reward) chips.push(`画面読取EXP ${fmt(today.total_exp_reward)}`);
  host.replaceChildren(...chips.map(label => {
    const span = document.createElement("span");
    span.className = "hunt-chip";
    span.textContent = label;
    return span;
  }));
}

function targetNode(target) {
  const row = document.createElement("div");
  row.className = `hunt-target ${target.completed_count >= target.required_count ? "done" : ""}`;
  const copy = document.createElement("div");
  const name = document.createElement("div");
  name.className = "hunt-target-name";
  name.textContent = target.mob_name;
  const meta = document.createElement("div");
  meta.className = "hunt-target-meta";
  const metaLabels = [target.bill_label || "モブ手配書", target.verification_status === "image_read" ? "画像読取" : target.verification_status];
  if (target.exp_reward) metaLabels.push(`EXP ${fmt(target.exp_reward)}`);
  if (target.currency_reward) metaLabels.push(`報酬 ${fmt(target.currency_reward)}`);
  meta.replaceChildren(...metaLabels.map(label => {
    const span = document.createElement("span");
    span.textContent = label;
    return span;
  }));
  copy.append(name, meta);

  const stepper = document.createElement("div");
  stepper.className = "hunt-stepper";
  const minus = document.createElement("button");
  minus.type = "button";
  minus.dataset.huntTarget = target.target_key;
  minus.dataset.delta = "-1";
  minus.textContent = "−";
  minus.disabled = target.completed_count <= 0;
  const progress = document.createElement("span");
  progress.className = "hunt-progress";
  progress.textContent = `${target.completed_count}/${target.required_count}`;
  const plus = document.createElement("button");
  plus.type = "button";
  plus.dataset.huntTarget = target.target_key;
  plus.dataset.delta = "1";
  plus.textContent = target.completed_count >= target.required_count ? "完了" : "+1討伐";
  plus.disabled = target.completed_count >= target.required_count;
  stepper.append(minus, progress, plus);
  row.append(copy, stepper);
  return row;
}

function render(today) {
  state = today || { groups: [], total_count: 0, completed_count: 0, remaining_count: 0, remaining_areas: 0, estimated_minutes: 0 };
  renderSummary(state);
  const host = document.querySelector("[data-hunt-groups]");
  const completeAll = document.querySelector("[data-hunt-complete-all]");
  if (!host) return;
  if (!state.groups?.length) {
    const empty = document.createElement("div");
    empty.className = "hunt-empty";
    empty.textContent = "手配書スクショを追加すると、ここにエリア別の討伐対象が出ます。";
    host.replaceChildren(empty);
    if (completeAll) completeAll.hidden = true;
    return;
  }
  const groups = state.groups.map(group => {
    const section = document.createElement("section");
    section.className = "hunt-area";
    const head = document.createElement("div");
    head.className = "hunt-area-head";
    const title = document.createElement("strong");
    title.textContent = group.area_name;
    const progress = document.createElement("span");
    progress.textContent = `${group.completed_count}/${group.required_count}`;
    head.append(title, progress);
    section.append(head, ...group.targets.map(targetNode));
    return section;
  });
  host.replaceChildren(...groups);
  if (completeAll) completeAll.hidden = state.remaining_count <= 0;
  setStatus(state.remaining_count > 0
    ? `残り${state.remaining_count}体。エリアごとにまとめて回ると移動が減ります。`
    : "今日登録したモブ手配書は完了しています。", "success");
}

async function api(path, options = {}) {
  const headers = { "x-profile-token": profileToken(), ...(options.headers || {}) };
  if (options.body !== undefined && !(options.body instanceof FormData)) headers["content-type"] = "application/json";
  const response = await fetch(path, { ...options, headers });
  let data = {};
  try { data = await response.json(); } catch {}
  if (!response.ok) throw new Error(data.error || data.detail || `HTTP ${response.status}`);
  return data;
}

async function load() {
  try {
    const data = await api("/api/hunts/today");
    render(data.today);
  } catch (error) {
    setStatus(`モブハント読込失敗：${error.message}`, "error");
  }
}

async function upload(file) {
  if (!file || !file.type.startsWith("image/") || busy) return;
  busy = true;
  setStatus("モブ手配書を解析中…", "working");
  try {
    const form = new FormData();
    form.append("image", file, file.name || "hunt-bill.png");
    const data = await api("/api/hunts/recognize", { method: "POST", body: form });
    render(data.today);
    if (data.analysis?.page_type !== "hunt_bill") {
      setStatus("モブ手配書として確定できませんでした。対象名と必要数が見える状態で貼り直してください。", "error");
    } else {
      setStatus(`${data.saved_count}件の討伐対象を登録しました。`, "success");
      window.dispatchEvent(new CustomEvent("ff14today:hunt-updated", { detail: data.today }));
    }
  } catch (error) {
    setStatus(`モブ手配書の解析に失敗：${error.message}`, "error");
  } finally {
    busy = false;
  }
}

async function changeProgress(targetKey, delta) {
  if (busy) return;
  busy = true;
  try {
    const data = await api("/api/hunts/progress", { method: "POST", body: JSON.stringify({ target_key: targetKey, delta }) });
    render(data.today);
    window.dispatchEvent(new CustomEvent("ff14today:hunt-updated", { detail: data.today }));
  } catch (error) {
    setStatus(`進捗更新に失敗：${error.message}`, "error");
  } finally {
    busy = false;
  }
}

async function completeAll() {
  if (busy || !state?.remaining_count) return;
  busy = true;
  try {
    const data = await api("/api/hunts/complete-all", { method: "POST", body: JSON.stringify({}) });
    render(data.today);
    window.dispatchEvent(new CustomEvent("ff14today:hunt-updated", { detail: data.today }));
  } catch (error) {
    setStatus(`一括完了に失敗：${error.message}`, "error");
  } finally {
    busy = false;
  }
}

function clipboardImage(event) {
  for (const item of event.clipboardData?.items || []) {
    if (item.type?.startsWith("image/")) return item.getAsFile();
  }
  return null;
}

function decorateTaskBoard() {
  document.querySelectorAll(".task-select-card,.method-card,.method-alternative").forEach(card => {
    if (!/モブ手配書をまとめて回る/.test(card.textContent || "")) return;
    if (card.querySelector("[data-open-hunt]")) return;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "hunt-open-button";
    button.dataset.openHunt = "1";
    button.textContent = "モブハントを開く";
    const actions = card.querySelector(".task-select-actions,.alternative-body") || card;
    actions.append(button);
  });
}

function boot() {
  injectStyles();
  const root = ensureSection();
  if (!root) return;
  root.querySelector("[data-hunt-file-open]")?.addEventListener("click", () => root.querySelector("[data-hunt-file]")?.click());
  root.querySelector("[data-hunt-file]")?.addEventListener("change", event => {
    const file = event.target.files?.[0];
    if (file) void upload(file);
    event.target.value = "";
  });
  root.querySelector("[data-hunt-paste]")?.addEventListener("click", event => event.currentTarget.focus());
  root.addEventListener("click", event => {
    const button = event.target.closest("[data-hunt-target][data-delta]");
    if (button) void changeProgress(button.dataset.huntTarget, Number(button.dataset.delta));
    if (event.target.closest("[data-hunt-complete-all]")) void completeAll();
  });
  document.addEventListener("paste", event => {
    if (!document.activeElement?.closest?.("[data-hunt-paste]")) return;
    const file = clipboardImage(event);
    if (!file) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    void upload(file);
  }, true);
  document.addEventListener("click", event => {
    if (!event.target.closest("[data-open-hunt]")) return;
    root.scrollIntoView({ behavior: "smooth", block: "start" });
  });
  new MutationObserver(decorateTaskBoard).observe(document.body, { subtree: true, childList: true });
  decorateTaskBoard();
  void load();
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
else boot();

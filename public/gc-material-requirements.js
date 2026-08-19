const PROFILE_TOKEN_KEY = "ff14_today_profile_token_v1";
const CACHE_MS = 30_000;
let cachedData = null;
let cachedAt = 0;
let inFlight = null;
let mode = "direct";
let reconciling = false;

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

function ensureStyles() {
  if (document.getElementById("gcMaterialRequirementsStyles")) return;
  const style = document.createElement("style");
  style.id = "gcMaterialRequirementsStyles";
  style.textContent = `
    .gc-material-requirements-panel{margin:8px 0 14px;border:1px solid rgba(79,124,255,.22);border-radius:13px;background:#f7f9ff;padding:11px}
    .gc-material-requirements-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:8px}.gc-material-requirements-head strong{display:block;font-size:11px}.gc-material-requirements-head small{display:block;margin-top:3px;color:var(--muted);font-size:8px;line-height:1.45}
    .gc-material-mode{display:flex;gap:5px;flex-wrap:wrap}.gc-material-mode button{border:1px solid var(--line);background:#fff;color:var(--accent);border-radius:8px;padding:5px 7px;font-size:8px;font-weight:900;cursor:pointer}.gc-material-mode button.active{background:var(--accent);color:#fff;border-color:var(--accent)}
    .gc-material-requirements-summary{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px}.gc-material-requirements-chip{border-radius:999px;background:#eaf2fb;color:#355f89;padding:4px 7px;font-size:8px;font-weight:900}
    .gc-material-requirements-wrap{overflow-x:auto;border:1px solid var(--line);border-radius:9px;background:#fff}.gc-material-requirements-table{width:100%;border-collapse:collapse;min-width:360px;font-size:9px}.gc-material-requirements-table th,.gc-material-requirements-table td{padding:7px 8px;border-bottom:1px solid var(--line)}.gc-material-requirements-table th{background:#f3f6fb;color:var(--muted);font-size:8px;text-align:left}.gc-material-requirements-table th:last-child,.gc-material-requirements-table td:last-child{text-align:right;white-space:nowrap}.gc-material-requirements-table tbody tr:last-child td{border-bottom:0}.gc-material-requirements-table td:last-child{font-weight:950;color:#22334b}
    .gc-material-requirements-empty,.gc-material-requirements-warning{border:1px dashed var(--line);border-radius:9px;background:#fff;padding:9px;font-size:9px;line-height:1.55;color:var(--muted)}.gc-material-requirements-warning{margin-top:8px;border-color:#e7c78b;background:#fffaf0;color:#805f25}
    @media(max-width:600px){.gc-material-requirements-head{flex-direction:column}.gc-material-mode{width:100%}}
  `;
  document.head.append(style);
}

function currentContainer() {
  const gc = document.querySelector("[data-gc-content]");
  if (!gc || gc.hidden) return null;
  return gc.querySelector("[data-gc-two-page-lists]");
}

function ensurePanel(container) {
  if (!container) return null;
  let panel = container.querySelector("[data-gc-material-requirements-panel]");
  if (panel) return panel;
  panel = document.createElement("section");
  panel.className = "gc-material-requirements-panel";
  panel.setAttribute("data-gc-material-requirements-panel", "");
  const lead = container.querySelector(":scope > .gc-category-head");
  if (lead) lead.insertAdjacentElement("afterend", panel);
  else container.prepend(panel);
  return panel;
}

function number(value) {
  return Math.max(0, Math.round(Number(value) || 0)).toLocaleString("ja-JP");
}

function loadData({ force = false } = {}) {
  if (!force && cachedData && Date.now() - cachedAt < CACHE_MS) return Promise.resolve(cachedData);
  if (inFlight) return inFlight;
  inFlight = fetch("/api/grand-company/recipe-materials", {
    headers: { "x-profile-token": profileToken() }
  }).then(async response => {
    let data = {};
    try { data = await response.json(); } catch {}
    if (!response.ok || data?.ok === false) throw new Error(data?.detail || data?.message || `HTTP ${response.status}`);
    cachedData = data;
    cachedAt = Date.now();
    return data;
  }).finally(() => { inFlight = null; });
  return inFlight;
}

function renderTable(host, rows) {
  host.replaceChildren();
  if (!rows.length) {
    const empty = document.createElement("div");
    empty.className = "gc-material-requirements-empty";
    empty.textContent = "必要素材を取得できる製作納品がありません。レシピ取得に失敗した品がある場合は下に理由を表示します。";
    host.append(empty);
    return;
  }
  const wrap = document.createElement("div");
  wrap.className = "gc-material-requirements-wrap";
  const table = document.createElement("table");
  table.className = "gc-material-requirements-table";
  const thead = document.createElement("thead");
  const headRow = document.createElement("tr");
  for (const label of ["素材", "合計必要数"]) {
    const th = document.createElement("th");
    th.textContent = label;
    headRow.append(th);
  }
  thead.append(headRow);
  const tbody = document.createElement("tbody");
  for (const row of rows) {
    const tr = document.createElement("tr");
    const name = document.createElement("td");
    name.textContent = row.item_name || `Item ${row.item_id}`;
    const qty = document.createElement("td");
    qty.textContent = `×${number(row.quantity)}`;
    tr.append(name, qty);
    tbody.append(tr);
  }
  table.append(thead, tbody);
  wrap.append(table);
  host.append(wrap);
}

function render(panel, data) {
  if (!panel) return;
  panel.replaceChildren();
  const head = document.createElement("div");
  head.className = "gc-material-requirements-head";
  const copy = document.createElement("div");
  const title = document.createElement("strong");
  title.textContent = "製作に必要な素材一覧";
  const note = document.createElement("small");
  note.textContent = "マケボ価格とは別に、FF14の製作レシピから必要数を計算します。相場が取れなくても素材数は残します。";
  copy.append(title, note);
  const controls = document.createElement("div");
  controls.className = "gc-material-mode";
  const direct = document.createElement("button");
  direct.type = "button";
  direct.dataset.gcMaterialMode = "direct";
  direct.classList.toggle("active", mode === "direct");
  direct.textContent = "レシピ素材";
  const raw = document.createElement("button");
  raw.type = "button";
  raw.dataset.gcMaterialMode = "raw";
  raw.classList.toggle("active", mode === "raw");
  raw.textContent = "原材料まで展開";
  controls.append(direct, raw);
  head.append(copy, controls);
  panel.append(head);

  const summary = document.createElement("div");
  summary.className = "gc-material-requirements-summary";
  const materials = mode === "raw" ? (data?.aggregate?.raw_materials || []) : (data?.aggregate?.direct_materials || []);
  const chips = [
    `製作 ${number(data?.actionable_count)}件`,
    `レシピ取得 ${number(data?.resolved_count)}/${number(data?.actionable_count)}件`,
    `素材 ${number(materials.length)}種`
  ];
  for (const label of chips) {
    const chip = document.createElement("span");
    chip.className = "gc-material-requirements-chip";
    chip.textContent = label;
    summary.append(chip);
  }
  panel.append(summary);

  const tableHost = document.createElement("div");
  tableHost.setAttribute("data-gc-material-requirements-table", "");
  panel.append(tableHost);
  renderTable(tableHost, materials);

  if (Array.isArray(data?.unresolved) && data.unresolved.length) {
    const warning = document.createElement("div");
    warning.className = "gc-material-requirements-warning";
    warning.textContent = `レシピ未取得 ${data.unresolved.length}件：${data.unresolved.map(row => row.item_name).join(" / ")}。この品は推測せず合計から除外しています。`;
    panel.append(warning);
  }

  controls.addEventListener("click", event => {
    const button = event.target.closest("button[data-gc-material-mode]");
    if (!button) return;
    mode = button.dataset.gcMaterialMode === "raw" ? "raw" : "direct";
    render(panel, data);
  });
}

function renderLoading(panel) {
  if (!panel || panel.dataset.gcMaterialState === "loading") return;
  panel.dataset.gcMaterialState = "loading";
  panel.innerHTML = '<div class="gc-material-requirements-empty">製作レシピから必要素材数を計算中…</div>';
}

function renderError(panel, error) {
  if (!panel) return;
  panel.dataset.gcMaterialState = "error";
  panel.innerHTML = "";
  const errorBox = document.createElement("div");
  errorBox.className = "gc-material-requirements-warning";
  errorBox.textContent = `必要素材を取得できませんでした：${error?.message || "不明なエラー"}。納品一覧自体はそのまま使えます。`;
  panel.append(errorBox);
}

async function reconcile({ force = false } = {}) {
  if (reconciling) return;
  const container = currentContainer();
  if (!container) return;
  reconciling = true;
  const panel = ensurePanel(container);
  try {
    ensureStyles();
    renderLoading(panel);
    const data = await loadData({ force });
    panel.dataset.gcMaterialState = "ready";
    render(panel, data);
  } catch (error) {
    renderError(panel, error);
  } finally {
    reconciling = false;
  }
}

function invalidate() {
  cachedData = null;
  cachedAt = 0;
}

function boot() {
  ensureStyles();
  let queued = false;
  const observer = new MutationObserver(() => {
    if (queued) return;
    queued = true;
    setTimeout(() => {
      queued = false;
      const container = currentContainer();
      if (container && !container.querySelector("[data-gc-material-requirements-panel]")) void reconcile();
    }, 0);
  });
  observer.observe(document.body, { childList: true, subtree: true });
  for (const delay of [150, 500, 1200, 2500]) setTimeout(() => void reconcile(), delay);
  window.addEventListener("ff14today:context-saved", event => {
    if (event?.detail?.pageType !== "grand_company_deliveries") return;
    invalidate();
    setTimeout(() => void reconcile({ force: true }), 150);
  });
  document.addEventListener("click", event => {
    if (event.target?.closest?.("[data-gc-refresh]")) {
      invalidate();
      setTimeout(() => void reconcile({ force: true }), 150);
    } else if (event.target?.closest?.("[data-gc-open]")) {
      setTimeout(() => void reconcile(), 80);
    }
  });
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
else boot();

import { aggregateSelectedDeliveries, deliveryKey, marketLine } from "./gc-procurement-summary-core.js";

const PROFILE_TOKEN_KEY = "ff14_today_profile_token_v1";
const STORAGE_PREFIX = "ff14_today_gc_procurement_";
let cachedData = null;
let cachedAt = 0;
let inFlight = null;
let reconciling = false;

function japanDateKey() {
  const parts = new Intl.DateTimeFormat("ja-JP", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const get = type => parts.find(part => part.type === type)?.value || "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}
function storageKey() { return `${STORAGE_PREFIX}${japanDateKey()}`; }
function profileToken() { return localStorage.getItem(PROFILE_TOKEN_KEY) || ""; }
function hashText(value) {
  let hash = 2166136261;
  for (const char of String(value || "")) { hash ^= char.codePointAt(0); hash = Math.imul(hash, 16777619); }
  return (hash >>> 0).toString(16).padStart(8, "0");
}
function setTextIfChanged(node, text) { if (node && node.textContent !== text) node.textContent = text; }
function loadSelected() {
  try {
    const parsed = JSON.parse(localStorage.getItem(storageKey()) || "[]");
    return new Set(Array.isArray(parsed) ? parsed.map(String) : []);
  } catch { return new Set(); }
}
function saveSelected(selected) {
  try { localStorage.setItem(storageKey(), JSON.stringify([...selected])); } catch {}
}
function gil(value) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? `${Math.round(n).toLocaleString("ja-JP")}G` : "—";
}

function ensureStyles() {
  if (document.getElementById("gcProcurementSummaryStyles")) return;
  const style = document.createElement("style");
  style.id = "gcProcurementSummaryStyles";
  style.textContent = `
    .gc-procurement-panel{margin:10px 0 14px;border:1px solid rgba(79,124,255,.2);border-radius:13px;background:#f7f9ff;padding:11px}
    .gc-procurement-head{display:flex;justify-content:space-between;gap:10px;align-items:center;margin-bottom:8px}
    .gc-procurement-head strong{font-size:11px}.gc-procurement-actions{display:flex;gap:6px;flex-wrap:wrap}
    .gc-procurement-actions button{border:1px solid var(--line);background:#fff;color:var(--accent);border-radius:8px;padding:5px 7px;font-size:9px;font-weight:900;cursor:pointer}
    .gc-procurement-totals{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px}.gc-procurement-total{background:#fff;border:1px solid var(--line);border-radius:9px;padding:7px}
    .gc-procurement-total small{display:block;color:var(--muted);font-size:8px}.gc-procurement-total strong{display:block;margin-top:2px;font-size:11px}
    .gc-procurement-materials{margin-top:9px;padding-top:9px;border-top:1px solid var(--line)}
    .gc-procurement-materials-head{display:flex;justify-content:space-between;gap:8px;align-items:baseline;margin-bottom:6px}.gc-procurement-materials-head strong{font-size:10px}.gc-procurement-materials-head span{font-size:8px;color:var(--muted)}
    .gc-material-table-wrap{overflow-x:auto;border:1px solid var(--line);border-radius:9px;background:#fff}.gc-material-table{width:100%;border-collapse:collapse;min-width:420px;font-size:9px}
    .gc-material-table th,.gc-material-table td{padding:7px 8px;border-bottom:1px solid var(--line);text-align:right;white-space:nowrap}.gc-material-table th{background:#f3f6fb;color:var(--muted);font-size:8px}.gc-material-table th:first-child,.gc-material-table td:first-child{text-align:left;white-space:normal}.gc-material-table tbody tr:last-child td{border-bottom:0}.gc-material-table td:nth-child(2){font-weight:900;color:#22334b}.gc-material-empty{padding:9px;border:1px dashed var(--line);border-radius:9px;background:#fff;color:var(--muted);font-size:9px;line-height:1.55}
    .gc-procurement-market{display:block;margin-top:3px;color:var(--muted);font-size:8px;font-weight:700;line-height:1.45}
    .gc-procurement-check{width:15px;height:15px;flex:0 0 auto;margin:0 2px 0 0}
    @media(max-width:600px){.gc-procurement-totals{grid-template-columns:1fr}.gc-procurement-head{align-items:flex-start;flex-direction:column}.gc-procurement-materials-head{align-items:flex-start;flex-direction:column}}
  `;
  document.head.append(style);
}

async function loadData({ force = false } = {}) {
  if (!force && cachedData && Date.now() - cachedAt < 30000) return cachedData;
  if (inFlight) return inFlight;
  inFlight = fetch("/api/grand-company/procurement-summary", { headers: { "x-profile-token": profileToken() } })
    .then(async response => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      cachedData = data;
      cachedAt = Date.now();
      return data;
    })
    .finally(() => { inFlight = null; });
  return inFlight;
}

function rowLookup(data) {
  const byName = new Map();
  for (const row of data?.deliveries || []) {
    const key = `${row.page_kind || ""}:${row.item_name || ""}`;
    if (!byName.has(key)) byName.set(key, row);
  }
  return byName;
}

function bindPanelActions(panel, data, selected) {
  panel.querySelector("[data-gc-select-crafting]")?.addEventListener("click", () => {
    for (const row of data?.deliveries || []) if (row.page_kind === "crafting") selected.add(deliveryKey(row));
    saveSelected(selected); void reconcile();
  });
  panel.querySelector("[data-gc-select-all]")?.addEventListener("click", () => {
    for (const row of data?.deliveries || []) selected.add(deliveryKey(row));
    saveSelected(selected); void reconcile();
  });
  panel.querySelector("[data-gc-clear-selection]")?.addEventListener("click", () => {
    selected.clear(); saveSelected(selected); void reconcile();
  });
}

function materialTable(summary) {
  if (!summary.materials.length) {
    return `<div class="gc-material-empty">製作納品をチェックすると、選んだ品を全部作るための素材数をここで合算します。「製作を全選択」で今日の製作納品ぶんを一括計算できます。</div>`;
  }
  const rows = summary.materials.map(row => `
    <tr>
      <td>${escapeHtml(row.item_name || "素材")}</td>
      <td>×${Number(row.quantity || 0).toLocaleString("ja-JP")}</td>
      <td>${gil(row.unit_gil)}</td>
      <td>${gil(row.total_gil)}</td>
    </tr>`).join("");
  return `
    <div class="gc-material-table-wrap">
      <table class="gc-material-table">
        <thead><tr><th>素材</th><th>合計必要数</th><th>目安単価</th><th>小計</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
}

function renderPanel(container, data, selected) {
  let panel = container.querySelector("[data-gc-procurement-panel]");
  if (!panel) {
    panel = document.createElement("section");
    panel.className = "gc-procurement-panel";
    panel.setAttribute("data-gc-procurement-panel", "");
    const lead = container.querySelector(":scope > .gc-category-head");
    if (lead) lead.insertAdjacentElement("afterend", panel);
    else container.prepend(panel);
  }
  const summary = aggregateSelectedDeliveries(data?.deliveries || [], selected);
  const html = `
    <div class="gc-procurement-head">
      <strong>今日の納品準備｜選択 ${summary.selected_count}件</strong>
      <div class="gc-procurement-actions">
        <button type="button" data-gc-select-crafting>製作を全選択</button>
        <button type="button" data-gc-select-all>全部選択</button>
        <button type="button" data-gc-clear-selection>解除</button>
      </div>
    </div>
    <div class="gc-procurement-totals">
      <div class="gc-procurement-total"><small>完成品を全部買う</small><strong>${gil(summary.finished_buy_gil)}</strong></div>
      <div class="gc-procurement-total"><small>原材料から作る（製作のみ）</small><strong>${gil(summary.craft_raw_gil)}</strong></div>
      <div class="gc-procurement-total"><small>各品のおすすめルート合計</small><strong>${gil(summary.recommended_gil)}</strong></div>
    </div>
    <div class="gc-procurement-materials">
      <div class="gc-procurement-materials-head"><strong>製作に必要な素材一覧</strong><span>製作 ${summary.crafting_selected_count}件ぶんを合算</span></div>
      ${materialTable(summary)}
    </div>
  `;
  const signature = hashText(html);
  if (panel.dataset.renderHash === signature) return;
  panel.dataset.renderHash = signature;
  panel.innerHTML = html;
  bindPanelActions(panel, data, selected);
}

function enhanceRows(container, data, selected) {
  const lookup = rowLookup(data);
  for (const section of container.querySelectorAll("[data-gc-category]")) {
    const kind = section.dataset.gcCategory || "";
    for (const tr of section.querySelectorAll("tbody tr")) {
      const strong = tr.querySelector("[data-gc-delivery-item]");
      const itemName = strong?.textContent?.trim() || "";
      if (!itemName) continue;
      const row = lookup.get(`${kind}:${itemName}`);
      if (!row) continue;
      const key = deliveryKey(row);
      tr.dataset.gcProcurementKey = key;
      const itemTop = strong.closest(".gc-two-page-item");
      if (itemTop && !itemTop.querySelector("[data-gc-procurement-check]")) {
        const check = document.createElement("input");
        check.type = "checkbox";
        check.className = "gc-procurement-check";
        check.setAttribute("data-gc-procurement-check", "");
        check.checked = selected.has(key);
        check.addEventListener("change", () => {
          if (check.checked) selected.add(key); else selected.delete(key);
          saveSelected(selected); renderPanel(container, data, selected);
        });
        itemTop.prepend(check);
      } else {
        const check = itemTop?.querySelector("[data-gc-procurement-check]");
        if (check && check.checked !== selected.has(key)) check.checked = selected.has(key);
      }
      const itemCell = strong.closest("td");
      let market = itemCell?.querySelector("[data-gc-procurement-market]");
      if (!market && itemCell) {
        market = document.createElement("small");
        market.className = "gc-procurement-market";
        market.setAttribute("data-gc-procurement-market", "");
        itemCell.append(market);
      }
      setTextIfChanged(market, marketLine(row.market));
    }
  }
}

async function reconcile({ force = false } = {}) {
  if (reconciling) return;
  const gc = document.querySelector("[data-gc-content]");
  const container = gc?.querySelector("[data-gc-two-page-lists]");
  if (!gc || gc.hidden || !container) return;
  reconciling = true;
  try {
    ensureStyles();
    const data = await loadData({ force });
    const selected = loadSelected();
    const valid = new Set((data?.deliveries || []).map(deliveryKey));
    for (const key of [...selected]) if (!valid.has(key)) selected.delete(key);
    saveSelected(selected);
    enhanceRows(container, data, selected);
    renderPanel(container, data, selected);
  } catch {
    // The existing GC list remains usable even if market enrichment is unavailable.
  } finally {
    reconciling = false;
  }
}

function boot() {
  ensureStyles();
  let queued = false;
  const observer = new MutationObserver(() => {
    if (queued) return;
    queued = true;
    setTimeout(() => { queued = false; void reconcile(); }, 0);
  });
  observer.observe(document.body, { childList: true, subtree: true });
  for (const delay of [300, 900, 1800, 3500]) setTimeout(() => void reconcile(), delay);
  window.addEventListener("ff14today:context-saved", () => {
    cachedData = null; cachedAt = 0; setTimeout(() => void reconcile({ force: true }), 250);
  });
  document.addEventListener("click", event => {
    if (event.target?.closest?.("[data-gc-refresh]")) { cachedData = null; cachedAt = 0; setTimeout(() => void reconcile({ force: true }), 250); }
    else if (event.target?.closest?.("[data-gc-open]")) setTimeout(() => void reconcile(), 80);
  });
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
else boot();

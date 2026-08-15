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
    .gc-procurement-materials{margin-top:8px;padding-top:8px;border-top:1px solid var(--line);font-size:9px;line-height:1.65;color:#4f5b70}
    .gc-procurement-market{display:block;margin-top:3px;color:var(--muted);font-size:8px;font-weight:700;line-height:1.45}
    .gc-procurement-check{width:15px;height:15px;flex:0 0 auto;margin:0 2px 0 0}
    @media(max-width:600px){.gc-procurement-totals{grid-template-columns:1fr}.gc-procurement-head{align-items:flex-start;flex-direction:column}}
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
  const byExact = new Map();
  const byName = new Map();
  for (const row of data?.deliveries || []) {
    byExact.set(deliveryKey(row), row);
    const key = `${row.page_kind || ""}:${row.item_name || ""}`;
    if (!byName.has(key)) byName.set(key, row);
  }
  return { byExact, byName };
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
  const materials = summary.materials.length
    ? summary.materials.map(row => `${row.item_name} ×${row.quantity}${row.total_gil == null ? "" : `（約${gil(row.total_gil)}）`}`).join(" / ")
    : "製作納品を選ぶと、原材料から作る場合の必要素材をここで合算します。";
  panel.innerHTML = `
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
    <div class="gc-procurement-materials"><strong>必要素材 合算：</strong>${materials}</div>
  `;
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

function enhanceRows(container, data, selected) {
  const lookup = rowLookup(data);
  for (const section of container.querySelectorAll("[data-gc-category]")) {
    const kind = section.dataset.gcCategory || "";
    for (const tr of section.querySelectorAll("tbody tr")) {
      const strong = tr.querySelector("[data-gc-delivery-item]");
      const itemName = strong?.textContent?.trim() || "";
      if (!itemName) continue;
      const row = lookup.byName.get(`${kind}:${itemName}`);
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
        if (check) check.checked = selected.has(key);
      }
      const itemCell = strong.closest("td");
      let market = itemCell?.querySelector("[data-gc-procurement-market]");
      if (!market && itemCell) {
        market = document.createElement("small");
        market.className = "gc-procurement-market";
        market.setAttribute("data-gc-procurement-market", "");
        itemCell.append(market);
      }
      if (market) market.textContent = marketLine(row.market);
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
  const observer = new MutationObserver(() => { setTimeout(() => void reconcile(), 0); });
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

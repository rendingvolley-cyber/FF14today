const PROFILE_TOKEN_KEY = "ff14_today_profile_token_v1";
const COST_RETRY_COOLDOWN_MS = 30_000;
let refreshing = false;
let lastKnownStatus = { crafting: false, gathering: false };
let cachedCostFingerprint = "";
let cachedCostData = null;
let costRequestInFlight = null;
let costFailure = { fingerprint: "", retryAfter: 0 };

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

function gcContent() {
  return document.querySelector("[data-gc-content]");
}

function inbox() {
  return document.getElementById("contextInbox");
}

function formatNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n).toLocaleString("ja-JP") : "—";
}

function gilText(route) {
  if (!route || route.available === false || route.gil == null) return "—";
  return `約${formatNumber(route.gil)}G`;
}

function quantityText(row) {
  const requested = Number.isInteger(Number(row?.requested_quantity)) ? Number(row.requested_quantity) : null;
  const owned = Number.isInteger(Number(row?.owned_quantity)) ? Number(row.owned_quantity) : null;
  if (requested !== null && owned !== null) return `必要 ${requested} / 所持 ${owned}`;
  if (requested !== null) return `必要 ${requested}`;
  return "数量確認";
}

function ensureStyles() {
  if (document.getElementById("gcTwoPageStyles")) return;
  const style = document.createElement("style");
  style.id = "gcTwoPageStyles";
  style.textContent = `
    .gc-page-capture{margin:0 18px 14px;padding:11px;border:1px solid var(--line);border-radius:14px;background:#f8faff}
    .gc-page-capture-title{margin:0 0 8px;font-size:11px;font-weight:950;color:var(--text)}
    .gc-page-slots{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}
    .gc-page-slot{display:flex;align-items:center;justify-content:space-between;gap:8px;border:1px solid var(--line);border-radius:11px;background:#fff;padding:9px 10px;color:var(--text);cursor:pointer;text-align:left}
    .gc-page-slot.active{border-color:rgba(79,124,255,.5);box-shadow:0 0 0 2px rgba(79,124,255,.08)}
    .gc-page-slot strong{font-size:11px}.gc-page-slot small{font-size:9px;color:var(--muted);font-weight:850;white-space:nowrap}
    .gc-page-slot.saved small{color:#33755a}.gc-page-prompt{margin:8px 2px 0;color:var(--muted);font-size:10px;line-height:1.55}
    .gc-two-page-lists{padding:0 18px 16px}.gc-category-block+ .gc-category-block{margin-top:14px}
    .gc-category-head{display:flex;align-items:baseline;justify-content:space-between;gap:10px;margin:0 0 7px}
    .gc-category-head h3{margin:0;font-size:13px}.gc-category-head span{color:var(--muted);font-size:9px;font-weight:850}
    .gc-category-empty{border:1px dashed var(--line);border-radius:12px;padding:12px;color:var(--muted);font-size:10px;background:#fbfcff}
    .gc-two-page-table-wrap{overflow-x:auto;border:1px solid var(--line);border-radius:12px;background:#fff}
    .gc-two-page-table{width:100%;border-collapse:collapse;min-width:700px;font-size:10px}
    .gc-two-page-table th{background:#f3f6fb;color:var(--muted);font-size:9px;text-align:left;padding:8px 9px;border-bottom:1px solid var(--line)}
    .gc-two-page-table td{padding:9px;border-bottom:1px solid var(--line);vertical-align:middle}.gc-two-page-table tbody tr:last-child td{border-bottom:0}
    .gc-two-page-item{display:flex;align-items:center;gap:6px}.gc-two-page-item strong{font-size:11px}.gc-two-page-rec{border-radius:999px;background:var(--accent);color:#fff;padding:3px 6px;font-size:8px;font-weight:950}
    .gc-two-page-detail summary{display:inline-block;border:1px solid var(--line);border-radius:8px;padding:5px 8px;color:var(--accent);font-weight:900;cursor:pointer;list-style:none}.gc-two-page-detail summary::-webkit-details-marker{display:none}
    .gc-two-page-detail[open]{min-width:260px}.gc-two-page-detail-body{margin-top:8px;padding:9px;border-radius:10px;background:#f8faff;color:#4f5b70;line-height:1.55}
    .gc-two-page-detail-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px;margin-bottom:7px}.gc-two-page-detail-stat{border:1px solid var(--line);border-radius:9px;background:#fff;padding:7px}.gc-two-page-detail-stat small{display:block;color:var(--muted);font-size:8px}.gc-two-page-detail-stat strong{display:block;margin-top:2px;font-size:10px}
    .gc-two-page-materials{font-size:9px}.gc-two-page-note{margin:9px 0 0;color:var(--muted);font-size:9px;line-height:1.5}
    @media(max-width:600px){.gc-page-capture,.gc-two-page-lists{margin-left:0;margin-right:0;padding-left:13px;padding-right:13px}.gc-page-slots{grid-template-columns:1fr}}
  `;
  document.head.append(style);
}

function setTarget(kind) {
  if (kind !== "crafting" && kind !== "gathering") return;
  const box = inbox();
  if (!box) return;
  box.dataset.gcPageKind = kind;
  document.querySelectorAll("[data-gc-page-select]").forEach(button => {
    button.classList.toggle("active", button.dataset.gcPageSelect === kind);
  });
  const title = box.querySelector(".context-inbox-title span:last-child");
  const copy = box.querySelector(".context-inbox-copy");
  if (kind === "crafting") {
    if (title) title.textContent = "① 製作ページ（軍需品調達）を貼る";
    if (copy) copy.textContent = "製作職の納品一覧が見える1ページ目を、このカードのまま Ctrl+V。登録済みの採集ページは消えません。";
  } else {
    if (title) title.textContent = "② 採集ページ（補給品調達）を貼る";
    if (copy) copy.textContent = "採掘師・園芸師などの納品一覧が見える2ページ目を、このカードのまま Ctrl+V。登録済みの製作ページは消えません。";
  }
}

function ensureCapturePanel() {
  ensureStyles();
  const gc = gcContent();
  const box = inbox();
  if (!gc || !box || !gc.contains(box)) return null;
  let panel = gc.querySelector("[data-gc-page-capture]");
  if (!panel) {
    panel = document.createElement("section");
    panel.className = "gc-page-capture";
    panel.setAttribute("data-gc-page-capture", "");
    panel.innerHTML = `
      <p class="gc-page-capture-title">双蛇党納品は2ページを別々に保存</p>
      <div class="gc-page-slots">
        <button type="button" class="gc-page-slot" data-gc-page-select="crafting"><strong>① 製作（軍需品調達）</strong><small data-gc-page-state="crafting">未登録</small></button>
        <button type="button" class="gc-page-slot" data-gc-page-select="gathering"><strong>② 採集（補給品調達）</strong><small data-gc-page-state="gathering">未登録</small></button>
      </div>
      <p class="gc-page-prompt" data-gc-page-prompt>まず製作ページを貼ってください。</p>
    `;
    box.parentNode?.insertBefore(panel, box);
    panel.querySelectorAll("[data-gc-page-select]").forEach(button => {
      button.addEventListener("click", () => {
        setTarget(button.dataset.gcPageSelect);
        box.focus();
      });
    });
  }
  return panel;
}

function updateCaptureStatus(data = {}) {
  const panel = ensureCapturePanel();
  if (!panel) return;
  const status = data?.page_status || {};
  lastKnownStatus = { crafting: Boolean(status.crafting), gathering: Boolean(status.gathering) };
  for (const kind of ["crafting", "gathering"]) {
    const state = panel.querySelector(`[data-gc-page-state="${kind}"]`);
    const button = panel.querySelector(`[data-gc-page-select="${kind}"]`);
    const count = Array.isArray(data?.[`${kind}_deliveries`]) ? data[`${kind}_deliveries`].length : 0;
    if (state) state.textContent = status[kind] ? `✓ 登録済 ${count}件` : "未登録";
    button?.classList.toggle("saved", Boolean(status[kind]));
  }
  const prompt = panel.querySelector("[data-gc-page-prompt]");
  if (!status.crafting) {
    if (prompt) prompt.textContent = "① まず製作ページ（軍需品調達）を貼ってください。";
    setTarget("crafting");
  } else if (!status.gathering) {
    if (prompt) prompt.textContent = "✓ 製作ページを保持しています。次に② 採集ページ（補給品調達）を貼ってください。";
    setTarget("gathering");
  } else {
    if (prompt) prompt.textContent = "✓ 製作・採集の2ページを登録済みです。貼り直す場合は更新したい方を選んでCtrl+V。";
    const current = inbox()?.dataset?.gcPageKind;
    if (current !== "crafting" && current !== "gathering") setTarget("crafting");
  }
}

function procurementSummary(row, kind) {
  const p = row?.procurement;
  if (p?.status === "ready_now") return { label: "手持ちで納品", gil: "0G" };
  if (kind === "gathering") {
    if (p?.market_buy?.gil != null) return { label: "マケボ / 自力採集", gil: gilText(p.market_buy) };
    return { label: "自力採集 / マケボ確認", gil: "—" };
  }
  if (p?.status === "ok" && p.recommended_route) return { label: p.recommended_route.label || "おすすめ調達", gil: gilText(p.recommended_route) };
  return { label: "比較できず", gil: "—" };
}

function addDetailStat(parent, label, value) {
  const box = document.createElement("div");
  box.className = "gc-two-page-detail-stat";
  const small = document.createElement("small");
  small.textContent = label;
  const strong = document.createElement("strong");
  strong.textContent = value;
  box.append(small, strong);
  parent.append(box);
}

function buildDetail(row, kind, recommendation) {
  const details = document.createElement("details");
  details.className = "gc-two-page-detail";
  const summary = document.createElement("summary");
  summary.textContent = "詳細";
  const body = document.createElement("div");
  body.className = "gc-two-page-detail-body";
  const p = row?.procurement;
  if (p?.status === "ready_now") {
    body.textContent = "必要数を所持しているため追加調達は不要です。";
  } else if (kind === "crafting" && p?.status === "ok") {
    const grid = document.createElement("div");
    grid.className = "gc-two-page-detail-grid";
    addDetailStat(grid, "マケボで買う", gilText(p.market_buy));
    addDetailStat(grid, "原材料から作る", gilText(p.craft_raw));
    body.append(grid);
    const mats = (p.craft_raw?.materials || []).filter(row => Number(row?.quantity) > 0);
    const material = document.createElement("div");
    material.className = "gc-two-page-materials";
    material.textContent = mats.length
      ? `製作素材：${mats.map(m => `${m.item_name} ×${formatNumber(m.quantity)}${m.total_gil == null ? "" : `（約${formatNumber(m.total_gil)}G）`}`).join(" / ")}`
      : "製作素材：購入素材なし";
    body.append(material);
  } else if (kind === "gathering") {
    body.textContent = "採集ページの品です。必要数と所持数を見て、自力採集またはマケボ補充を選びます。製作レシピとしては扱いません。";
  } else {
    body.textContent = "価格またはレシピを安全に特定できませんでした。ゲーム内で確認してください。";
  }
  if (recommendation?.row_index === row.row_index && recommendation?.item_name === row.item_name && recommendation?.reason) {
    const note = document.createElement("p");
    note.className = "gc-two-page-note";
    note.textContent = recommendation.reason;
    body.append(note);
  }
  details.append(summary, body);
  return details;
}

function buildCategory(kind, rows, recommendation) {
  const section = document.createElement("section");
  section.className = "gc-category-block";
  section.dataset.gcCategory = kind;
  const head = document.createElement("div");
  head.className = "gc-category-head";
  const h3 = document.createElement("h3");
  h3.textContent = kind === "crafting" ? "製作一覧（軍需品調達）" : "採集一覧（補給品調達）";
  const count = document.createElement("span");
  count.textContent = `${rows.length}件`;
  head.append(h3, count);
  section.append(head);

  if (!rows.length) {
    const empty = document.createElement("div");
    empty.className = "gc-category-empty";
    empty.textContent = kind === "crafting"
      ? "製作ページは未登録です。① 製作ページを貼ってください。"
      : "採集ページは未登録です。② 採集ページを貼ってください。";
    section.append(empty);
    return section;
  }

  const wrap = document.createElement("div");
  wrap.className = "gc-two-page-table-wrap";
  const table = document.createElement("table");
  table.className = "gc-two-page-table";
  const thead = document.createElement("thead");
  thead.innerHTML = "<tr><th>納品品</th><th>必要 / 所持</th><th>ボーナス</th><th>調達目安</th><th>概算</th><th></th></tr>";
  const tbody = document.createElement("tbody");
  for (const row of rows) {
    const tr = document.createElement("tr");
    const item = document.createElement("td");
    const itemTop = document.createElement("div");
    itemTop.className = "gc-two-page-item";
    const strong = document.createElement("strong");
    strong.textContent = row.item_name || "品名未確認";
    strong.setAttribute("data-gc-delivery-item", "");
    itemTop.append(strong);
    if (recommendation?.row_index === row.row_index && recommendation?.item_name === row.item_name) {
      const badge = document.createElement("span");
      badge.className = "gc-two-page-rec";
      badge.textContent = "おすすめ";
      itemTop.append(badge);
    }
    item.append(itemTop);
    const qty = document.createElement("td"); qty.textContent = quantityText(row);
    const bonus = document.createElement("td"); bonus.textContent = row.starred ? "★" : (row.bonus_text || "—");
    const proc = procurementSummary(row, kind);
    const route = document.createElement("td"); route.textContent = proc.label;
    const gil = document.createElement("td"); gil.textContent = proc.gil;
    const action = document.createElement("td"); action.append(buildDetail(row, kind, recommendation));
    tr.append(item, qty, bonus, route, gil, action);
    tbody.append(tr);
  }
  table.append(thead, tbody);
  wrap.append(table);
  section.append(wrap);
  return section;
}

function renderSeparateLists(deliveryData, costData) {
  const body = gcContent()?.querySelector("[data-gc-body]");
  if (!body) return;
  const costRows = Array.isArray(costData?.deliveries) ? costData.deliveries : [];
  const evidenceRows = Array.isArray(deliveryData?.deliveries) ? deliveryData.deliveries : [];
  const rows = costRows.some(row => row?.page_kind) ? costRows : evidenceRows;
  if (!rows.some(row => row?.page_kind)) return;
  const crafting = rows.filter(row => row.page_kind === "crafting");
  const gathering = rows.filter(row => row.page_kind === "gathering");
  const recommendation = costData?.recommendation || deliveryData?.recommended || null;

  body.replaceChildren();
  const container = document.createElement("div");
  container.className = "gc-two-page-lists";
  container.setAttribute("data-gc-two-page-lists", "");
  const lead = document.createElement("div");
  lead.className = "gc-category-head";
  const title = document.createElement("h3");
  title.textContent = "今日の納品一覧";
  const note = document.createElement("span");
  note.textContent = "製作と採集を別々に表示";
  lead.append(title, note);
  container.append(lead, buildCategory("crafting", crafting, recommendation), buildCategory("gathering", gathering, recommendation));
  const foot = document.createElement("p");
  foot.className = "gc-two-page-note";
  foot.textContent = "2枚は別保存です。片方を貼り直しても、もう片方の一覧は保持します。どこまで納品するかは自分で決められます。";
  container.append(foot);
  body.append(container);
}

async function fetchJson(path) {
  const response = await fetch(path, { headers: { "x-profile-token": profileToken() } });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

function deliveryFingerprint(deliveryData) {
  const rows = Array.isArray(deliveryData?.deliveries) ? deliveryData.deliveries : [];
  return JSON.stringify({
    observed_at: deliveryData?.observed_at || "",
    page_status: deliveryData?.page_status || {},
    rows: rows.map(row => [
      row?.page_kind || "",
      Number(row?.row_index ?? -1),
      String(row?.item_name || ""),
      Number(row?.requested_quantity ?? -1),
      Number(row?.owned_quantity ?? -1),
      Boolean(row?.starred)
    ])
  });
}

function invalidateCostCache() {
  cachedCostFingerprint = "";
  cachedCostData = null;
  costFailure = { fingerprint: "", retryAfter: 0 };
}

async function costDataFor(deliveryData, { force = false } = {}) {
  const fingerprint = deliveryFingerprint(deliveryData);
  if (!force && cachedCostData && cachedCostFingerprint === fingerprint) return cachedCostData;
  if (!force && costFailure.fingerprint === fingerprint && Date.now() < costFailure.retryAfter) return null;
  if (costRequestInFlight?.fingerprint === fingerprint) return costRequestInFlight.promise;

  const promise = fetchJson("/api/grand-company/delivery-costs")
    .then(data => {
      cachedCostFingerprint = fingerprint;
      cachedCostData = data;
      costFailure = { fingerprint: "", retryAfter: 0 };
      return data;
    })
    .catch(() => {
      costFailure = { fingerprint, retryAfter: Date.now() + COST_RETRY_COOLDOWN_MS };
      return null;
    })
    .finally(() => {
      if (costRequestInFlight?.fingerprint === fingerprint) costRequestInFlight = null;
    });
  costRequestInFlight = { fingerprint, promise };
  return promise;
}

async function refreshAll({ forceCost = false } = {}) {
  if (refreshing) return;
  const gc = gcContent();
  if (!gc || gc.hidden) return;
  refreshing = true;
  try {
    const deliveryData = await fetchJson("/api/grand-company/deliveries");
    updateCaptureStatus(deliveryData);
    const costData = await costDataFor(deliveryData, { force: forceCost });
    renderSeparateLists(deliveryData, costData);
  } catch {
    ensureCapturePanel();
  } finally {
    refreshing = false;
  }
}

function overrideSavedMessage(kind) {
  const status = document.getElementById("contextInboxStatus");
  if (!status) return;
  if (kind === "crafting") {
    status.textContent = "製作ページを保存しました。次に② 採集ページを貼ってください。";
  } else {
    status.textContent = "採集ページを保存しました。製作ページとは別に保持しています。";
  }
  status.dataset.kind = "success";
}

function boot() {
  ensureStyles();
  for (const delay of [0, 100, 400, 1000, 2200, 4500]) setTimeout(() => void refreshAll(), delay);

  window.addEventListener("ff14today:context-saved", event => {
    if (event?.detail?.pageType !== "grand_company_deliveries") return;
    const kind = inbox()?.dataset?.gcPageKind || (lastKnownStatus.crafting ? "gathering" : "crafting");
    overrideSavedMessage(kind);
    invalidateCostCache();
    setTimeout(() => void refreshAll({ forceCost: true }), 120);
    setTimeout(() => void refreshAll(), 1200);
  });

  document.addEventListener("click", event => {
    if (event.target?.closest?.("[data-gc-refresh]")) {
      invalidateCostCache();
      setTimeout(() => void refreshAll({ forceCost: true }), 80);
      return;
    }
    if (event.target?.closest?.("[data-gc-open]")) setTimeout(() => void refreshAll(), 30);
  });

  document.addEventListener("paste", () => {
    const gc = gcContent();
    if (!gc || gc.hidden) return;
    setTimeout(() => void refreshAll(), 1800);
    setTimeout(() => void refreshAll(), 4200);
  });

  setInterval(() => {
    const gc = gcContent();
    if (!gc || gc.hidden) return;
    if (!gc.querySelector("[data-gc-page-capture]") || (lastKnownStatus.crafting || lastKnownStatus.gathering) && !gc.querySelector("[data-gc-two-page-lists]")) {
      void refreshAll();
    }
  }, 3000);
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
else boot();

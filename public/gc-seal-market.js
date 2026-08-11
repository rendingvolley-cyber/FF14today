let loading = false;
let loadedOnce = false;
const PROFILE_TOKEN_KEY = "ff14_today_profile_token_v1";
let deliveryCostLoading = false;
let deliveryCostLoadedSignature = "";
let deliveryCostAttemptedSignature = "";

function rootPanel() {
  return document.getElementById("retainerAdvice");
}

function gcContent() {
  return rootPanel()?.querySelector("[data-gc-content]") || null;
}

function formatNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n).toLocaleString("ja-JP") : "—";
}

function formatDecimal(value, digits = 1) {
  const n = Number(value);
  return Number.isFinite(n) ? n.toLocaleString("ja-JP", { maximumFractionDigits: digits }) : "—";
}

function ensureSection() {
  const gc = gcContent();
  if (!gc) return null;
  let section = gc.querySelector("[data-gc-seal-market]");
  if (section) return section;
  section = document.createElement("section");
  section.className = "gc-seal-market";
  section.setAttribute("data-gc-seal-market", "");
  section.innerHTML = `
    <div class="gc-seal-market-head">
      <div>
        <p class="gc-kicker">軍票の使い道</p>
        <h3>300個出す前提で、売れ筋順に比較</h3>
      </div>
      <button type="button" class="retainer-refresh" data-gc-seal-refresh>市場を再確認</button>
    </div>
    <div data-gc-seal-body><div class="retainer-setup">Chocoboの実売データを確認中…</div></div>
  `;
  const actions = gc.querySelector(".retainer-actions");
  if (actions) gc.insertBefore(section, actions);
  else gc.append(section);
  section.querySelector("[data-gc-seal-refresh]")?.addEventListener("click", () => void loadRecommendations({ force: true }));
  return section;
}

function sellBatchDaysText(row) {
  const days = Number(row?.estimated_days_to_sell_batch);
  if (!Number.isFinite(days)) return "—";
  if (days < 1) return `約${formatDecimal(days, 2)}日`;
  return `約${formatDecimal(days, 1)}日`;
}

function buildSealTableRow(row, featured = false) {
  const tr = document.createElement("tr");
  if (featured) tr.className = "featured";

  const item = document.createElement("td");
  const top = document.createElement("div");
  top.className = "gc-seal-table-item";
  const rank = document.createElement("span");
  rank.className = "gc-seal-rank";
  rank.textContent = `#${row.rank || "?"}`;
  const name = document.createElement("strong");
  name.textContent = row.item_name || row.item_name_en || "交換品";
  top.append(rank, name);
  if (featured) {
    const badge = document.createElement("span");
    badge.className = "gc-seal-best";
    badge.textContent = "300個向け1位";
    top.append(badge);
  }
  const seal = document.createElement("small");
  seal.textContent = `${formatNumber(row.seal_cost)}軍票 → ${formatNumber(row.exchange_quantity)}個`;
  item.append(top, seal);

  const velocity = document.createElement("td");
  velocity.innerHTML = `<strong>${formatDecimal(row.daily_sale_velocity)}個</strong>`;
  const batch = document.createElement("td");
  batch.innerHTML = `<strong>${sellBatchDaysText(row)}</strong>`;
  const price = document.createElement("td");
  price.innerHTML = `<strong>${formatNumber(row.average_sale_price)}G</strong><small> / 個</small>`;
  const efficiency = document.createElement("td");
  efficiency.innerHTML = `<strong>${formatNumber(row.estimated_gil_per_1000_seals)}G</strong>`;
  const supply = document.createElement("td");
  supply.innerHTML = `<strong>${row.estimated_days_supply == null ? "—" : `${formatDecimal(row.estimated_days_supply)}日`}</strong>`;
  tr.append(item, velocity, batch, price, efficiency, supply);
  return tr;
}

function render(data) {
  const section = ensureSection();
  const body = section?.querySelector("[data-gc-seal-body]");
  if (!body) return;
  const rows = Array.isArray(data?.recommendations) ? data.recommendations : [];
  body.replaceChildren();
  if (!rows.length) {
    const setup = document.createElement("div");
    setup.className = "retainer-setup";
    setup.textContent = data?.message || "300個規模でおすすめできる軍票交換品がありません。";
    body.append(setup);
    return;
  }

  const intro = document.createElement("p");
  intro.className = "gc-seal-batch-intro";
  intro.textContent = `約${formatNumber(data?.sell_batch_quantity || 300)}個を出す想定。市場全体の1日実売数が多い順で、極端に安い品は候補から外しています。`;
  body.append(intro);

  const wrap = document.createElement("div");
  wrap.className = "gc-seal-table-wrap";
  const table = document.createElement("table");
  table.className = "gc-seal-table";
  table.innerHTML = `
    <thead><tr>
      <th>交換品</th><th>1日実売</th><th>300個吸収目安</th><th>平均実売</th><th>軍票1,000</th><th>現出品</th>
    </tr></thead>
  `;
  const tbody = document.createElement("tbody");
  rows.forEach((row, index) => tbody.append(buildSealTableRow(row, index === 0)));
  table.append(tbody);
  wrap.append(table);
  body.append(wrap);

  const note = document.createElement("p");
  note.className = "retainer-market-note";
  const age = Number.isFinite(Number(data?.cache_age_minutes)) ? `・更新${Number(data.cache_age_minutes)}分前` : "";
  note.textContent = `Chocobo / Universalisの実売・出品データ${age}。300個吸収目安は「300 ÷ 市場全体の1日実売数」の比較値で、自分の300個が同じ日数で必ず売れる保証ではありません。現在の出品日数も併せて確認してください。`;
  body.append(note);
}

async function loadRecommendations({ force = false } = {}) {
  if (loading || (loadedOnce && !force)) return;
  const section = ensureSection();
  if (!section) return;
  loading = true;
  const button = section.querySelector("[data-gc-seal-refresh]");
  if (button) {
    button.disabled = true;
    button.textContent = "確認中…";
  }
  try {
    const response = await fetch("/api/grand-company/seal-exchange-recommendations");
    const data = await response.json();
    if (!response.ok) throw new Error(data?.error || `HTTP ${response.status}`);
    render(data);
    loadedOnce = true;
  } catch (error) {
    render({ recommendations: [], message: `軍票交換候補の確認に失敗しました：${error.message}` });
  } finally {
    loading = false;
    if (button) {
      button.disabled = false;
      button.textContent = "市場を再確認";
    }
  }
}

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

function deliverySignatureFromDom() {
  const body = gcContent()?.querySelector("[data-gc-body]");
  if (!body) return "";
  const compactNames = [...body.querySelectorAll("[data-gc-delivery-item]")]
    .map(node => node.textContent?.trim()).filter(Boolean);
  if (compactNames.length) return compactNames.join("|");
  const legacyNames = [...body.querySelectorAll(".gc-delivery-top strong")]
    .map(node => node.textContent?.trim()).filter(Boolean);
  return legacyNames.join("|");
}

function quantityText(row) {
  const requested = Number.isInteger(Number(row?.requested_quantity)) ? Number(row.requested_quantity) : null;
  const owned = Number.isInteger(Number(row?.owned_quantity)) ? Number(row.owned_quantity) : null;
  if (requested !== null && owned !== null) return `必要 ${requested} / 所持 ${owned}`;
  if (requested !== null) return `必要 ${requested}`;
  return "数量はゲーム画面で確認";
}

function gilText(route) {
  if (!route) return "比較できず";
  if (route.available === false || route.gil == null) return "価格不足";
  return `約${formatNumber(route.gil)}G`;
}

function materialText(materials) {
  const rows = (Array.isArray(materials) ? materials : []).filter(row => Number(row?.quantity) > 0);
  if (!rows.length) return "購入素材なし";
  return rows.map(row => {
    const price = row.total_gil == null ? "" : `（約${formatNumber(row.total_gil)}G）`;
    return `${row.item_name} ×${formatNumber(row.quantity)}${price}`;
  }).join(" / ");
}

function costBox(label, value, recommended = false) {
  const box = document.createElement("div");
  box.className = `gc-cost-box${recommended ? " recommended" : ""}`;
  const small = document.createElement("small");
  small.textContent = label;
  const strong = document.createElement("strong");
  strong.textContent = value;
  box.append(small, strong);
  return box;
}

function procurementSummary(row) {
  const procurement = row?.procurement;
  if (procurement?.status === "ready_now") return { label: "手持ちで納品", gil: "0G" };
  if (procurement?.status === "ok" && procurement.recommended_route) {
    return { label: procurement.recommended_route.label || "おすすめ調達", gil: gilText(procurement.recommended_route) };
  }
  return { label: "比較できず", gil: "—" };
}

function buildCostDetail(row, recommendation) {
  const featured = recommendation?.row_index === row.row_index && recommendation?.item_name === row.item_name;
  const panel = document.createElement("div");
  panel.className = "gc-cost-detail-panel";
  const procurement = row.procurement;

  if (procurement?.status === "ready_now") {
    const grid = document.createElement("div");
    grid.className = "gc-cost-grid";
    grid.append(costBox("追加調達", "0G・手持ちで納品", true));
    panel.append(grid);
  } else if (procurement?.status === "ok") {
    const grid = document.createElement("div");
    grid.className = "gc-cost-grid";
    grid.append(
      costBox("マケボで買う", gilText(procurement.market_buy)),
      costBox("原材料から作る", gilText(procurement.craft_raw)),
      costBox("調達おすすめ", procurement.recommended_route ? `${procurement.recommended_route.label}・${gilText(procurement.recommended_route)}` : "比較できず", true)
    );
    panel.append(grid);

    if (procurement.craft_raw) {
      const materials = document.createElement("div");
      materials.className = "gc-cost-materials";
      const label = document.createElement("strong");
      label.textContent = "製作素材：";
      materials.append(label, document.createTextNode(materialText(procurement.craft_raw.materials)));
      panel.append(materials);
    }
    if (procurement.quantity_basis === "requested_quantity") {
      const note = document.createElement("p");
      note.className = "gc-cost-note";
      note.textContent = "所持数を安全に読めなかったため、必要数全量を調達する前提で比較しています。";
      panel.append(note);
    }
  } else {
    const note = document.createElement("p");
    note.className = "gc-cost-note";
    note.textContent = "この品は価格またはレシピを安全に特定できなかったため、ゲーム内で確認してください。";
    panel.append(note);
  }

  if (featured && recommendation?.reason) {
    const reason = document.createElement("p");
    reason.className = "gc-delivery-reason";
    reason.textContent = recommendation.reason;
    panel.append(reason);
  }
  return panel;
}

function buildCostTableRows(row, recommendation, index) {
  const featured = recommendation?.row_index === row.row_index && recommendation?.item_name === row.item_name;
  const summary = procurementSummary(row);
  const tr = document.createElement("tr");
  tr.className = `gc-delivery-table-row${featured ? " featured" : ""}`;

  const itemCell = document.createElement("td");
  const itemTop = document.createElement("div");
  itemTop.className = "gc-delivery-table-item";
  const name = document.createElement("strong");
  name.textContent = row.item_name || "品名未確認";
  name.setAttribute("data-gc-delivery-item", "");
  itemTop.append(name);
  if (featured) {
    const badge = document.createElement("span");
    badge.className = "gc-delivery-recommended";
    badge.textContent = "おすすめ";
    itemTop.append(badge);
  }
  if (row.class_or_job) {
    const sub = document.createElement("small");
    sub.textContent = row.class_or_job;
    itemCell.append(itemTop, sub);
  } else itemCell.append(itemTop);

  const quantityCell = document.createElement("td");
  quantityCell.textContent = quantityText(row);
  const bonusCell = document.createElement("td");
  bonusCell.textContent = row.starred ? `★ ${row.bonus_text || "ボーナス"}` : (row.bonus_text || "—");
  const routeCell = document.createElement("td");
  routeCell.textContent = summary.label;
  const gilCell = document.createElement("td");
  gilCell.innerHTML = `<strong>${summary.gil}</strong>`;
  const actionCell = document.createElement("td");
  const button = document.createElement("button");
  button.type = "button";
  button.className = "gc-detail-toggle";
  button.textContent = "詳細";
  const detailId = `gc-delivery-detail-${index}`;
  button.setAttribute("aria-controls", detailId);
  button.setAttribute("aria-expanded", "false");
  actionCell.append(button);
  tr.append(itemCell, quantityCell, bonusCell, routeCell, gilCell, actionCell);

  const detailTr = document.createElement("tr");
  detailTr.className = "gc-delivery-detail-row";
  detailTr.id = detailId;
  detailTr.hidden = true;
  const detailCell = document.createElement("td");
  detailCell.colSpan = 6;
  detailCell.append(buildCostDetail(row, recommendation));
  detailTr.append(detailCell);

  button.addEventListener("click", () => {
    const open = detailTr.hidden;
    detailTr.hidden = !open;
    button.setAttribute("aria-expanded", open ? "true" : "false");
    button.textContent = open ? "閉じる" : "詳細";
  });

  return [tr, detailTr];
}

function renderDeliveryCosts(data) {
  const gc = gcContent();
  const body = gc?.querySelector("[data-gc-body]");
  if (!gc || !body) return;
  const rows = Array.isArray(data?.deliveries) ? data.deliveries : [];
  if (!rows.length) return;

  const sub = gc.querySelector(".retainer-advice-sub");
  if (sub) sub.textContent = "今日の納品一覧を表で確認し、必要な品だけ詳細を開いてマケボ購入と製作コストを比較できます。どこまで納品するかは自分で決めます。";

  body.replaceChildren();
  const head = document.createElement("div");
  head.className = "gc-all-list-head";
  const text = document.createElement("div");
  const kicker = document.createElement("p");
  kicker.className = "gc-kicker";
  kicker.textContent = "今日の納品一覧";
  const title = document.createElement("h3");
  title.textContent = `${rows.length}件を比較`;
  const desc = document.createElement("p");
  desc.textContent = "一覧で選び、価格・製作素材は「詳細」で確認。おすすめは目安です。";
  text.append(kicker, title, desc);
  head.append(text);
  body.append(head);

  const wrap = document.createElement("div");
  wrap.className = "gc-delivery-table-wrap";
  const table = document.createElement("table");
  table.className = "gc-delivery-table";
  table.innerHTML = `
    <thead><tr>
      <th>納品品</th><th>必要 / 所持</th><th>ボーナス</th><th>調達おすすめ</th><th>概算</th><th></th>
    </tr></thead>
  `;
  const tbody = document.createElement("tbody");
  rows.forEach((row, index) => tbody.append(...buildCostTableRows(row, data?.recommendation, index)));
  table.append(tbody);
  wrap.append(table);
  body.append(wrap);

  const note = document.createElement("p");
  note.className = "retainer-market-note";
  const age = Number.isFinite(Number(data?.market_age_minutes)) ? `・市場更新 約${Number(data.market_age_minutes)}分前` : "";
  note.textContent = `Chocobo / Universalisの現在出品数量を必要数まで積み上げて概算${age}。レシピはXIVAPI v2から安全に特定できた品だけ表示します。`;
  body.append(note);
}

async function loadDeliveryCosts({ force = false } = {}) {
  const gc = gcContent();
  if (!gc || gc.hidden || deliveryCostLoading) return;
  const signature = deliverySignatureFromDom();
  if (!signature) return;
  if (!force && (signature === deliveryCostLoadedSignature || signature === deliveryCostAttemptedSignature)) return;
  deliveryCostLoading = true;
  deliveryCostAttemptedSignature = signature;
  try {
    const response = await fetch("/api/grand-company/delivery-costs", {
      headers: { "x-profile-token": profileToken() }
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data?.error || `HTTP ${response.status}`);
    if (data?.cost_advice && Array.isArray(data.deliveries) && data.deliveries.length) {
      renderDeliveryCosts(data);
      deliveryCostLoadedSignature = data.deliveries.map(row => row.item_name).filter(Boolean).join("|");
    }
  } catch {
    // Keep the already-rendered delivery list usable. Manual refresh can retry.
  } finally {
    deliveryCostLoading = false;
  }
}

function reconcileDeliveryCosts() {
  const gc = gcContent();
  if (!gc || gc.hidden) return;
  const signature = deliverySignatureFromDom();
  if (signature && signature !== deliveryCostLoadedSignature && signature !== deliveryCostAttemptedSignature) {
    void loadDeliveryCosts();
  }
}

function boot() {
  for (const delay of [0, 80, 250, 800, 1800]) {
    setTimeout(() => {
      if (ensureSection()) void loadRecommendations();
      reconcileDeliveryCosts();
    }, delay);
  }
  document.addEventListener("click", event => {
    if (event.target?.closest?.("[data-gc-open]")) {
      setTimeout(() => {
        if (ensureSection()) void loadRecommendations();
        reconcileDeliveryCosts();
      }, 0);
    }
    if (event.target?.closest?.("[data-gc-refresh]")) {
      deliveryCostLoadedSignature = "";
      deliveryCostAttemptedSignature = "";
      setTimeout(() => void loadDeliveryCosts({ force: true }), 900);
    }
  });
  document.addEventListener("paste", () => {
    const gc = gcContent();
    if (!gc || gc.hidden) return;
    deliveryCostLoadedSignature = "";
    deliveryCostAttemptedSignature = "";
    setTimeout(() => reconcileDeliveryCosts(), 1800);
    setTimeout(() => reconcileDeliveryCosts(), 4200);
  });
  setInterval(reconcileDeliveryCosts, 1500);
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
else boot();

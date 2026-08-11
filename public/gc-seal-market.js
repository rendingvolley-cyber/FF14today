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

function formatDecimal(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n.toLocaleString("ja-JP", { maximumFractionDigits: 1 }) : "—";
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
        <h3>よく売れる交換品を優先する</h3>
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

function stat(label, value) {
  const span = document.createElement("span");
  span.className = "gc-seal-stat";
  const small = document.createElement("small");
  small.textContent = label;
  const strong = document.createElement("strong");
  strong.textContent = value;
  span.append(small, strong);
  return span;
}

function buildRecommendation(row, featured = false) {
  const article = document.createElement("article");
  article.className = `gc-seal-item${featured ? " featured" : ""}`;
  const top = document.createElement("div");
  top.className = "gc-seal-item-top";
  const rank = document.createElement("span");
  rank.className = "gc-seal-rank";
  rank.textContent = `#${row.rank || "?"}`;
  const name = document.createElement("strong");
  name.textContent = row.item_name || row.item_name_en || "交換品";
  top.append(rank, name);
  if (featured) {
    const badge = document.createElement("span");
    badge.className = "gc-seal-best";
    badge.textContent = "よく売れるのでこれ";
    top.append(badge);
  }
  const stats = document.createElement("div");
  stats.className = "gc-seal-stats";
  stats.append(
    stat("必要軍票", `${formatNumber(row.seal_cost)} → ${formatNumber(row.exchange_quantity)}個`),
    stat("1日実売", `${formatDecimal(row.daily_sale_velocity)}個`),
    stat("平均実売", `${formatNumber(row.average_sale_price)}ギル/個`),
    stat("軍票1,000あたり", `約${formatNumber(row.estimated_gil_per_1000_seals)}ギル`)
  );
  article.append(top, stats);
  if (featured) {
    const reason = document.createElement("p");
    reason.className = "gc-seal-reason";
    const days = row.estimated_days_supply == null ? "在庫日数不明" : `出品在庫は約${formatDecimal(row.estimated_days_supply)}日分`;
    reason.textContent = `売れ行きを最優先した総合スコア ${formatDecimal(row.score)}。1日実売 ${formatDecimal(row.daily_sale_velocity)}個、${days}。最安出品 ${formatNumber(row.minimum_listing_price)}ギル。`;
    article.append(reason);
  }
  return article;
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
    setup.textContent = data?.message || "現在おすすめできる軍票交換品がありません。";
    body.append(setup);
    return;
  }
  const lead = document.createElement("div");
  lead.className = "gc-seal-lead";
  lead.append(buildRecommendation(rows[0], true));
  body.append(lead);
  if (rows.length > 1) {
    const details = document.createElement("details");
    details.className = "gc-seal-alternatives";
    const summary = document.createElement("summary");
    summary.textContent = `次点 ${rows.length - 1}件`;
    details.append(summary);
    const list = document.createElement("div");
    list.className = "gc-seal-list";
    for (const row of rows.slice(1)) list.append(buildRecommendation(row));
    details.append(list);
    body.append(details);
  }
  const note = document.createElement("p");
  note.className = "retainer-market-note";
  const age = Number.isFinite(Number(data?.cache_age_minutes)) ? `・更新${Number(data.cache_age_minutes)}分前` : "";
  note.textContent = `Chocobo / Universalisの実売・出品データ${age}。売れ行きが弱い交換品は候補から外し、販売速度を軍票効率より強く評価しています。`;
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
  const names = [...body.querySelectorAll(".gc-delivery-top strong")].map(node => node.textContent?.trim()).filter(Boolean);
  return names.join("|");
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

function buildCostDelivery(row, recommendation) {
  const featured = recommendation?.row_index === row.row_index && recommendation?.item_name === row.item_name;
  const article = document.createElement("article");
  article.className = `gc-delivery${featured ? " featured" : ""}`;

  const top = document.createElement("div");
  top.className = "gc-delivery-top";
  const name = document.createElement("strong");
  name.textContent = row.item_name || "品名未確認";
  top.append(name);
  if (row.starred) {
    const star = document.createElement("span");
    star.className = "gc-star";
    star.textContent = "★ ボーナス";
    top.append(star);
  }
  if (featured) {
    const badge = document.createElement("span");
    badge.className = "gc-delivery-recommended";
    badge.textContent = "おすすめ";
    top.append(badge);
  }

  const meta = document.createElement("div");
  meta.className = "gc-delivery-meta";
  for (const text of [row.class_or_job, quantityText(row), row.reward_text].filter(Boolean)) {
    const span = document.createElement("span");
    span.textContent = text;
    meta.append(span);
  }
  article.append(top, meta);

  const procurement = row.procurement;
  if (procurement?.status === "ready_now") {
    const grid = document.createElement("div");
    grid.className = "gc-cost-grid";
    grid.append(costBox("追加調達", "0G・手持ちで納品", true));
    article.append(grid);
  } else if (procurement?.status === "ok") {
    const grid = document.createElement("div");
    grid.className = "gc-cost-grid";
    grid.append(
      costBox("マケボで買う", gilText(procurement.market_buy)),
      costBox("原材料から作る", gilText(procurement.craft_raw)),
      costBox("調達おすすめ", procurement.recommended_route ? `${procurement.recommended_route.label}・${gilText(procurement.recommended_route)}` : "比較できず", true)
    );
    article.append(grid);

    if (procurement.craft_raw) {
      const materials = document.createElement("div");
      materials.className = "gc-cost-materials";
      const label = document.createElement("strong");
      label.textContent = "製作素材：";
      materials.append(label, document.createTextNode(materialText(procurement.craft_raw.materials)));
      article.append(materials);
    }
    if (procurement.quantity_basis === "requested_quantity") {
      const note = document.createElement("p");
      note.className = "gc-cost-note";
      note.textContent = "所持数を安全に読めなかったため、必要数全量を調達する前提で比較しています。";
      article.append(note);
    }
  } else {
    const note = document.createElement("p");
    note.className = "gc-cost-note";
    note.textContent = "この品は価格またはレシピを安全に特定できなかったため、ゲーム内で確認してください。";
    article.append(note);
  }

  if (featured && recommendation?.reason) {
    const reason = document.createElement("p");
    reason.className = "gc-delivery-reason";
    reason.textContent = recommendation.reason;
    article.append(reason);
  }
  return article;
}

function renderDeliveryCosts(data) {
  const gc = gcContent();
  const body = gc?.querySelector("[data-gc-body]");
  if (!gc || !body) return;
  const rows = Array.isArray(data?.deliveries) ? data.deliveries : [];
  if (!rows.length) return;

  const sub = gc.querySelector(".retainer-advice-sub");
  if (sub) sub.textContent = "今日の納品一覧を全部表示し、マケボ購入と製作コストを比較します。どこまで納品するかは自分で決められます。";

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
  desc.textContent = "おすすめは目安です。納品する件数・どこまでやるかは自分で決めます。";
  text.append(kicker, title, desc);
  head.append(text);
  body.append(head);

  const list = document.createElement("div");
  list.className = "gc-all-list";
  for (const row of rows) list.append(buildCostDelivery(row, data?.recommendation));
  body.append(list);

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

const PROFILE_TOKEN_KEY = "ff14_today_profile_token_v1";
const TASK_BY_TITLE = [
  ["Ginseng Angle Brush", "craft:alc90:leve:ginseng-angle-brush"],
  ["Growth Formula Lambda", "craft:alc90:leve:growth-formula-lambda"]
];

const cache = new Map();
let refreshQueued = false;
let contextRevision = 0;

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

function taskKeyFromTitle(title) {
  return TASK_BY_TITLE.find(([needle]) => String(title || "").includes(needle))?.[1] || null;
}

function currentEnergy() {
  const active = document.querySelector("#energyChoices button.active[data-energy]");
  const value = Number(active?.dataset.energy);
  return Number.isFinite(value) ? value : 3;
}

function currentMinutes() {
  const remainingText = document.getElementById("sessionRemaining")?.textContent || "";
  const remaining = remainingText.match(/(\d+)\s*分/);
  if (remaining) return Math.max(5, Number(remaining[1]));
  const active = document.querySelector("#timeChoices button.active[data-minutes]");
  const value = Number(active?.dataset.minutes);
  return Number.isFinite(value) ? value : 60;
}

function formatGil(value) {
  const n = Number(value);
  return Number.isFinite(n) ? `${Math.round(n).toLocaleString("ja-JP")}G` : "価格不足";
}

function routeMeta(route) {
  const inventoryApplied = Boolean(route?.inventoryEvidenceApplied);
  const money = inventoryApplied
    ? `追加支出 ${formatGil(route.additionalGil)} · 実質コスト ${formatGil(route.gil)}`
    : formatGil(route.gil);
  return `${money} · 準備目安 ${route.estimatedMinutes}分 · 製作 ${route.craftCount}回`;
}

function purchaseText(row) {
  const base = `${row.itemName}${row.hq ? " HQ" : ""} ×${row.quantity}`;
  const held = Number(row.heldQuantity);
  const buy = Number(row.buyQuantity);
  if (!Number.isFinite(held) || !Number.isFinite(buy)) return base;
  if (held <= 0) return buy === Number(row.quantity) ? base : `${base}（買う${Math.max(0, buy)}）`;
  return `${base}（手持ち${Math.max(0, held)} / 買う${Math.max(0, buy)}）`;
}

function actionText(rows, kind) {
  if (!Array.isArray(rows) || !rows.length) return kind === "buy" ? "買うものなし" : "製作なし";
  return rows.map(row => {
    if (kind === "buy") return purchaseText(row);
    return `${row.itemName} ×${row.syntheses}回`;
  }).join(" / ");
}

function ensurePanel(card) {
  let panel = card.querySelector(".leve-cost-advice");
  if (panel) return panel;
  panel = document.createElement("section");
  panel.className = "leve-cost-advice";
  panel.setAttribute("aria-live", "polite");
  const anchor = card.querySelector(".focus-flow-actions") || card.querySelector("[data-complete-current]");
  if (anchor) card.insertBefore(panel, anchor);
  else card.append(panel);
  return panel;
}

function renderLoading(panel) {
  panel.replaceChildren();
  const label = document.createElement("p");
  label.className = "leve-cost-kicker";
  label.textContent = "調達方法もこちらで決める";
  const text = document.createElement("p");
  text.className = "leve-cost-loading";
  text.textContent = "Chocobo市場と今日の手持ちを比較中…";
  panel.append(label, text);
}

function renderError(panel) {
  panel.replaceChildren();
  const label = document.createElement("p");
  label.className = "leve-cost-kicker";
  label.textContent = "調達方法";
  const text = document.createElement("p");
  text.className = "leve-cost-error";
  text.textContent = "市場比較は今は取得できません。リーヴ自体はそのまま進めてOKです。";
  panel.append(label, text);
}

function appendInventoryEconomics(panel, recommended, payload) {
  const evidence = payload?.inventory_evidence;
  if (evidence?.applied) {
    const economics = document.createElement("div");
    economics.className = "leve-cost-inventory-economics";

    const cash = document.createElement("div");
    cash.innerHTML = `<span>今払う追加支出</span><strong>${formatGil(recommended.additionalGil)}</strong>`;
    const effective = document.createElement("div");
    effective.innerHTML = `<span>実質コスト</span><strong>${formatGil(recommended.gil)}</strong>`;
    economics.append(cash, effective);

    if (Number(recommended.inventoryOpportunityGil) > 0) {
      const held = document.createElement("p");
      held.className = "leve-cost-held-value";
      held.textContent = `手持ち利用 ${formatGil(recommended.inventoryOpportunityGil)}相当`;
      economics.append(held);
    }
    panel.append(economics);
    return;
  }

  const prompt = document.createElement("p");
  prompt.className = "leve-cost-inventory-prompt";
  prompt.textContent = "素材名と所持数が見えるスクショをCtrl+Vすると、追加支出を手持ち込みで再計算します。";
  panel.append(prompt);
}

function renderAdvice(panel, payload) {
  const advice = payload?.advice;
  const recommended = advice?.routes?.find(route => route.key === advice.recommendedKey);
  if (!advice || !recommended) {
    renderError(panel);
    return;
  }
  panel.replaceChildren();

  const head = document.createElement("div");
  head.className = "leve-cost-head";
  const copy = document.createElement("div");
  const kicker = document.createElement("p");
  kicker.className = "leve-cost-kicker";
  kicker.textContent = "今日の作り方";
  const title = document.createElement("strong");
  title.className = "leve-cost-title";
  title.textContent = recommended.label;
  copy.append(kicker, title);
  const pill = document.createElement("span");
  pill.className = "leve-cost-pill";
  pill.textContent = "これで行く";
  head.append(copy, pill);

  const meta = document.createElement("p");
  meta.className = "leve-cost-meta";
  meta.textContent = routeMeta(recommended);
  const reason = document.createElement("p");
  reason.className = "leve-cost-reason";
  reason.textContent = advice.recommendationReason;

  panel.append(head, meta);
  appendInventoryEconomics(panel, recommended, payload);
  panel.append(reason);

  const actions = document.createElement("div");
  actions.className = "leve-cost-actions";
  const buy = document.createElement("p");
  buy.innerHTML = "<strong>買う</strong>";
  buy.append(document.createTextNode(` ${actionText(recommended.purchases, "buy")}`));
  const craft = document.createElement("p");
  craft.innerHTML = "<strong>作る</strong>";
  craft.append(document.createTextNode(` ${actionText(recommended.crafts, "craft")}`));
  actions.append(buy, craft);

  const details = document.createElement("details");
  details.className = "leve-cost-details";
  const summary = document.createElement("summary");
  summary.textContent = "他の調達ルートと比較";
  details.append(summary);
  const list = document.createElement("div");
  list.className = "leve-cost-route-list";
  for (const route of advice.routes || []) {
    const row = document.createElement("div");
    row.className = `leve-cost-route${route.key === advice.recommendedKey ? " recommended" : ""}${route.available ? "" : " unavailable"}`;
    const name = document.createElement("span");
    name.textContent = route.label;
    const value = document.createElement("span");
    value.textContent = route.available ? routeMeta(route) : "価格不足";
    row.append(name, value);
    list.append(row);
  }
  details.append(list);

  const source = document.createElement("p");
  source.className = "leve-cost-source";
  const age = Number(payload.market_age_minutes);
  const marketBasis = payload?.market_pricing === "listing_quantity_curve"
    ? "Chocobo市場・必要数まで現在の出品数量を積み上げた概算"
    : "Chocobo市場・現在最安単価ベースの概算";
  const inventoryNote = payload?.inventory_evidence?.applied
    ? " · 手持ちは0G扱いせず現在の市場価値を機会費用として実質コストへ含めています"
    : "";
  source.textContent = `${marketBasis}${Number.isFinite(age) ? ` · 更新 約${Math.max(0, Math.round(age))}分前` : ""}${inventoryNote}`;

  panel.append(actions, details, source);
}

async function fetchAdvice(taskKey, energy, minutes) {
  const key = `${taskKey}:${energy}:${minutes}:${contextRevision}`;
  const cached = cache.get(key);
  if (cached && Date.now() - cached.at < 60_000) return cached.payload;
  const params = new URLSearchParams({
    task_key: taskKey,
    energy: String(energy),
    available_minutes: String(minutes)
  });
  const response = await fetch(`/api/leve/cost-advice?${params.toString()}`, {
    headers: { "x-profile-token": profileToken() }
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
  cache.set(key, { at: Date.now(), payload: data });
  return data;
}

async function refresh() {
  refreshQueued = false;
  const card = document.querySelector("#methodList .method-card.recommended");
  if (!card) return;
  const title = card.querySelector("h3")?.textContent?.trim() || "";
  const taskKey = taskKeyFromTitle(title);
  const old = card.querySelector(".leve-cost-advice");
  if (!taskKey) {
    old?.remove();
    return;
  }
  const energy = currentEnergy();
  const minutes = currentMinutes();
  const queryKey = `${taskKey}:${energy}:${minutes}:${contextRevision}`;
  const panel = ensurePanel(card);
  if (panel.dataset.queryKey === queryKey && (panel.dataset.loaded === "1" || panel.dataset.loading === "1")) return;
  panel.dataset.queryKey = queryKey;
  panel.dataset.loaded = "0";
  panel.dataset.loading = "1";
  renderLoading(panel);
  try {
    const payload = await fetchAdvice(taskKey, energy, minutes);
    if (!panel.isConnected || panel.dataset.queryKey !== queryKey) return;
    renderAdvice(panel, payload);
    panel.dataset.loaded = "1";
  } catch {
    if (!panel.isConnected || panel.dataset.queryKey !== queryKey) return;
    renderError(panel);
    panel.dataset.loaded = "1";
  } finally {
    if (panel.isConnected && panel.dataset.queryKey === queryKey) panel.dataset.loading = "0";
  }
}

function queueRefresh() {
  if (refreshQueued) return;
  refreshQueued = true;
  requestAnimationFrame(() => void refresh());
}

function invalidateInventoryCost() {
  contextRevision += 1;
  cache.clear();
  for (const panel of document.querySelectorAll(".leve-cost-advice")) {
    panel.dataset.loaded = "0";
    panel.dataset.loading = "0";
    panel.dataset.queryKey = "";
  }
  queueRefresh();
}

function boot() {
  const methodList = document.getElementById("methodList");
  if (!methodList) return;
  document.getElementById("energyChoices")?.addEventListener("click", () => setTimeout(queueRefresh, 0));
  document.getElementById("timeChoices")?.addEventListener("click", () => setTimeout(queueRefresh, 0));
  methodList.addEventListener("click", () => setTimeout(queueRefresh, 0));
  window.addEventListener("ff14today:context-saved", event => {
    if (event.detail?.pageType === "inventory_items") invalidateInventoryCost();
  });
  queueRefresh();
  setInterval(queueRefresh, 1000);
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
else boot();

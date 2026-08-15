import { aggregateCraftProcurement, parseCraftDeliveryTitle, procurementModel } from "./craft-procurement-summary-core.js";

const PROFILE_TOKEN_KEY = "ff14_today_profile_token_v1";
const cache = new Map();
const inFlight = new Map();
let reconciling = false;

function profileToken() { return localStorage.getItem(PROFILE_TOKEN_KEY) || ""; }
function currentEnergy() {
  const n = Number(document.querySelector("#energyChoices [data-energy].active")?.dataset.energy);
  return Number.isFinite(n) ? n : 3;
}
function currentMinutes() {
  const remaining = document.getElementById("sessionRemaining")?.textContent?.match(/(\d+)\s*分/);
  if (remaining) return Math.max(5, Number(remaining[1]));
  const n = Number(document.querySelector("#timeChoices [data-minutes].active")?.dataset.minutes);
  return Number.isFinite(n) ? n : 60;
}
function hashText(value) {
  let hash = 2166136261;
  for (const char of String(value || "")) { hash ^= char.codePointAt(0); hash = Math.imul(hash, 16777619); }
  return (hash >>> 0).toString(16).padStart(8, "0");
}
function gil(value) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? `${Math.round(n).toLocaleString("ja-JP")}G` : "—";
}

function ensureStyles() {
  if (document.getElementById("craftProcurementStyles")) return;
  const style = document.createElement("style");
  style.id = "craftProcurementStyles";
  style.textContent = `
    .craft-procurement-detail{margin-top:8px;border:1px solid #e0e8f2;border-radius:10px;background:#f8fbff;padding:8px 9px;font-size:.73rem;color:#536c86;line-height:1.55}
    .craft-procurement-costs{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:5px}.craft-procurement-cost{border-radius:999px;background:#fff;border:1px solid #dce7f2;padding:3px 7px;font-weight:800;color:#3f6284}
    .craft-procurement-recommend{font-weight:850;color:#245b45}.craft-procurement-materials{margin-top:4px}.craft-procurement-age{color:#7b90a5;font-size:.68rem;margin-left:5px}
    .craft-procurement-combined{margin-top:10px;padding-top:10px;border-top:1px solid rgba(255,255,255,.22);font-size:.77rem;line-height:1.6}
    .craft-procurement-combined strong{font-weight:900}.craft-procurement-combined-costs{display:flex;gap:10px;flex-wrap:wrap;margin:4px 0}.craft-procurement-combined-materials{opacity:.9}
  `;
  document.head.append(style);
}

function taskInfo(card) {
  const title = card.querySelector(".task-select-title")?.textContent?.trim() || "";
  const parsed = parseCraftDeliveryTitle(title);
  if (!parsed) return null;
  const taskKey = `craft:dynamic:${hashText(`${parsed.itemName}:${parsed.quantity}`)}`;
  return { ...parsed, title, taskKey, cacheKey: `${parsed.itemName}:${parsed.quantity}:${parsed.hqRequired ? 1 : 0}:${currentEnergy()}:${currentMinutes()}` };
}

async function loadModel(info) {
  if (cache.has(info.cacheKey)) return cache.get(info.cacheKey);
  if (inFlight.has(info.cacheKey)) return inFlight.get(info.cacheKey);
  const params = new URLSearchParams({
    task_key: info.taskKey,
    dynamic: "1",
    item_name: info.itemName,
    quantity: String(info.quantity),
    hq_required: info.hqRequired ? "1" : "0",
    energy: String(currentEnergy()),
    available_minutes: String(currentMinutes())
  });
  const promise = fetch(`/api/leve/cost-advice?${params.toString()}`, { headers: { "x-profile-token": profileToken() } })
    .then(async response => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return procurementModel(await response.json());
    })
    .then(model => { cache.set(info.cacheKey, model); return model; })
    .finally(() => { inFlight.delete(info.cacheKey); });
  inFlight.set(info.cacheKey, promise);
  return promise;
}

function modelKey(card) { return card.dataset.craftProcurementKey || ""; }
function selectedCards() {
  return [...document.querySelectorAll("#taskBoardGrid .task-select-card")]
    .filter(card => card.querySelector('input[type="checkbox"]')?.checked && taskInfo(card));
}

function renderCombined() {
  const summary = document.querySelector(".task-board-summary");
  if (!summary) return;
  let box = summary.querySelector("[data-craft-procurement-combined]");
  if (!box) {
    box = document.createElement("div");
    box.className = "craft-procurement-combined";
    box.setAttribute("data-craft-procurement-combined", "");
    summary.append(box);
  }
  const cards = selectedCards();
  const models = cards.map(card => cache.get(modelKey(card))).filter(Boolean);
  if (!cards.length) {
    box.innerHTML = "<strong>生産準備：</strong>リーヴを選ぶと、完成品購入・原材料自作・必要素材を合算します。";
    return;
  }
  if (models.length < cards.length) {
    box.innerHTML = `<strong>生産準備：</strong>選択${cards.length}件の費用と素材を計算中…`;
    return;
  }
  const combined = aggregateCraftProcurement(models);
  const materials = combined.materials.length
    ? combined.materials.map(row => `${row.item_name} ×${row.quantity}${row.total_gil == null ? "" : `（約${gil(row.total_gil)}）`}`).join(" / ")
    : "追加購入素材なし";
  box.innerHTML = `
    <strong>生産準備｜選択 ${combined.count}件</strong>
    <div class="craft-procurement-combined-costs">
      <span>完成品購入 ${gil(combined.buy_finished_gil)}</span>
      <span>原材料自作 ${gil(combined.craft_raw_gil)}</span>
      <span>おすすめ合計 ${gil(combined.recommended_gil)}</span>
    </div>
    <div class="craft-procurement-combined-materials"><strong>必要素材：</strong>${materials}</div>
  `;
}

function renderCard(card, model) {
  let box = card.querySelector("[data-craft-procurement-detail]");
  if (!box) {
    box = document.createElement("div");
    box.className = "craft-procurement-detail";
    box.setAttribute("data-craft-procurement-detail", "");
    const actions = card.querySelector(".task-select-actions");
    if (actions) actions.insertAdjacentElement("beforebegin", box);
    else card.querySelector(".task-select-body")?.append(box);
  }
  if (!model) {
    box.textContent = "購入費・製作費・必要素材を計算中…";
    return;
  }
  const materials = model.materials.length
    ? model.materials.map(row => `${row.item_name} ×${row.quantity}${row.total_gil == null ? "" : `（約${gil(row.total_gil)}）`}`).join(" / ")
    : "追加購入素材なし";
  const age = model.market_age_minutes == null ? "" : `<span class="craft-procurement-age">相場 ${model.market_age_minutes}分前</span>`;
  box.innerHTML = `
    <div class="craft-procurement-costs">
      <span class="craft-procurement-cost">完成品購入 ${gil(model.buy_finished_gil)}</span>
      <span class="craft-procurement-cost">原材料自作 ${gil(model.craft_raw_gil)}</span>
    </div>
    <div class="craft-procurement-recommend">おすすめ：${model.recommended_label || "比較中"} ${gil(model.recommended_gil)}${age}</div>
    <div class="craft-procurement-materials"><strong>製作素材：</strong>${materials}</div>
  `;
}

async function enhanceCard(card) {
  const info = taskInfo(card);
  if (!info) return;
  card.dataset.craftProcurementKey = info.cacheKey;
  renderCard(card, cache.get(info.cacheKey) || null);
  try {
    const model = await loadModel(info);
    if (!card.isConnected) return;
    renderCard(card, model);
  } catch {
    const box = card.querySelector("[data-craft-procurement-detail]");
    if (box) box.textContent = "価格またはレシピを取得できませんでした。既存のリーヴ候補はそのまま利用できます。";
  } finally {
    renderCombined();
  }
}

async function reconcile() {
  if (reconciling) return;
  const board = document.getElementById("taskBoard");
  if (!board) return;
  const active = board.querySelector(".task-board-tab.active")?.textContent?.trim() || "";
  const combined = board.querySelector("[data-craft-procurement-combined]");
  if (!active.startsWith("生産")) {
    if (combined) combined.hidden = true;
    return;
  }
  if (combined) combined.hidden = false;
  reconciling = true;
  try {
    ensureStyles();
    const cards = [...board.querySelectorAll("#taskBoardGrid .task-select-card")];
    await Promise.allSettled(cards.map(enhanceCard));
    renderCombined();
  } finally {
    reconciling = false;
  }
}

function clearPriceCache() {
  cache.clear();
  inFlight.clear();
}

function boot() {
  ensureStyles();
  const observer = new MutationObserver(() => setTimeout(() => void reconcile(), 0));
  observer.observe(document.body, { childList: true, subtree: true });
  document.addEventListener("change", event => {
    if (event.target?.closest?.("#taskBoardGrid .task-select-card")) setTimeout(renderCombined, 0);
  });
  document.addEventListener("click", event => {
    if (event.target?.closest?.(".task-board-tab")) setTimeout(() => void reconcile(), 30);
    if (event.target?.closest?.("#timeChoices") || event.target?.closest?.("#energyChoices")) {
      clearPriceCache();
      setTimeout(() => void reconcile(), 250);
    }
  });
  for (const delay of [400, 1000, 2200]) setTimeout(() => void reconcile(), delay);
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
else boot();

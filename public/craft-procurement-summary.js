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
function deltaGil(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  const rounded = Math.round(n);
  if (rounded > 0) return `＋${rounded.toLocaleString("ja-JP")}G`;
  if (rounded < 0) return `−${Math.abs(rounded).toLocaleString("ja-JP")}G`;
  return "±0G";
}
function setTextIfChanged(node, text) {
  if (node && node.textContent !== text) node.textContent = text;
}
function setHtmlIfChanged(node, html) {
  if (!node) return false;
  const signature = hashText(html);
  if (node.dataset.renderHash === signature) return false;
  node.dataset.renderHash = signature;
  node.innerHTML = html;
  return true;
}

function ensureStyles() {
  if (document.getElementById("craftProcurementStyles")) return;
  const style = document.createElement("style");
  style.id = "craftProcurementStyles";
  style.textContent = `
    .craft-procurement-detail{margin-top:8px;border:1px solid #e0e8f2;border-radius:10px;background:#f8fbff;padding:8px 9px;font-size:.73rem;color:#536c86;line-height:1.55}
    .craft-procurement-costs{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:5px}.craft-procurement-cost{border-radius:999px;background:#fff;border:1px solid #dce7f2;padding:3px 7px;font-weight:800;color:#3f6284}
    .craft-procurement-recommend{font-weight:850;color:#245b45}.craft-procurement-materials{margin-top:4px}.craft-procurement-age{color:#7b90a5;font-size:.68rem;margin-left:5px}
    .leve-reward-compare{margin:6px 0;padding:7px 8px;border-radius:9px;background:#fff;border:1px solid #dce7f2}.leve-reward-line{display:flex;gap:9px;flex-wrap:wrap;align-items:center}.leve-reward-line+ .leve-reward-line{margin-top:3px}.leve-reward-net{font-weight:900;color:#315f4b}.leve-reward-note{color:#7b90a5;font-size:.68rem}
    .craft-procurement-combined{margin-top:10px;padding-top:10px;border-top:1px solid rgba(255,255,255,.22);font-size:.77rem;line-height:1.6}
    .craft-procurement-combined strong{font-weight:900}.craft-procurement-combined-costs{display:flex;gap:10px;flex-wrap:wrap;margin:4px 0}.craft-procurement-combined-materials{opacity:.9}.craft-procurement-combined .leve-reward-compare{color:#31526f}
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

function rewardComparisonHtml(model) {
  if (model?.reward_base_gil == null || model?.reward_hq_gil == null) return "";
  const age = model.reward_market_age_minutes == null ? "" : `<span class="leve-reward-note">相場 約${model.reward_market_age_minutes}分前</span>`;
  const nq = model.finished_nq_market_gil == null
    ? "<span>NQ完成品相場 —</span>"
    : `<span>NQ完成品 ${gil(model.finished_nq_market_gil)} → <span class="leve-reward-net">差引 ${deltaGil(model.net_nq_buy_gil)}</span></span>`;
  const hq = model.finished_hq_market_gil == null
    ? "<span>HQ完成品相場 —</span>"
    : `<span>HQ完成品 ${gil(model.finished_hq_market_gil)} → <span class="leve-reward-net">差引 ${deltaGil(model.net_hq_buy_gil)}</span></span>`;
  const craft = model.craft_raw_gil == null
    ? ""
    : `<div class="leve-reward-line"><span>原材料自作 ${gil(model.craft_raw_gil)} → HQ納品なら <span class="leve-reward-net">差引 ${deltaGil(model.net_hq_craft_gil)}</span></span></div>`;
  return `
    <div class="leve-reward-compare">
      <div class="leve-reward-line"><strong>リーヴ報酬目安</strong><span>NQ ${gil(model.reward_base_gil)}</span><span>HQ ${gil(model.reward_hq_gil)}</span>${age}</div>
      <div class="leve-reward-line">${nq}${hq}</div>
      ${craft}
      <div class="leve-reward-note">差引はギル報酬−調達費。追加アイテム報酬は含めません。</div>
    </div>`;
}

function combinedRewardHtml(combined) {
  if (combined?.reward_base_gil == null || combined?.reward_hq_gil == null) return "";
  const nq = combined.finished_nq_market_gil == null
    ? "<span>NQ完成品相場 —</span>"
    : `<span>NQ完成品 ${gil(combined.finished_nq_market_gil)} → <strong>差引 ${deltaGil(combined.net_nq_buy_gil)}</strong></span>`;
  const hq = combined.finished_hq_market_gil == null
    ? "<span>HQ完成品相場 —</span>"
    : `<span>HQ完成品 ${gil(combined.finished_hq_market_gil)} → <strong>差引 ${deltaGil(combined.net_hq_buy_gil)}</strong></span>`;
  const craft = combined.craft_raw_gil == null
    ? ""
    : `<div class="leve-reward-line"><span>原材料自作合計 ${gil(combined.craft_raw_gil)} → 全てHQ納品なら <strong>差引 ${deltaGil(combined.net_hq_craft_gil)}</strong></span></div>`;
  return `
    <div class="leve-reward-compare">
      <div class="leve-reward-line"><strong>リーヴ報酬合計</strong><span>NQ ${gil(combined.reward_base_gil)}</span><span>HQ ${gil(combined.reward_hq_gil)}</span></div>
      <div class="leve-reward-line">${nq}${hq}</div>
      ${craft}
    </div>`;
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
    setHtmlIfChanged(box, "<strong>生産準備：</strong>リーヴを選ぶと、報酬・完成品相場・原材料自作・必要素材を合算します。");
    return;
  }
  if (models.length < cards.length) {
    setHtmlIfChanged(box, `<strong>生産準備：</strong>選択${cards.length}件の報酬・費用・素材を計算中…`);
    return;
  }
  const combined = aggregateCraftProcurement(models);
  const materials = combined.materials.length
    ? combined.materials.map(row => `${row.item_name} ×${row.quantity}${row.total_gil == null ? "" : `（約${gil(row.total_gil)}）`}`).join(" / ")
    : "追加購入素材なし";
  setHtmlIfChanged(box, `
    <strong>生産準備｜選択 ${combined.count}件</strong>
    ${combinedRewardHtml(combined)}
    <div class="craft-procurement-combined-costs">
      <span>完成品購入 ${gil(combined.buy_finished_gil)}</span>
      <span>原材料自作 ${gil(combined.craft_raw_gil)}</span>
      <span>おすすめ合計 ${gil(combined.recommended_gil)}</span>
    </div>
    <div class="craft-procurement-combined-materials"><strong>必要素材：</strong>${materials}</div>
  `);
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
    delete box.dataset.renderHash;
    setTextIfChanged(box, "リーヴ報酬・完成品相場・製作費を計算中…");
    return;
  }
  const materials = model.materials.length
    ? model.materials.map(row => `${row.item_name} ×${row.quantity}${row.total_gil == null ? "" : `（約${gil(row.total_gil)}）`}`).join(" / ")
    : "追加購入素材なし";
  const age = model.market_age_minutes == null ? "" : `<span class="craft-procurement-age">素材相場 ${model.market_age_minutes}分前</span>`;
  setHtmlIfChanged(box, `
    ${rewardComparisonHtml(model)}
    <div class="craft-procurement-costs">
      <span class="craft-procurement-cost">完成品購入 ${gil(model.buy_finished_gil)}</span>
      <span class="craft-procurement-cost">原材料自作 ${gil(model.craft_raw_gil)}</span>
    </div>
    <div class="craft-procurement-recommend">おすすめ：${model.recommended_label || "比較中"} ${gil(model.recommended_gil)}${age}</div>
    <div class="craft-procurement-materials"><strong>製作素材：</strong>${materials}</div>
  `);
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
    if (box) {
      delete box.dataset.renderHash;
      setTextIfChanged(box, "報酬または相場情報を取得できませんでした。既存のリーヴ候補はそのまま利用できます。");
    }
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
    if (combined && !combined.hidden) combined.hidden = true;
    return;
  }
  if (combined?.hidden) combined.hidden = false;
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
  let queued = false;
  const observer = new MutationObserver(() => {
    if (queued) return;
    queued = true;
    setTimeout(() => { queued = false; void reconcile(); }, 0);
  });
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

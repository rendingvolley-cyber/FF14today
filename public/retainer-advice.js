const PROFILE_TOKEN_KEY = "ff14_today_profile_token_v1";
const RETAINER_DONE_PREFIX = "ff14_today_retainer_done_";
const originalFetch = window.fetch.bind(window);
let panel = null;
let loading = false;

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

function japanDateKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  const get = type => parts.find(part => part.type === type)?.value || "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function doneKey() {
  return `${RETAINER_DONE_PREFIX}${japanDateKey()}`;
}

function isDoneToday() {
  return localStorage.getItem(doneKey()) === "1";
}

function setDoneToday(done) {
  if (done) localStorage.setItem(doneKey(), "1");
  else localStorage.removeItem(doneKey());
}

function formatGil(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? `${Math.round(n).toLocaleString("ja-JP")}G` : "—";
}

function shortageLabel(item) {
  if (item.listing_sample_capped) return "出品100件+";
  const days = Number(item.estimated_days_supply);
  if (!Number.isFinite(days)) return "在庫不明";
  if (days <= 0.5) return `在庫 約${days}日分`;
  if (days <= 2) return `品薄 約${days}日分`;
  return `在庫 約${days}日分`;
}

function marketReason(item) {
  const parts = [
    `Chocoboで直近4日ベースの販売速度は1日約${Number(item.daily_sale_velocity || 0).toLocaleString("ja-JP")}個。`,
    item.listing_sample_capped
      ? "現在出品は100件以上あるため、品薄加点はしていません。"
      : `現在確認できる出品量は約${Number(item.listed_quantity || 0).toLocaleString("ja-JP")}個で、販売速度換算で約${item.estimated_days_supply ?? "—"}日分。`,
    `最近の平均実売は約${formatGil(item.average_sale_price)}。`
  ];
  if (item.quantity_per_venture && item.estimated_gross_per_venture) {
    parts.push(`1回${item.quantity_per_venture}個なら、平均実売ベースの売価目安は約${formatGil(item.estimated_gross_per_venture)}。`);
  }
  return parts.join(" ");
}

function setTabStatus(text) {
  const status = panel?.querySelector("[data-retainer-tab-status]");
  if (status) status.textContent = text;
}

function setSelectedTab(name, { scroll = false } = {}) {
  const root = ensurePanel();
  if (!root) return;
  const content = root.querySelector("[data-retainer-content]");
  const retainerTab = root.querySelector("[data-retainer-open]");
  const planTab = root.querySelector("[data-plan-open]");
  const showRetainer = name === "retainer";

  if (content) content.hidden = !showRetainer;
  retainerTab?.classList.toggle("active", showRetainer);
  planTab?.classList.toggle("active", !showRetainer);
  retainerTab?.setAttribute("aria-selected", showRetainer ? "true" : "false");
  planTab?.setAttribute("aria-selected", showRetainer ? "false" : "true");

  if (!showRetainer && scroll) {
    const planner = document.getElementById("planner");
    if (planner) setTimeout(() => planner.scrollIntoView({ behavior: "smooth", block: "start" }), 60);
  }
}

function syncDoneState() {
  const root = ensurePanel();
  if (!root) return;
  const done = isDoneToday();
  root.dataset.done = done ? "true" : "false";
  const doneButton = root.querySelector("[data-retainer-done]");
  if (doneButton) doneButton.textContent = done ? "未完了に戻す" : "✓ 今日の派遣を終えた";
  setTabStatus(done ? "✓ 派遣済み" : "まずこれ");
  setSelectedTab(done ? "plan" : "retainer");
}

function toggleDone() {
  const next = !isDoneToday();
  setDoneToday(next);
  const root = ensurePanel();
  if (root) root.dataset.done = next ? "true" : "false";
  const doneButton = root?.querySelector("[data-retainer-done]");
  if (doneButton) doneButton.textContent = next ? "未完了に戻す" : "✓ 今日の派遣を終えた";
  setTabStatus(next ? "✓ 派遣済み" : "まずこれ");
  setSelectedTab(next ? "plan" : "retainer", { scroll: next });
}

function ensurePanel() {
  if (panel?.isConnected) return panel;
  const topbar = document.querySelector(".topbar");
  if (!topbar) return null;
  panel = document.createElement("section");
  panel.className = "retainer-routine";
  panel.id = "retainerAdvice";
  panel.innerHTML = `
    <div class="retainer-flow-tabs" role="tablist" aria-label="ログイン後のおすすめ順">
      <button type="button" class="retainer-flow-tab active" data-retainer-open role="tab" aria-selected="true" aria-controls="retainerRoutineContent">
        <span class="retainer-flow-step">1</span><span>リテイナー</span><small data-retainer-tab-status>まずこれ</small>
      </button>
      <button type="button" class="retainer-flow-tab" data-plan-open role="tab" aria-selected="false">
        <span class="retainer-flow-step">2</span><span>今日のプラン</span><small>次にやる</small>
      </button>
    </div>
    <div id="retainerRoutineContent" class="retainer-advice" data-retainer-content>
      <div class="retainer-advice-head">
        <div>
          <div class="retainer-advice-title"><span class="retainer-advice-icon">R</span><span>ログインしたら、まずリテイナー</span></div>
          <p class="retainer-advice-sub">需要が高く、今の出品在庫が薄い素材をChocobo市場から探します。</p>
        </div>
        <button type="button" class="retainer-refresh" data-retainer-refresh>市場を再確認</button>
      </div>
      <div data-retainer-body><div class="retainer-setup">読み込み中…</div></div>
      <div class="retainer-actions">
        <button type="button" class="retainer-done" data-retainer-done>✓ 今日の派遣を終えた</button>
      </div>
    </div>
  `;
  topbar.insertAdjacentElement("afterend", panel);
  panel.querySelector("[data-retainer-refresh]")?.addEventListener("click", () => void loadRecommendations());
  panel.querySelector("[data-retainer-open]")?.addEventListener("click", () => setSelectedTab("retainer"));
  panel.querySelector("[data-plan-open]")?.addEventListener("click", () => setSelectedTab("plan", { scroll: true }));
  panel.querySelector("[data-retainer-done]")?.addEventListener("click", toggleDone);
  return panel;
}

function renderSetup(message) {
  const root = ensurePanel();
  const body = root?.querySelector("[data-retainer-body]");
  if (!body) return;
  body.innerHTML = `<div class="retainer-setup"><strong>最初の1回だけ：</strong>${message}<br>このページを開いたまま、FF14の調達依頼一覧をコピーして Ctrl+V でOK。</div>`;
  if (!isDoneToday()) setTabStatus("要スクショ");
}

function renderEmpty(message) {
  const root = ensurePanel();
  const body = root?.querySelector("[data-retainer-body]");
  if (!body) return;
  body.innerHTML = `<div class="retainer-setup">${message}</div>`;
}

function renderRecommendations(data) {
  const root = ensurePanel();
  const body = root?.querySelector("[data-retainer-body]");
  if (!body) return;
  const rows = Array.isArray(data.recommendations) ? data.recommendations : [];
  if (!rows.length) {
    renderEmpty(data.message || "今は強く推せる派遣先がありません。");
    if (!isDoneToday()) setTabStatus("候補確認済み");
    return;
  }
  const list = document.createElement("div");
  list.className = "retainer-list";
  for (const item of rows) {
    const article = document.createElement("article");
    article.className = `retainer-item${item.rank === 1 ? " first" : ""}`;
    const top = document.createElement("div");
    top.className = "retainer-item-top";
    const rank = document.createElement("span");
    rank.className = "retainer-rank";
    rank.textContent = String(item.rank);
    const name = document.createElement("span");
    name.className = "retainer-item-name";
    name.textContent = item.item_name;
    const shortage = document.createElement("span");
    shortage.className = "retainer-shortage";
    shortage.textContent = shortageLabel(item);
    top.append(rank, name, shortage);

    const reason = document.createElement("p");
    reason.className = "retainer-market-reason";
    reason.textContent = marketReason(item);

    const meta = document.createElement("div");
    meta.className = "retainer-market-meta";
    const retainer = document.createElement("span");
    const retainerBits = [item.retainer_name, item.retainer_job, item.retainer_level ? `Lv${item.retainer_level}` : null].filter(Boolean);
    retainer.textContent = retainerBits.length ? retainerBits.join(" · ") : "保存済みリテイナー";
    const min = document.createElement("span");
    min.textContent = `現在最安 ${formatGil(item.minimum_listing_price)}`;
    const velocity = document.createElement("span");
    velocity.textContent = `販売 約${item.daily_sale_velocity}/日`;
    meta.append(retainer, min, velocity);
    if (item.market_age_minutes != null) {
      const age = document.createElement("span");
      age.textContent = `市場更新 約${item.market_age_minutes}分前`;
      meta.append(age);
    }
    article.append(top, reason, meta);
    list.append(article);
  }
  const note = document.createElement("p");
  note.className = "retainer-market-note";
  note.textContent = "市場データはUniversalisのクラウドソース情報。『高額』より販売速度と在庫日数を重く見ており、売却を保証するものではありません。";
  body.replaceChildren(list, note);
  if (!isDoneToday()) setTabStatus("未完了");
}

async function loadRecommendations() {
  if (loading) return;
  const root = ensurePanel();
  if (!root) return;
  loading = true;
  const button = root.querySelector("[data-retainer-refresh]");
  if (button) {
    button.disabled = true;
    button.textContent = "確認中…";
  }
  try {
    const response = await originalFetch("/api/retainer/recommendations", {
      headers: { "x-profile-token": profileToken() }
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
    if (data.setup_required) renderSetup(data.message || "リテイナーの調達依頼一覧をCtrl+Vしてください。");
    else renderRecommendations(data);
  } catch (error) {
    renderEmpty(`市場チェックに失敗しました：${error.message}`);
    if (!isDoneToday()) setTabStatus("再確認が必要");
  } finally {
    loading = false;
    if (button) {
      button.disabled = false;
      button.textContent = "市場を再確認";
    }
  }
}

function showRetainerSaved(analysis) {
  const retainer = analysis?.retainer_ventures;
  if (!retainer) return;
  const count = Array.isArray(retainer.ventures) ? retainer.ventures.length : 0;
  const label = [retainer.retainer_name, retainer.job_name, retainer.level ? `Lv${retainer.level}` : null].filter(Boolean).join(" · ");
  setTimeout(() => {
    const status = document.getElementById("contextInboxStatus");
    if (status) {
      status.textContent = `リテイナー調達候補を${count}件保存しました${label ? `（${label}）` : ""}。市場を比較して派遣先を更新します。`;
      status.dataset.kind = "success";
    }
    setSelectedTab("retainer");
    setTabStatus("市場を比較中");
    void loadRecommendations();
  }, 0);
}

window.fetch = async (...args) => {
  const response = await originalFetch(...args);
  try {
    const input = args[0];
    const rawUrl = typeof input === "string" ? input : input?.url || "";
    const url = new URL(rawUrl, location.href);
    if (url.pathname === "/api/context/image") {
      response.clone().json().then(data => {
        if (data?.analysis?.page_type === "retainer_ventures") showRetainerSaved(data.analysis);
      }).catch(() => {});
    }
  } catch {}
  return response;
};

function boot() {
  ensurePanel();
  syncDoneState();
  void loadRecommendations();
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
else boot();

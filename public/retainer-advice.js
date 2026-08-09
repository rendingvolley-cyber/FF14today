const PROFILE_TOKEN_KEY = "ff14_today_profile_token_v1";
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

function ensurePanel() {
  if (panel?.isConnected) return panel;
  const inbox = document.getElementById("contextInbox");
  if (!inbox) return null;
  panel = document.createElement("section");
  panel.className = "retainer-advice";
  panel.id = "retainerAdvice";
  panel.innerHTML = `
    <div class="retainer-advice-head">
      <div>
        <div class="retainer-advice-title"><span class="retainer-advice-icon">R</span><span>今日のリテイナー派遣</span></div>
        <p class="retainer-advice-sub">需要が高く、今の出品在庫が薄い素材をChocobo市場から探します。</p>
      </div>
      <button type="button" class="retainer-refresh" data-retainer-refresh>市場を再確認</button>
    </div>
    <div data-retainer-body><div class="retainer-setup">読み込み中…</div></div>
  `;
  inbox.insertAdjacentElement("afterend", panel);
  panel.querySelector("[data-retainer-refresh]")?.addEventListener("click", () => void loadRecommendations());
  return panel;
}

function renderSetup(message) {
  const root = ensurePanel();
  const body = root?.querySelector("[data-retainer-body]");
  if (!body) return;
  body.innerHTML = `<div class="retainer-setup"><strong>最初の1回だけ：</strong>${message}</div>`;
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
  void loadRecommendations();
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
else boot();

let loading = false;
let loadedOnce = false;

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
        <h3>マーケットの売れ筋から交換先を決める</h3>
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
    badge.textContent = "いま交換するならこれ";
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
    reason.textContent = `売れ行きと軍票効率の総合スコア ${formatDecimal(row.score)}。${days}。最安出品 ${formatNumber(row.minimum_listing_price)}ギル。`;
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
  note.textContent = `Chocobo / Universalisの実売・出品データ${age}。マーケット価格は変動するため、交換直前に最安値も確認してください。`;
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

function boot() {
  for (const delay of [0, 80, 250, 800, 1800]) {
    setTimeout(() => {
      if (ensureSection()) void loadRecommendations();
    }, delay);
  }
  document.addEventListener("click", event => {
    if (!event.target?.closest?.("[data-gc-open]")) return;
    setTimeout(() => {
      if (ensureSection()) void loadRecommendations();
    }, 0);
  });
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
else boot();

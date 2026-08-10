const PROFILE_TOKEN_KEY = "ff14_today_profile_token_v1";
const GC_DONE_PREFIX = "ff14_today_grand_company_done_";
const RETAINER_DONE_PREFIX = "ff14_today_retainer_done_";
let loading = false;
let lastSetupRequired = true;

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

function gcDoneKey() {
  return `${GC_DONE_PREFIX}${japanDateKey()}`;
}

function retainerDoneKey() {
  return `${RETAINER_DONE_PREFIX}${japanDateKey()}`;
}

function isGcDone() {
  return localStorage.getItem(gcDoneKey()) === "1";
}

function isRetainerDone() {
  return localStorage.getItem(retainerDoneKey()) === "1";
}

function setGcDone(done) {
  if (done) localStorage.setItem(gcDoneKey(), "1");
  else localStorage.removeItem(gcDoneKey());
}

function rootPanel() {
  return document.getElementById("retainerAdvice");
}

function tabFor(name) {
  const root = rootPanel();
  if (!root) return null;
  if (name === "grand-company") return root.querySelector("[data-gc-open]");
  if (name === "retainer") return root.querySelector("[data-retainer-open]");
  return root.querySelector("[data-plan-open]");
}

function setStep(name, { scroll = false } = {}) {
  const root = rootPanel();
  if (!root) return;
  const gcContent = root.querySelector("[data-gc-content]");
  const retainerContent = root.querySelector("[data-retainer-content]");
  if (gcContent) gcContent.hidden = name !== "grand-company";
  if (retainerContent) retainerContent.hidden = name !== "retainer";

  for (const step of ["grand-company", "retainer", "plan"]) {
    const tab = tabFor(step);
    const active = step === name;
    tab?.classList.toggle("active", active);
    tab?.setAttribute("aria-selected", active ? "true" : "false");
  }

  if (name === "plan" && scroll) {
    const planner = document.getElementById("planner");
    if (planner) setTimeout(() => planner.scrollIntoView({ behavior: "smooth", block: "start" }), 60);
  }
}

function setGcTabStatus(text) {
  const status = rootPanel()?.querySelector("[data-gc-tab-status]");
  if (status) status.textContent = text;
}

function syncRoutineStep({ scrollPlan = false } = {}) {
  const root = rootPanel();
  if (!root) return;
  const gcDone = isGcDone();
  root.dataset.gcDone = gcDone ? "true" : "false";
  const doneButton = root.querySelector("[data-gc-done]");
  if (doneButton) doneButton.textContent = gcDone ? "未完了に戻す" : "✓ 今日の双蛇党納品を終えた";
  setGcTabStatus(gcDone ? "✓ 納品済み" : (lastSetupRequired ? "要スクショ" : "まずこれ"));

  const retainerStatus = root.querySelector("[data-retainer-tab-status]");
  if (!gcDone && retainerStatus && retainerStatus.textContent === "まずこれ") {
    retainerStatus.textContent = "次にやる";
  }

  if (!gcDone) setStep("grand-company");
  else if (!isRetainerDone()) setStep("retainer");
  else setStep("plan", { scroll: scrollPlan });
}

function decorateRetainerCopy(root) {
  const retainerStep = root.querySelector("[data-retainer-open] .retainer-flow-step");
  const planStep = root.querySelector("[data-plan-open] .retainer-flow-step");
  if (retainerStep) retainerStep.textContent = "2";
  if (planStep) planStep.textContent = "3";
  const title = root.querySelector("[data-retainer-content] .retainer-advice-title span:last-child");
  if (title) title.textContent = "次にリテイナーを派遣";
  const sub = root.querySelector("[data-retainer-content] .retainer-advice-sub");
  if (sub) sub.textContent = "双蛇党納品の次に、需要と在庫を見て派遣先を1つ決めます。";
}

function createGrandCompanyContent(root) {
  const tabs = root.querySelector(".retainer-flow-tabs");
  const retainerTab = root.querySelector("[data-retainer-open]");
  if (!tabs || !retainerTab || root.querySelector("[data-gc-open]")) return;

  const gcTab = document.createElement("button");
  gcTab.type = "button";
  gcTab.className = "retainer-flow-tab active";
  gcTab.setAttribute("data-gc-open", "");
  gcTab.setAttribute("role", "tab");
  gcTab.setAttribute("aria-selected", "true");
  gcTab.setAttribute("aria-controls", "grandCompanyRoutineContent");
  gcTab.innerHTML = '<span class="retainer-flow-step">1</span><span>双蛇党納品</span><small data-gc-tab-status>要スクショ</small>';
  tabs.insertBefore(gcTab, retainerTab);

  const content = document.createElement("div");
  content.id = "grandCompanyRoutineContent";
  content.className = "retainer-advice gc-advice";
  content.setAttribute("data-gc-content", "");
  content.innerHTML = `
    <div class="retainer-advice-head">
      <div>
        <div class="retainer-advice-title"><span class="retainer-advice-icon">G</span><span>ログインしたら、まず双蛇党納品</span></div>
        <p class="retainer-advice-sub">今日の納品一覧スクショから、所持数とボーナス表示だけで最初の1件を決めます。</p>
      </div>
      <button type="button" class="retainer-refresh" data-gc-refresh>一覧を再確認</button>
    </div>
    <div data-gc-body><div class="retainer-setup">今日の納品一覧を確認中…</div></div>
    <div class="retainer-actions">
      <button type="button" class="retainer-done" data-gc-done>✓ 今日の双蛇党納品を終えた</button>
    </div>
  `;
  const retainerContent = root.querySelector("[data-retainer-content]");
  root.insertBefore(content, retainerContent || null);

  gcTab.addEventListener("click", () => setStep("grand-company"));
  root.querySelector("[data-retainer-open]")?.addEventListener("click", () => setStep("retainer"));
  root.querySelector("[data-plan-open]")?.addEventListener("click", () => setStep("plan", { scroll: true }));
  root.querySelector("[data-gc-refresh]")?.addEventListener("click", () => void loadDeliveries());
  root.querySelector("[data-gc-done]")?.addEventListener("click", () => {
    const next = !isGcDone();
    setGcDone(next);
    syncRoutineStep();
  });
  root.querySelector("[data-retainer-done]")?.addEventListener("click", () => {
    setTimeout(() => syncRoutineStep({ scrollPlan: true }), 0);
  });
}

function ensureRoutine() {
  const root = rootPanel();
  if (!root) return false;
  createGrandCompanyContent(root);
  decorateRetainerCopy(root);
  syncRoutineStep();
  return true;
}

function qtyText(row) {
  const requested = Number.isInteger(row?.requested_quantity) ? row.requested_quantity : null;
  const owned = Number.isInteger(row?.owned_quantity) ? row.owned_quantity : null;
  if (requested !== null && owned !== null) return `必要 ${requested} / 所持 ${owned}`;
  if (requested !== null) return `必要 ${requested}`;
  if (owned !== null) return `所持 ${owned}`;
  return "数量は画面で確認";
}

function buildDeliveryRow(row, { featured = false } = {}) {
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
    star.textContent = "★ ボーナス表示";
    top.append(star);
  }
  const meta = document.createElement("div");
  meta.className = "gc-delivery-meta";
  for (const text of [row.class_or_job, qtyText(row), row.bonus_text, row.reward_text].filter(Boolean)) {
    const span = document.createElement("span");
    span.textContent = text;
    meta.append(span);
  }
  article.append(top, meta);
  if (featured && row.recommendation_reason) {
    const reason = document.createElement("p");
    reason.className = "gc-delivery-reason";
    reason.textContent = row.recommendation_reason;
    article.append(reason);
  }
  return article;
}

function renderSetup(message) {
  const body = rootPanel()?.querySelector("[data-gc-body]");
  if (!body) return;
  body.innerHTML = "";
  const box = document.createElement("div");
  box.className = "retainer-setup";
  const strong = document.createElement("strong");
  strong.textContent = "今日の1枚：";
  box.append(strong, document.createTextNode(message || "双蛇党の納品一覧スクショをCtrl+Vしてください。"));
  body.append(box);
  lastSetupRequired = true;
  if (!isGcDone()) setGcTabStatus("要スクショ");
}

function renderDeliveries(data) {
  const body = rootPanel()?.querySelector("[data-gc-body]");
  if (!body) return;
  const rows = Array.isArray(data?.deliveries) ? data.deliveries : [];
  const recommended = data?.recommended;
  body.replaceChildren();
  lastSetupRequired = false;
  if (!recommended) {
    renderSetup("一覧は保存されていますが、確信を持てる納品行がありません。もう一度見やすいスクショを貼ってください。");
    return;
  }

  const lead = document.createElement("div");
  lead.className = "gc-recommendation";
  const label = document.createElement("p");
  label.className = "gc-kicker";
  label.textContent = "まずこれを納品";
  lead.append(label, buildDeliveryRow(recommended, { featured: true }));
  body.append(lead);

  const remaining = rows.filter(row => row.row_index !== recommended.row_index || row.item_name !== recommended.item_name);
  if (remaining.length) {
    const details = document.createElement("details");
    details.className = "gc-remaining";
    const summary = document.createElement("summary");
    summary.textContent = `残りの納品候補 ${remaining.length}件`;
    details.append(summary);
    const list = document.createElement("div");
    list.className = "gc-delivery-list";
    for (const row of remaining) list.append(buildDeliveryRow(row));
    details.append(list);
    body.append(details);
  }

  const note = document.createElement("p");
  note.className = "retainer-market-note";
  const company = data?.company_name ? `${data.company_name}・` : "";
  note.textContent = `${company}今日のスクショ証拠だけを使用。品名・必要数・所持数・ボーナスを外部知識で補完しません。`;
  body.append(note);
  if (!isGcDone()) setGcTabStatus(recommended.ready_now ? "すぐ納品" : "まずこれ");
}

async function loadDeliveries() {
  if (loading) return;
  const root = rootPanel();
  if (!root) return;
  loading = true;
  const button = root.querySelector("[data-gc-refresh]");
  if (button) {
    button.disabled = true;
    button.textContent = "確認中…";
  }
  try {
    const response = await fetch("/api/grand-company/deliveries", {
      headers: { "x-profile-token": profileToken() }
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
    if (data.setup_required) renderSetup(data.message);
    else renderDeliveries(data);
  } catch (error) {
    renderSetup(`納品一覧の確認に失敗しました：${error.message}`);
  } finally {
    loading = false;
    if (button) {
      button.disabled = false;
      button.textContent = "一覧を再確認";
    }
    syncRoutineStep();
  }
}

function showGrandCompanySaved(analysis) {
  const payload = analysis?.grand_company_deliveries;
  if (!payload) return;
  const count = Array.isArray(payload.deliveries) ? payload.deliveries.length : 0;
  const status = document.getElementById("contextInboxStatus");
  if (status) {
    status.textContent = `今日の双蛇党納品を${count}件読み取りました。必要数と所持数から最初の1件を決めます。`;
    status.dataset.kind = "success";
  }
  setStep("grand-company");
  setGcTabStatus("選定中");
  void loadDeliveries();
}

function installFetchHook() {
  if (window.__ff14TodayGrandCompanyFetchHook) return;
  window.__ff14TodayGrandCompanyFetchHook = true;
  const previousFetch = window.fetch.bind(window);
  window.fetch = async (...args) => {
    const response = await previousFetch(...args);
    try {
      const input = args[0];
      const rawUrl = typeof input === "string" ? input : input?.url || "";
      const url = new URL(rawUrl, location.href);
      if (url.pathname === "/api/context/image") {
        response.clone().json().then(data => {
          const pageType = data?.analysis?.page_type;
          if (pageType === "grand_company_deliveries") showGrandCompanySaved(data.analysis);
          else if (pageType === "retainer_ventures") setTimeout(() => syncRoutineStep(), 0);
        }).catch(() => {});
      }
    } catch {}
    return response;
  };
}

function boot(attempt = 0) {
  if (!ensureRoutine()) {
    if (attempt < 50) setTimeout(() => boot(attempt + 1), 100);
    return;
  }
  installFetchHook();
  void loadDeliveries();
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => boot(), { once: true });
else boot();

const PROFILE_TOKEN_KEY = "ff14_today_profile_token_v1";
const SOURCE_MODES = ["efficient", "craft", "gather", "discover"];
const REFRESH_INTERVAL_MS = 10 * 60 * 1000;
const VISIBLE_TICK_MS = 1000;
const HIDDEN_TICK_MS = 30000;

let dashboardData = { fish: [], deadlines: [], refreshedAt: 0 };
let tickTimer = null;
let refreshTimer = null;
let refreshInFlight = false;

function profileToken() {
  const token = localStorage.getItem(PROFILE_TOKEN_KEY) || "";
  return /^[A-Za-z0-9_-]{43,128}$/.test(token) ? token : "";
}

function taskText(method) {
  return `${method?.title || ""} ${method?.badge || ""} ${method?.reason || ""} ${method?.condition || ""} ${method?.task_key || ""}`;
}

export function isBigFishCandidate(method) {
  const text = taskText(method);
  return method?.job_code === "FSH" && /ヌシ|オオヌシ|大物魚|big\s*fish|legendary\s*fish/i.test(text)
    || /オオヌシ|大物魚|big\s*fish|legendary\s*fish/i.test(text);
}

function isDeadlineCandidate(method) {
  const text = taskText(method);
  return Boolean(
    method?.is_event === true
    || method?.cadence === "weekly"
    || method?.reset_cycle === "weekly"
    || method?.schedule_type === "weekly"
    || method?.schedule_type === "event"
    || method?.deadline_at
    || method?.ends_at
    || method?.end_at
    || /期間限定|シーズナル|終了まで|締切|メンテ|リセット|週次|週間|今週|時間限定|次窓|ET\s*\d/i.test(text)
  );
}

function finiteMs(value) {
  const n = Number(value);
  if (Number.isFinite(n) && n > 0) return n > 10_000_000_000 ? n : n * 1000;
  if (typeof value !== "string" || !value.trim()) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function jstDateParts(nowMs = Date.now()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date(nowMs));
  const get = type => parts.find(part => part.type === type)?.value || "";
  return { year: get("year"), month: get("month"), day: get("day") };
}

function jstClockToMs(clock, nowMs = Date.now()) {
  const match = String(clock || "").match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isInteger(hours) || !Number.isInteger(minutes) || hours > 23 || minutes > 59) return null;
  const { year, month, day } = jstDateParts(nowMs);
  const parsed = Date.parse(`${year}-${month}-${day}T${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:00+09:00`);
  return Number.isFinite(parsed) ? parsed : null;
}

function textTiming(text, nowMs) {
  const deadlineMatch = text.match(/(?:終了まで|締切まで|リセットまで)\s*(?:実時間)?\s*約?\s*(\d+)\s*分/);
  if (deadlineMatch) return { deadlineAt: nowMs + Number(deadlineMatch[1]) * 60000 };

  const waitMatch = text.match(/(?:次の出現まで実時間約|開始まで|次窓まで)\s*(\d+)\s*分/);
  if (waitMatch) {
    const startAt = nowMs + Number(waitMatch[1]) * 60000;
    return { startAt, endAt: startAt + 6 * 60000 };
  }

  const range = text.match(/JST\s*(\d{1,2}:\d{2})\s*[〜～-]\s*(\d{1,2}:\d{2})/i);
  if (range) {
    let startAt = jstClockToMs(range[1], nowMs);
    let endAt = jstClockToMs(range[2], nowMs);
    if (startAt != null && endAt != null) {
      if (endAt <= startAt) endAt += 24 * 60 * 60 * 1000;
      if (endAt <= nowMs) {
        startAt += 24 * 60 * 60 * 1000;
        endAt += 24 * 60 * 60 * 1000;
      }
      return { startAt, endAt };
    }
  }
  return {};
}

export function buildAbsoluteTiming(method, nowMs = Date.now()) {
  const window = method?.time_window && typeof method.time_window === "object" ? method.time_window : {};
  let startAt = finiteMs(window.start_at_ms ?? window.start_at ?? method?.start_at_ms ?? method?.start_at);
  let endAt = finiteMs(window.end_at_ms ?? window.end_at ?? method?.end_at_ms ?? method?.end_at);
  let deadlineAt = finiteMs(method?.deadline_at ?? method?.ends_at ?? method?.deadlineAt ?? window.deadline_at);
  const startsIn = Number(window.starts_in_minutes ?? window.startsInMinutes);
  const duration = Math.max(1, Number(window.duration_minutes ?? window.durationMinutes) || 6);
  const open = window.state === "open" || window.open === true || startsIn === 0;

  if (startAt == null && Number.isFinite(startsIn)) startAt = nowMs + Math.max(0, startsIn) * 60000;
  if (startAt == null && open) startAt = nowMs;
  if (endAt == null && startAt != null) endAt = startAt + duration * 60000;

  const text = `${taskText(method)} ${(method?.steps || []).join(" ")} ${method?.timing || ""}`;
  const parsed = textTiming(text, nowMs);
  if (startAt == null) startAt = parsed.startAt ?? null;
  if (endAt == null) endAt = parsed.endAt ?? null;
  if (deadlineAt == null) deadlineAt = parsed.deadlineAt ?? null;

  return { startAt, endAt, deadlineAt, label: String(window.label || method?.timing || "").trim() };
}

function minutesLabel(ms) {
  const seconds = Math.max(0, Math.ceil(ms / 1000));
  if (seconds < 60) return `${seconds}秒`;
  const minutes = Math.ceil(seconds / 60);
  if (minutes < 60) return `${minutes}分`;
  const hours = Math.floor(minutes / 60);
  const remainMinutes = minutes % 60;
  if (hours < 24) return remainMinutes ? `${hours}時間${remainMinutes}分` : `${hours}時間`;
  const days = Math.floor(hours / 24);
  const remainHours = hours % 24;
  return remainHours ? `${days}日${remainHours}時間` : `${days}日`;
}

export function countdownState(timing, nowMs = Date.now()) {
  const deadlineAt = finiteMs(timing?.deadlineAt);
  if (deadlineAt != null) {
    const remaining = deadlineAt - nowMs;
    return remaining > 0
      ? { state: "deadline", label: `残り${minutesLabel(remaining)}`, expired: false }
      : { state: "expired", label: "終了", expired: true };
  }

  const startAt = finiteMs(timing?.startAt);
  const endAt = finiteMs(timing?.endAt);
  if (startAt == null && endAt == null) return { state: "unknown", label: "時刻確認", expired: false };
  if (startAt != null && nowMs < startAt) {
    return { state: "upcoming", label: `あと${minutesLabel(startAt - nowMs)}`, expired: false };
  }
  if (endAt != null && nowMs < endAt) {
    return { state: "open", label: `いま · 残り${minutesLabel(endAt - nowMs)}`, expired: false };
  }
  return { state: "expired", label: "終了", expired: true };
}

function formatJst(ms) {
  if (!Number.isFinite(Number(ms))) return "—";
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(new Date(Number(ms)));
}

function formatRange(timing) {
  if (timing.deadlineAt) return `${formatJst(timing.deadlineAt)} まで`;
  if (timing.startAt && timing.endAt) return `${formatJst(timing.startAt)}–${new Intl.DateTimeFormat("ja-JP", { timeZone: "Asia/Tokyo", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(timing.endAt))}`;
  if (timing.startAt) return `${formatJst(timing.startAt)} 開始`;
  return timing.label || "時刻確認";
}

function normalizeCandidate(method, kind, nowMs) {
  const timing = buildAbsoluteTiming(method, nowMs);
  if (!timing.startAt && !timing.endAt && !timing.deadlineAt) return null;
  return {
    key: String(method?.task_key || `${kind}:${method?.title || "task"}`),
    title: String(method?.title || "時限情報"),
    detail: String(method?.reason || method?.detail || "").trim(),
    timing,
    kind
  };
}

function collectFromPlan(plan, nowMs) {
  const fish = [];
  const deadlines = [];
  for (const method of plan?.methods || []) {
    if (isBigFishCandidate(method)) {
      const row = normalizeCandidate(method, "fish", nowMs);
      if (row) fish.push(row);
      continue;
    }
    if (isDeadlineCandidate(method)) {
      const row = normalizeCandidate(method, "deadline", nowMs);
      if (row) deadlines.push(row);
    }
  }

  for (const item of plan?.gather_checklist?.items || []) {
    if (!item?.timing) continue;
    const pseudo = { title: item.title, reason: item.detail, timing: item.timing, task_key: item.key };
    const row = normalizeCandidate(pseudo, "deadline", nowMs);
    if (row) deadlines.push(row);
  }
  return { fish, deadlines };
}

function dedupeAndSort(rows, limit) {
  const map = new Map();
  for (const row of rows) {
    const signature = `${row.key}|${row.timing.startAt || row.timing.deadlineAt || ""}`;
    if (!map.has(signature)) map.set(signature, row);
  }
  return [...map.values()]
    .filter(row => !countdownState(row.timing).expired)
    .sort((a, b) => {
      const at = a.timing.startAt ?? a.timing.deadlineAt ?? Number.MAX_SAFE_INTEGER;
      const bt = b.timing.startAt ?? b.timing.deadlineAt ?? Number.MAX_SAFE_INTEGER;
      return at - bt;
    })
    .slice(0, limit);
}

function injectStyles() {
  if (document.getElementById("timeSensitiveDashboardStyles")) return;
  const style = document.createElement("style");
  style.id = "timeSensitiveDashboardStyles";
  style.textContent = `
    #taskBoardTabs .task-board-tab[data-category="event"],
    #taskBoardTabs .task-board-tab[data-category="weekly"],
    #taskBoard .task-board-timed { display:none!important; }
    .time-sensitive-dashboard{margin-top:18px;border:1px solid rgba(32,71,117,.14);border-radius:18px;background:#fff;box-shadow:0 12px 34px rgba(45,77,116,.07);overflow:hidden}
    .time-sensitive-head{display:flex;justify-content:space-between;gap:16px;align-items:center;padding:17px 18px;border-bottom:1px solid #e5edf5;background:linear-gradient(180deg,#fbfdff,#f7fbff)}
    .time-sensitive-head h3{margin:2px 0 0;font-size:1.15rem}.time-sensitive-kicker{margin:0;font-size:.72rem;font-weight:900;letter-spacing:.12em;color:#52729a}
    .time-sensitive-clock{text-align:right}.time-sensitive-clock strong{display:block;font-size:1.2rem;font-variant-numeric:tabular-nums;color:#173f68}.time-sensitive-clock small{display:block;color:#71869b;margin-top:2px}
    .time-sensitive-grid{display:grid;grid-template-columns:1fr 1fr;gap:0}.time-sensitive-column{padding:16px 18px 18px}.time-sensitive-column+ .time-sensitive-column{border-left:1px solid #e5edf5}
    .time-sensitive-title{display:flex;justify-content:space-between;gap:10px;align-items:center;margin-bottom:10px}.time-sensitive-title strong{font-size:.95rem;color:#244f7f}.time-sensitive-title span{font-size:.7rem;color:#7a8ea3}
    .time-sensitive-list{display:grid;gap:9px}.time-card{border:1px solid #dce7f2;border-radius:14px;padding:12px 13px;background:#fbfdff}.time-card.open{border-color:#8fb5de;background:#f0f7ff}.time-card.deadline{border-color:#e4d7bd;background:#fffaf1}
    .time-card-top{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}.time-card h4{margin:0;font-size:.9rem;line-height:1.45}.time-countdown{white-space:nowrap;border-radius:999px;padding:4px 8px;background:#eaf2fb;color:#245988;font-size:.72rem;font-weight:900;font-variant-numeric:tabular-nums}.time-card.open .time-countdown{background:#d9ecff;color:#155895}.time-card.deadline .time-countdown{background:#f6ead3;color:#805d24}
    .time-range{margin:6px 0 0;font-weight:850;font-size:.78rem;color:#3b6288;font-variant-numeric:tabular-nums}.time-detail{margin:5px 0 0;font-size:.74rem;line-height:1.5;color:#6b8095}.time-empty{padding:13px;border:1px dashed #ccd9e6;border-radius:12px;color:#73879b;font-size:.78rem;background:#fbfdff}
    @media(max-width:760px){.time-sensitive-head{align-items:flex-start}.time-sensitive-grid{grid-template-columns:1fr}.time-sensitive-column+ .time-sensitive-column{border-left:0;border-top:1px solid #e5edf5}.time-sensitive-clock strong{font-size:1.05rem}}
  `;
  document.head.append(style);
}

function ensureDashboard() {
  injectStyles();
  const board = document.getElementById("taskBoard");
  if (!board) return null;
  let section = document.getElementById("timeSensitiveDashboard");
  if (!section) {
    section = document.createElement("section");
    section.id = "timeSensitiveDashboard";
    section.className = "time-sensitive-dashboard";
    section.innerHTML = `
      <div class="time-sensitive-head">
        <div><p class="time-sensitive-kicker">TIME SENSITIVE</p><h3>今夜の時間情報</h3></div>
        <div class="time-sensitive-clock"><strong data-live-clock>--:--:-- JST</strong><small data-live-date></small></div>
      </div>
      <div class="time-sensitive-grid">
        <section class="time-sensitive-column"><div class="time-sensitive-title"><strong>BIG FISH</strong><span>最大3件</span></div><div class="time-sensitive-list" data-fish-list></div></section>
        <section class="time-sensitive-column"><div class="time-sensitive-title"><strong>期限・時限</strong><span>現実時間で表示</span></div><div class="time-sensitive-list" data-deadline-list></div></section>
      </div>`;
  }
  if (board.nextElementSibling !== section) board.after(section);
  return section;
}

function buildCard(row, nowMs) {
  const state = countdownState(row.timing, nowMs);
  const card = document.createElement("article");
  card.className = `time-card ${state.state === "open" ? "open" : row.kind === "deadline" ? "deadline" : ""}`.trim();
  const top = document.createElement("div");
  top.className = "time-card-top";
  const title = document.createElement("h4");
  title.textContent = row.title;
  const countdown = document.createElement("span");
  countdown.className = "time-countdown";
  countdown.dataset.countdownKey = row.key;
  countdown.textContent = state.label;
  top.append(title, countdown);
  const range = document.createElement("p");
  range.className = "time-range";
  range.textContent = formatRange(row.timing);
  card.append(top, range);
  if (row.detail) {
    const detail = document.createElement("p");
    detail.className = "time-detail";
    detail.textContent = row.detail;
    card.append(detail);
  }
  return card;
}

function renderList(target, rows, emptyText, nowMs) {
  if (!target) return;
  const active = rows.filter(row => !countdownState(row.timing, nowMs).expired);
  if (!active.length) {
    const empty = document.createElement("div");
    empty.className = "time-empty";
    empty.textContent = emptyText;
    target.replaceChildren(empty);
    return;
  }
  target.replaceChildren(...active.map(row => buildCard(row, nowMs)));
}

function render() {
  const section = ensureDashboard();
  if (!section) return;
  const nowMs = Date.now();
  renderList(section.querySelector("[data-fish-list]"), dashboardData.fish, "現在の候補データに大物魚の時限情報はありません。", nowMs);
  renderList(section.querySelector("[data-deadline-list]"), dashboardData.deadlines, "現在、表示できる期限・時限情報はありません。", nowMs);
  updateClockAndCountdowns();
}

function updateClockAndCountdowns() {
  const section = ensureDashboard();
  if (!section) return;
  const now = new Date();
  const nowMs = now.getTime();
  const clock = section.querySelector("[data-live-clock]");
  const date = section.querySelector("[data-live-date]");
  if (clock) clock.textContent = `${new Intl.DateTimeFormat("ja-JP", { timeZone: "Asia/Tokyo", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).format(now)} JST`;
  if (date) date.textContent = new Intl.DateTimeFormat("ja-JP", { timeZone: "Asia/Tokyo", month: "long", day: "numeric", weekday: "short" }).format(now);

  const rows = [...dashboardData.fish, ...dashboardData.deadlines];
  const byKey = new Map(rows.map(row => [row.key, row]));
  for (const node of section.querySelectorAll("[data-countdown-key]")) {
    const row = byKey.get(node.dataset.countdownKey);
    if (!row) continue;
    const state = countdownState(row.timing, nowMs);
    node.textContent = state.label;
  }
}

async function fetchMode(mode) {
  const params = new URLSearchParams({ lodestone_id: "3091607", planner_mode: mode });
  const response = await fetch(`/api/state?${params.toString()}`, { headers: { "x-profile-token": profileToken() } });
  if (!response.ok) throw new Error(`${mode}: HTTP ${response.status}`);
  return response.json();
}

async function refreshData() {
  if (refreshInFlight || document.visibilityState === "hidden") return;
  refreshInFlight = true;
  try {
    const nowMs = Date.now();
    const results = await Promise.allSettled(SOURCE_MODES.map(fetchMode));
    const fish = [];
    const deadlines = [];
    for (const result of results) {
      if (result.status !== "fulfilled") continue;
      const found = collectFromPlan(result.value?.plan, nowMs);
      fish.push(...found.fish);
      deadlines.push(...found.deadlines);
    }
    dashboardData = {
      fish: dedupeAndSort(fish, 3),
      deadlines: dedupeAndSort(deadlines, 6),
      refreshedAt: nowMs
    };
    render();
  } finally {
    refreshInFlight = false;
  }
}

function scheduleTick() {
  clearTimeout(tickTimer);
  const delay = document.visibilityState === "hidden" ? HIDDEN_TICK_MS : VISIBLE_TICK_MS;
  tickTimer = setTimeout(() => {
    updateClockAndCountdowns();
    scheduleTick();
  }, delay);
}

function boot() {
  ensureDashboard();
  render();
  void refreshData();
  scheduleTick();
  refreshTimer = setInterval(() => void refreshData(), REFRESH_INTERVAL_MS);

  document.addEventListener("visibilitychange", () => {
    scheduleTick();
    if (document.visibilityState === "visible" && Date.now() - dashboardData.refreshedAt > 5 * 60 * 1000) void refreshData();
  });
  for (const eventName of ["ff14today:context-saved", "ff14today:context-updated", "ff14today:inventory-evidence-updated"]) {
    window.addEventListener(eventName, () => setTimeout(() => void refreshData(), 250));
  }
  document.getElementById("timeChoices")?.addEventListener("click", () => setTimeout(() => void refreshData(), 250));
  document.getElementById("energyChoices")?.addEventListener("click", () => setTimeout(() => void refreshData(), 250));

  for (const delay of [100, 500, 1500]) setTimeout(() => ensureDashboard(), delay);
}

if (typeof window !== "undefined" && typeof document !== "undefined") {
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
  else boot();
}

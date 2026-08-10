const PROFILE_TOKEN_KEY = "ff14_today_profile_token_v1";
const BOARD_SELECTION_PREFIX = "ff14_today_task_board_selection_";
const SOURCE_MODES = ["efficient", "craft", "gather", "discover"];
const CATEGORIES = [
  ["combat", "戦闘"],
  ["craft", "生産"],
  ["gather", "採集"],
  ["fishing", "釣り"],
  ["other", "その他"]
];
const STATIC_COST_TASKS = new Set([
  "craft:alc90:leve:ginseng-angle-brush",
  "craft:alc90:leve:growth-formula-lambda"
]);

const boardState = {
  activeCategory: "combat",
  catalog: new Map(CATEGORIES.map(([key]) => [key, []])),
  timed: [],
  selected: new Set(),
  materialByKey: new Map(),
  loadingMaterials: new Set(),
  loadRevision: 0,
  ready: false
};

function styleText() {
  return `
.task-board{margin-top:18px;border:1px solid rgba(32,71,117,.14);border-radius:18px;background:rgba(255,255,255,.78);box-shadow:0 12px 34px rgba(45,77,116,.08);overflow:hidden}
.task-board-head{padding:18px 18px 12px;display:flex;justify-content:space-between;gap:16px;align-items:flex-start}
.task-board-head h3{margin:3px 0 4px;font-size:1.16rem}.task-board-head p{margin:0}.task-board-kicker{font-size:.72rem;font-weight:800;letter-spacing:.13em;color:#52729a}
.task-board-status{font-size:.78rem;color:#66809f;text-align:right;max-width:240px}.task-board-tabs{display:flex;gap:6px;padding:0 14px 12px;overflow-x:auto;scrollbar-width:none}.task-board-tabs::-webkit-scrollbar{display:none}
.task-board-tab{border:0;border-radius:999px;background:#edf3fa;color:#52708f;padding:9px 13px;font-weight:800;white-space:nowrap;cursor:pointer}.task-board-tab.active{background:#244f7f;color:#fff}.task-board-tab small{opacity:.72;margin-left:4px}
.task-board-timed{margin:0 14px 14px;border-radius:16px;background:linear-gradient(135deg,#edf5ff,#f7fbff);border:1px solid #d5e5f6;padding:14px}.task-board-timed.hidden{display:none}.task-board-timed-head{display:flex;justify-content:space-between;gap:12px;align-items:center;margin-bottom:10px}.task-board-timed-head strong{font-size:.96rem}.task-board-timed-head span{font-size:.75rem;color:#607d9b}
.task-board-timed-list{display:grid;gap:8px}.timed-task{display:grid;grid-template-columns:auto 1fr auto;gap:10px;align-items:center;background:#fff;border-radius:12px;padding:10px 11px;border:1px solid #dce9f6}.timed-task input{width:18px;height:18px}.timed-copy strong{display:block;font-size:.9rem}.timed-copy span{display:block;font-size:.76rem;color:#647f9b;margin-top:2px}.timed-clock{text-align:right;font-weight:900;color:#244f7f;font-size:.84rem}.timed-clock small{display:block;font-weight:600;color:#7189a2;margin-top:2px}
.task-board-grid{display:grid;gap:10px;padding:0 14px 14px}.task-select-card{border:1px solid #dde7f1;background:#fff;border-radius:15px;padding:13px;display:grid;grid-template-columns:auto 1fr;gap:11px;transition:border-color .15s,box-shadow .15s}.task-select-card.selected{border-color:#7399c1;box-shadow:0 8px 20px rgba(54,91,130,.1)}.task-select-card>input{width:19px;height:19px;margin-top:2px}.task-select-title{font-weight:850;line-height:1.45}.task-select-meta{display:flex;gap:6px;flex-wrap:wrap;margin:5px 0}.task-chip{font-size:.7rem;font-weight:800;padding:3px 7px;border-radius:999px;background:#edf3f9;color:#5a7692}.task-select-reason{margin:6px 0 0;font-size:.79rem;line-height:1.55;color:#536c86}.task-select-actions{display:flex;gap:8px;align-items:center;margin-top:10px}.task-now-button{border:1px solid #bfd1e4;background:#f8fbff;color:#315b86;border-radius:10px;padding:7px 10px;font-weight:800;cursor:pointer}.task-material-note{font-size:.72rem;color:#7389a0}.task-board-empty{padding:20px;text-align:center;color:#70869e;background:#f8fbfe;border-radius:13px}
.task-board-schedule{border-top:1px solid #e4edf6;padding:14px}.task-board-schedule-head{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:10px}.task-board-schedule-head strong{font-size:.95rem}.task-board-schedule-head span{font-size:.74rem;color:#6a829a}.schedule-rows{display:grid;gap:7px}.schedule-row{display:grid;grid-template-columns:90px 1fr auto;gap:10px;align-items:center;padding:8px 10px;border-radius:11px;background:#f6f9fc}.schedule-row.timed{background:#edf5ff}.schedule-time{font-variant-numeric:tabular-nums;font-size:.78rem;font-weight:850;color:#3b648c}.schedule-title{font-size:.82rem;font-weight:750}.schedule-kind{font-size:.68rem;color:#7189a0}.schedule-empty{font-size:.79rem;color:#71879e;padding:7px 2px}
.task-board-summary{position:sticky;bottom:10px;z-index:5;margin:0 14px 14px;border-radius:15px;background:#163f6c;color:#fff;padding:12px 13px;box-shadow:0 12px 28px rgba(22,63,108,.22)}.task-board-summary-main{display:flex;justify-content:space-between;gap:12px;align-items:center}.task-board-summary-text{font-size:.83rem;font-weight:800}.task-board-summary-text small{display:block;font-size:.7rem;font-weight:600;opacity:.78;margin-top:3px}.task-board-prep-button{border:0;border-radius:10px;background:#fff;color:#214d78;font-weight:850;padding:8px 11px;cursor:pointer;white-space:nowrap}.task-board-materials{margin-top:10px;padding-top:10px;border-top:1px solid rgba(255,255,255,.2);display:grid;gap:6px}.task-board-materials.hidden{display:none}.material-row{display:flex;justify-content:space-between;gap:12px;font-size:.78rem}.material-row strong{font-weight:800}.material-muted{opacity:.75;font-size:.72rem}.task-board-error{padding:0 14px 14px;font-size:.78rem;color:#a24a4a}
@media(max-width:680px){.task-board-head{display:block}.task-board-status{text-align:left;margin-top:7px}.timed-task{grid-template-columns:auto 1fr}.timed-clock{grid-column:2;text-align:left}.schedule-row{grid-template-columns:74px 1fr}.schedule-kind{grid-column:2}.task-board-summary-main{align-items:flex-start}.task-board-prep-button{padding:8px 9px}}
`;
}

function injectStyles() {
  if (document.getElementById("taskBoardStyles")) return;
  const style = document.createElement("style");
  style.id = "taskBoardStyles";
  style.textContent = styleText();
  document.head.append(style);
}

function japanDateKey() {
  const parts = new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date());
  const get = type => parts.find(part => part.type === type)?.value || "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function selectionKey() {
  return `${BOARD_SELECTION_PREFIX}${japanDateKey()}`;
}

function loadSelection() {
  try {
    const parsed = JSON.parse(localStorage.getItem(selectionKey()) || "[]");
    boardState.selected = new Set(Array.isArray(parsed) ? parsed.map(String) : []);
  } catch {
    boardState.selected = new Set();
  }
}

function saveSelection() {
  try { localStorage.setItem(selectionKey(), JSON.stringify([...boardState.selected])); } catch {}
}

function profileToken() {
  const token = localStorage.getItem(PROFILE_TOKEN_KEY) || "";
  return /^[A-Za-z0-9_-]{43,128}$/.test(token) ? token : "";
}

function currentEnergy() {
  const active = document.querySelector("#energyChoices [data-energy].active");
  const n = Number(active?.dataset.energy);
  return Number.isFinite(n) ? n : 3;
}

function currentMinutes() {
  const remaining = document.getElementById("sessionRemaining")?.textContent?.match(/(\d+)\s*分/);
  if (remaining) return Math.max(5, Number(remaining[1]));
  const active = document.querySelector("#timeChoices [data-minutes].active");
  const n = Number(active?.dataset.minutes);
  return Number.isFinite(n) ? n : 60;
}

function stateUrl(mode) {
  const params = new URLSearchParams({ lodestone_id: "3091607", planner_mode: mode });
  if (document.getElementById("dailyLeveling")?.checked) params.set("completed_leveling", "1");
  if (document.getElementById("dailyAlliance")?.checked) params.set("completed_alliance", "1");
  return `/api/state?${params.toString()}`;
}

async function fetchMode(mode) {
  const response = await fetch(stateUrl(mode), { headers: { "x-profile-token": profileToken() } });
  if (!response.ok) throw new Error(`${mode}: HTTP ${response.status}`);
  return response.json();
}

function taskKey(method, sourceMode) {
  return String(method?.task_key || `${sourceMode}:${method?.title || "task"}`);
}

function isFishing(method) {
  const text = `${method?.title || ""} ${method?.badge || ""} ${method?.job_code || ""}`;
  return method?.job_code === "FSH" || /釣|フィッシング|fish/i.test(text);
}

function timedMeta(method) {
  const explicit = method?.time_window;
  if (explicit && typeof explicit === "object") {
    const starts = Number(explicit.starts_in_minutes);
    return {
      open: explicit.state === "open" || starts === 0,
      startsIn: Number.isFinite(starts) ? Math.max(0, Math.round(starts)) : null,
      duration: Math.max(1, Number(explicit.duration_minutes) || 6),
      label: String(explicit.label || "時間限定")
    };
  }
  const text = `${method?.badge || ""} ${method?.reason || ""} ${method?.condition || ""} ${method?.title || ""}`;
  const looksTimed = /時間限定|今しか|出現時間|次窓|天候|ET\s*\d/i.test(text);
  if (!looksTimed) return null;
  const open = /いま出現時間内|今しか|開催中|受付中/.test(text);
  const match = text.match(/次の出現まで実時間約\s*(\d+)\s*分/);
  const startsIn = open ? 0 : (match ? Number(match[1]) : null);
  const window = text.match(/ET\s*([0-9: -]+(?:\/\s*[0-9: -]+)?)/i)?.[1]?.trim();
  return { open, startsIn, duration: 6, label: window ? `ET ${window}` : "時間限定" };
}

function categoryFor(method, sourceMode) {
  if (sourceMode === "efficient") return "combat";
  if (sourceMode === "craft") return "craft";
  if (sourceMode === "gather") return isFishing(method) ? "fishing" : "gather";
  return isFishing(method) ? "fishing" : "other";
}

function normalizeMethod(method, sourceMode) {
  const category = categoryFor(method, sourceMode);
  return {
    ...method,
    _sourceMode: sourceMode,
    _category: category,
    _key: taskKey(method, sourceMode),
    _timed: timedMeta(method)
  };
}

function rebuildCatalog(payloads) {
  boardState.catalog = new Map(CATEGORIES.map(([key]) => [key, []]));
  const timed = [];
  const seen = new Set();
  for (const [mode, payload] of payloads) {
    for (const raw of payload?.plan?.methods || []) {
      const method = normalizeMethod(raw, mode);
      if (seen.has(method._key)) continue;
      seen.add(method._key);
      if (method._timed) timed.push(method);
      else boardState.catalog.get(method._category)?.push(method);
    }
  }
  for (const [category, rows] of boardState.catalog) {
    boardState.catalog.set(category, rows.slice(0, 3));
  }
  boardState.timed = timed
    .sort((a, b) => (a._timed.startsIn ?? 9999) - (b._timed.startsIn ?? 9999))
    .slice(0, 3);
}

function allTasks() {
  return [...boardState.catalog.values()].flat().concat(boardState.timed);
}

function selectedTasks() {
  const map = new Map(allTasks().map(task => [task._key, task]));
  return [...boardState.selected].map(key => map.get(key)).filter(Boolean);
}

function hashText(value) {
  let hash = 2166136261;
  for (const char of String(value || "")) {
    hash ^= char.codePointAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function costTarget(task) {
  if (task._category !== "craft") return null;
  if (STATIC_COST_TASKS.has(task.task_key)) return { taskKey: task.task_key, dynamic: false };
  const quoted = String(task.title || "").match(/「([^」]{1,120})」/);
  if (!quoted) return null;
  const quantityMatch = String(task.title || "").match(/(\d{1,2})\s*個/);
  const quantity = Math.max(1, Math.min(99, Number(quantityMatch?.[1] || 1)));
  const itemName = quoted[1].trim();
  if (!itemName) return null;
  const safeTaskKey = /^craft:[A-Za-z0-9:_-]{1,110}$/.test(String(task.task_key || ""))
    ? String(task.task_key)
    : `craft:dynamic:${hashText(`${itemName}:${quantity}`)}`;
  return { taskKey: safeTaskKey, dynamic: true, itemName, quantity, hqRequired: /HQ/i.test(String(task.title || "")) };
}

async function loadMaterials(task) {
  if (boardState.materialByKey.has(task._key) || boardState.loadingMaterials.has(task._key)) return;
  const target = costTarget(task);
  if (!target) {
    boardState.materialByKey.set(task._key, { supported: false, rows: [], cost: 0 });
    return;
  }
  boardState.loadingMaterials.add(task._key);
  renderSummary();
  const params = new URLSearchParams({
    task_key: target.taskKey,
    energy: String(currentEnergy()),
    available_minutes: String(currentMinutes())
  });
  if (target.dynamic) {
    params.set("dynamic", "1");
    params.set("item_name", target.itemName);
    params.set("quantity", String(target.quantity));
    params.set("hq_required", target.hqRequired ? "1" : "0");
  }
  try {
    const response = await fetch(`/api/leve/cost-advice?${params.toString()}`, {
      headers: { "x-profile-token": profileToken() }
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await response.json();
    const advice = payload?.advice;
    const route = advice?.routes?.find(row => row.key === advice.recommendedKey);
    const rows = (route?.purchases || []).map(row => {
      const quantity = Math.max(0, Number(row.buyQuantity ?? row.quantity) || 0);
      const cost = Number.isFinite(Number(row.additionalTotal))
        ? Number(row.additionalTotal)
        : Number.isFinite(Number(row.total)) ? Number(row.total) : 0;
      return {
        itemId: Number(row.itemId) || null,
        name: String(row.itemName || `Item ${row.itemId}`),
        quantity,
        hq: Boolean(row.hq),
        cost
      };
    }).filter(row => row.quantity > 0);
    boardState.materialByKey.set(task._key, {
      supported: true,
      rows,
      cost: Number.isFinite(Number(route?.additionalGil)) ? Number(route.additionalGil) : rows.reduce((sum, row) => sum + row.cost, 0),
      routeLabel: String(route?.label || "")
    });
  } catch (error) {
    boardState.materialByKey.set(task._key, { supported: true, error: error.message, rows: [], cost: 0 });
  } finally {
    boardState.loadingMaterials.delete(task._key);
    renderSummary();
    renderTaskGrid();
  }
}

function aggregateMaterials() {
  const rows = new Map();
  let cost = 0;
  let supportedTasks = 0;
  let failedTasks = 0;
  for (const task of selectedTasks()) {
    const material = boardState.materialByKey.get(task._key);
    if (!material) continue;
    if (material.supported) supportedTasks += 1;
    if (material.error) failedTasks += 1;
    cost += Number(material.cost || 0);
    for (const row of material.rows || []) {
      const key = `${row.itemId || row.name}:${row.hq ? 1 : 0}`;
      const current = rows.get(key) || { ...row, quantity: 0, cost: 0 };
      current.quantity += Number(row.quantity || 0);
      current.cost += Number(row.cost || 0);
      rows.set(key, current);
    }
  }
  return { rows: [...rows.values()].sort((a, b) => a.name.localeCompare(b.name, "ja")), cost, supportedTasks, failedTasks };
}

function formatGil(value) {
  return `${Math.max(0, Math.round(Number(value) || 0)).toLocaleString("ja-JP")}G`;
}

function formatClock(date) {
  return new Intl.DateTimeFormat("ja-JP", { hour: "2-digit", minute: "2-digit", hour12: false }).format(date);
}

function atMinutes(base, minutes) {
  return new Date(base.getTime() + Math.max(0, Number(minutes) || 0) * 60000);
}

function scheduleRows() {
  const selected = selectedTasks();
  if (!selected.length) return [];
  const now = new Date();
  const timedSelected = selected.filter(task => task._timed).sort((a, b) => (a._timed.startsIn ?? 9999) - (b._timed.startsIn ?? 9999));
  const normal = selected.filter(task => !task._timed);
  const rows = [];
  let cursor = now;
  const timed = timedSelected[0] || null;

  if (!timed || timed._timed.startsIn == null) {
    for (const task of normal) {
      const minutes = Math.max(1, Number(task.minutes) || 15);
      const end = atMinutes(cursor, minutes);
      rows.push({ time: `${formatClock(cursor)}–${formatClock(end)}`, title: task.title, kind: CATEGORIES.find(([key]) => key === task._category)?.[1] || "通常", timed: false });
      cursor = end;
    }
    if (timed) rows.push({ time: timed._timed.open ? "いま" : "時刻確認", title: timed.title, kind: "時限", timed: true });
    return rows;
  }

  const startsIn = Math.max(0, timed._timed.startsIn);
  const prepMinutes = startsIn >= 7 ? 7 : 0;
  let availableBefore = Math.max(0, startsIn - prepMinutes);
  const before = [];
  const after = [];
  for (const task of normal) {
    const minutes = Math.max(1, Number(task.minutes) || 15);
    if (minutes <= availableBefore) {
      before.push(task);
      availableBefore -= minutes;
    } else {
      after.push(task);
    }
  }
  for (const task of before) {
    const minutes = Math.max(1, Number(task.minutes) || 15);
    const end = atMinutes(cursor, minutes);
    rows.push({ time: `${formatClock(cursor)}–${formatClock(end)}`, title: task.title, kind: CATEGORIES.find(([key]) => key === task._category)?.[1] || "通常", timed: false });
    cursor = end;
  }
  const timedStart = atMinutes(now, startsIn);
  if (prepMinutes > 0) {
    const prepStart = atMinutes(timedStart, -prepMinutes);
    rows.push({ time: `${formatClock(prepStart)}–${formatClock(timedStart)}`, title: "移動・準備", kind: "時限前", timed: true });
  }
  const timedEnd = atMinutes(timedStart, timed._timed.duration || 6);
  rows.push({ time: `${formatClock(timedStart)}–${formatClock(timedEnd)}`, title: timed.title, kind: "時限", timed: true });
  cursor = timedEnd;
  for (const task of after) {
    const minutes = Math.max(1, Number(task.minutes) || 15);
    const end = atMinutes(cursor, minutes);
    rows.push({ time: `${formatClock(cursor)}–${formatClock(end)}`, title: task.title, kind: CATEGORIES.find(([key]) => key === task._category)?.[1] || "通常", timed: false });
    cursor = end;
  }
  for (const extra of timedSelected.slice(1)) {
    const start = extra._timed.startsIn == null ? null : atMinutes(now, extra._timed.startsIn);
    rows.push({ time: start ? formatClock(start) : "時刻確認", title: extra.title, kind: "時限候補", timed: true });
  }
  return rows;
}

function make(tag, className, text = null) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function renderTabs() {
  const tabs = document.getElementById("taskBoardTabs");
  if (!tabs) return;
  tabs.replaceChildren(...CATEGORIES.map(([key, label]) => {
    const button = make("button", `task-board-tab${boardState.activeCategory === key ? " active" : ""}`);
    button.type = "button";
    button.dataset.category = key;
    button.append(document.createTextNode(label));
    const count = make("small", "", String(boardState.catalog.get(key)?.length || 0));
    button.append(count);
    button.addEventListener("click", () => {
      boardState.activeCategory = key;
      renderTabs();
      renderTaskGrid();
    });
    return button;
  }));
}

function timedStatus(task) {
  const meta = task._timed;
  if (!meta) return "";
  if (meta.open) return "いま行ける";
  if (meta.startsIn == null) return "時刻確認が必要";
  if (meta.startsIn <= 1) return "まもなく開始";
  return `あと${meta.startsIn}分`;
}

function renderTimed() {
  const panel = document.getElementById("taskBoardTimed");
  const list = document.getElementById("taskBoardTimedList");
  if (!panel || !list) return;
  panel.classList.toggle("hidden", boardState.timed.length === 0);
  list.replaceChildren(...boardState.timed.map(task => {
    const row = make("label", "timed-task");
    const check = document.createElement("input");
    check.type = "checkbox";
    check.checked = boardState.selected.has(task._key);
    check.addEventListener("change", () => toggleSelection(task, check.checked));
    const copy = make("div", "timed-copy");
    copy.append(make("strong", "", task.title || "時限タスク"));
    copy.append(make("span", "", `${task._timed.label} · 目安${task.minutes || 15}分`));
    const clock = make("div", "timed-clock", timedStatus(task));
    if (task._timed.startsIn != null && !task._timed.open) {
      clock.append(make("small", "", `開始 ${formatClock(atMinutes(new Date(), task._timed.startsIn))}`));
    } else if (task._timed.open) {
      clock.append(make("small", "", `残り目安 約${task._timed.duration}分`));
    }
    row.append(check, copy, clock);
    return row;
  }));
}

function materialNote(task) {
  if (!boardState.selected.has(task._key) || task._category !== "craft") return "";
  if (boardState.loadingMaterials.has(task._key)) return "必要素材を計算中…";
  const data = boardState.materialByKey.get(task._key);
  if (!data) return "選択すると必要素材を計算";
  if (data.error) return "素材計算は取得できませんでした";
  if (!data.supported) return "素材自動展開は未対応";
  if (!data.rows.length) return "追加購入なし";
  return `不足 ${data.rows.length}種 · ${formatGil(data.cost)}`;
}

async function activateTask(task, button) {
  const modeButton = document.querySelector(`#modeChoices [data-mode="${task._sourceMode}"]`);
  const planButton = document.getElementById("planButton");
  if (!modeButton || !planButton) return;
  button.disabled = true;
  button.textContent = "NOWへ反映中…";
  modeButton.click();
  await new Promise(resolve => setTimeout(resolve, 40));
  planButton.click();
  for (let attempt = 0; attempt < 40; attempt += 1) {
    await new Promise(resolve => setTimeout(resolve, 100));
    const primary = document.querySelector(".method-card.recommended h3");
    if (primary?.textContent?.trim() === String(task.title || "").trim()) {
      document.getElementById("nowPanel")?.scrollIntoView({ behavior: "smooth", block: "start" });
      button.disabled = false;
      button.textContent = "NOWにする";
      return;
    }
    const alternatives = [...document.querySelectorAll(".method-alternative")];
    const alt = alternatives.find(node => node.querySelector(".alternative-title")?.textContent?.trim() === String(task.title || "").trim());
    if (alt) {
      alt.querySelector("[data-choose-method-index]")?.click();
      await new Promise(resolve => setTimeout(resolve, 60));
      document.getElementById("nowPanel")?.scrollIntoView({ behavior: "smooth", block: "start" });
      button.disabled = false;
      button.textContent = "NOWにする";
      return;
    }
  }
  button.disabled = false;
  button.textContent = "NOWにする";
}

function renderTaskGrid() {
  const grid = document.getElementById("taskBoardGrid");
  if (!grid) return;
  const tasks = boardState.catalog.get(boardState.activeCategory) || [];
  if (!tasks.length) {
    grid.replaceChildren(make("div", "task-board-empty", "今の進捗では、このカテゴリの通常候補はありません。"));
    return;
  }
  grid.replaceChildren(...tasks.map(task => {
    const card = make("label", `task-select-card${boardState.selected.has(task._key) ? " selected" : ""}`);
    const check = document.createElement("input");
    check.type = "checkbox";
    check.checked = boardState.selected.has(task._key);
    check.addEventListener("change", () => toggleSelection(task, check.checked));
    const body = make("div", "task-select-body");
    body.append(make("div", "task-select-title", task.title || "候補"));
    const meta = make("div", "task-select-meta");
    if (task.badge) meta.append(make("span", "task-chip", task.badge));
    if (task.minutes) meta.append(make("span", "task-chip", `約${task.minutes}分`));
    if (task.job_name) meta.append(make("span", "task-chip", `${task.job_name} Lv${task.job_level ?? ""}`));
    body.append(meta);
    if (task.reason) body.append(make("p", "task-select-reason", task.reason));
    const actions = make("div", "task-select-actions");
    const now = make("button", "task-now-button", "NOWにする");
    now.type = "button";
    now.addEventListener("click", event => {
      event.preventDefault();
      event.stopPropagation();
      activateTask(task, now);
    });
    actions.append(now);
    const note = materialNote(task);
    if (note) actions.append(make("span", "task-material-note", note));
    body.append(actions);
    card.append(check, body);
    return card;
  }));
}

function renderSchedule() {
  const rowsNode = document.getElementById("taskBoardScheduleRows");
  const meta = document.getElementById("taskBoardScheduleMeta");
  if (!rowsNode || !meta) return;
  const rows = scheduleRows();
  const selected = selectedTasks();
  meta.textContent = selected.length ? `選択${selected.length}件を時間順に配置` : "選ぶと時間割を自動作成";
  if (!rows.length) {
    const next = boardState.timed[0];
    const text = next
      ? `タスクを選ぶと「${timedStatus(next)}」の時限候補を避けて時間割を組みます。`
      : "タスクを複数選ぶと、所要時間から今日の順番を組みます。";
    rowsNode.replaceChildren(make("div", "schedule-empty", text));
    return;
  }
  rowsNode.replaceChildren(...rows.map(row => {
    const node = make("div", `schedule-row${row.timed ? " timed" : ""}`);
    node.append(make("span", "schedule-time", row.time));
    node.append(make("span", "schedule-title", row.title));
    node.append(make("span", "schedule-kind", row.kind));
    return node;
  }));
}

function renderSummary() {
  const summary = document.getElementById("taskBoardSummaryText");
  const materials = document.getElementById("taskBoardMaterials");
  if (!summary || !materials) return;
  const selected = selectedTasks();
  const totalMinutes = selected.reduce((sum, task) => sum + Math.max(0, Number(task.minutes) || 0), 0);
  const agg = aggregateMaterials();
  const loading = boardState.loadingMaterials.size;
  summary.replaceChildren();
  summary.append(document.createTextNode(`選択${selected.length}件｜合計約${totalMinutes}分｜不足素材${agg.rows.length}種`));
  const sub = make("small", "", agg.rows.length ? `追加支出の目安 ${formatGil(agg.cost)}${loading ? " · 計算中あり" : ""}` : (loading ? "必要素材を計算中…" : "生産タスクを選ぶと必要素材を合算します"));
  summary.append(sub);
  if (!agg.rows.length) {
    materials.replaceChildren(make("div", "material-muted", agg.failedTasks ? "一部の素材情報を取得できませんでした。" : "まだ合算する不足素材はありません。"));
    return;
  }
  materials.replaceChildren(...agg.rows.map(row => {
    const item = make("div", "material-row");
    item.append(make("span", "", `${row.name}${row.hq ? " HQ" : ""}`));
    item.append(make("strong", "", `×${Math.round(row.quantity)}`));
    return item;
  }));
  materials.append(make("div", "material-muted", `合算追加支出 約${formatGil(agg.cost)}。同じ素材はタスクをまたいで数量をまとめています。`));
}

function toggleSelection(task, selected) {
  if (selected) boardState.selected.add(task._key);
  else boardState.selected.delete(task._key);
  saveSelection();
  if (selected && task._category === "craft") loadMaterials(task);
  renderTimed();
  renderTaskGrid();
  renderSchedule();
  renderSummary();
}

function buildBoard() {
  if (document.getElementById("taskBoard")) return;
  const contextInbox = document.getElementById("contextInbox");
  const planner = document.getElementById("planner");
  if (!planner) return;
  const board = make("section", "task-board");
  board.id = "taskBoard";
  board.innerHTML = `
    <div class="task-board-head">
      <div><p class="task-board-kicker">TODAY TASK BOARD</p><h3>今日なにする？</h3><p class="muted">カテゴリから選ぶ。複数選択すると時間と必要素材をまとめます。</p></div>
      <div id="taskBoardStatus" class="task-board-status">候補を読み込み中…</div>
    </div>
    <div id="taskBoardTabs" class="task-board-tabs" role="tablist" aria-label="タスクカテゴリ"></div>
    <section id="taskBoardTimed" class="task-board-timed hidden">
      <div class="task-board-timed-head"><strong>⏱ 時限スケジュール</strong><span>通常カードと分離して表示</span></div>
      <div id="taskBoardTimedList" class="task-board-timed-list"></div>
    </section>
    <div id="taskBoardGrid" class="task-board-grid"></div>
    <section class="task-board-schedule">
      <div class="task-board-schedule-head"><strong>今日の時間割</strong><span id="taskBoardScheduleMeta"></span></div>
      <div id="taskBoardScheduleRows" class="schedule-rows"></div>
    </section>
    <section class="task-board-summary">
      <div class="task-board-summary-main"><div id="taskBoardSummaryText" class="task-board-summary-text"></div><button id="taskBoardPrepButton" class="task-board-prep-button" type="button">まとめて準備</button></div>
      <div id="taskBoardMaterials" class="task-board-materials hidden"></div>
    </section>`;
  if (contextInbox?.parentNode === planner) contextInbox.after(board);
  else planner.append(board);
  document.getElementById("taskBoardPrepButton")?.addEventListener("click", () => {
    const materials = document.getElementById("taskBoardMaterials");
    materials?.classList.toggle("hidden");
  });
}

function renderAll() {
  renderTabs();
  renderTimed();
  renderTaskGrid();
  renderSchedule();
  renderSummary();
}

async function refreshBoard() {
  if (!document.getElementById("taskBoard")) return;
  const revision = ++boardState.loadRevision;
  const status = document.getElementById("taskBoardStatus");
  if (status) status.textContent = "候補を読み込み中…";
  const results = await Promise.allSettled(SOURCE_MODES.map(async mode => [mode, await fetchMode(mode)]));
  if (revision !== boardState.loadRevision) return;
  const payloads = results.filter(row => row.status === "fulfilled").map(row => row.value);
  rebuildCatalog(payloads);
  const validKeys = new Set(allTasks().map(task => task._key));
  boardState.selected = new Set([...boardState.selected].filter(key => validKeys.has(key)));
  saveSelection();
  boardState.ready = true;
  if (status) status.textContent = results.some(row => row.status === "rejected")
    ? "一部カテゴリは取得できませんでした"
    : "通常候補と時限候補を更新済み";
  renderAll();
  for (const task of selectedTasks().filter(task => task._category === "craft")) loadMaterials(task);
}

let refreshTimer = null;
function queueRefresh() {
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => refreshBoard(), 180);
}

function bindRefreshSources() {
  document.getElementById("timeChoices")?.addEventListener("click", queueRefresh);
  document.getElementById("energyChoices")?.addEventListener("click", () => {
    boardState.materialByKey.clear();
    queueRefresh();
  });
  document.getElementById("dailyLeveling")?.addEventListener("change", queueRefresh);
  document.getElementById("dailyAlliance")?.addEventListener("change", queueRefresh);
  for (const eventName of ["ff14today:context-updated", "ff14today:inventory-evidence-updated", "ff14today:context-saved"]) {
    window.addEventListener(eventName, () => {
      boardState.materialByKey.clear();
      queueRefresh();
    });
  }
}

function init() {
  injectStyles();
  loadSelection();
  buildBoard();
  bindRefreshSources();
  renderAll();
  refreshBoard();
  setInterval(() => {
    if (boardState.timed.length || selectedTasks().some(task => task._timed)) {
      renderTimed();
      renderSchedule();
    }
  }, 30000);
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
else init();

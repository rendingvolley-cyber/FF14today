const PREP_MINUTES = 7;
const FOCUS_FLOW_PREFIX = "ff14_today_focus_flow_v1_";

function toMinutes(clock) {
  const match = String(clock || "").match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isInteger(hours) || !Number.isInteger(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return hours * 60 + minutes;
}

function clockFromMinutes(value) {
  const day = 24 * 60;
  const normalized = ((Number(value) % day) + day) % day;
  const hours = Math.floor(normalized / 60);
  const minutes = normalized % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
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

export function hasActiveFocusFlow(storage = typeof localStorage !== "undefined" ? localStorage : null, date = new Date()) {
  if (!storage) return false;
  try {
    const raw = storage.getItem(`${FOCUS_FLOW_PREFIX}${japanDateKey(date)}`);
    const parsed = raw ? JSON.parse(raw) : null;
    return Boolean(parsed?.active?.title && Number(parsed?.active?.startedAt) > 0);
  } catch {
    return false;
  }
}

export function correctedPreparationRange(timedRange, prepMinutes = PREP_MINUTES) {
  const match = String(timedRange || "").match(/^(\d{1,2}:\d{2})[–-](\d{1,2}:\d{2})$/);
  if (!match) return null;
  const start = toMinutes(match[1]);
  if (start == null) return null;
  const safePrep = Math.max(1, Math.min(30, Math.round(Number(prepMinutes) || PREP_MINUTES)));
  return `${clockFromMinutes(start - safePrep)}–${clockFromMinutes(start)}`;
}

export function correctPreparationRows(root = typeof document !== "undefined" ? document : null) {
  const schedule = root?.querySelector?.("#taskBoardScheduleRows");
  if (!schedule) return 0;
  const rows = [...schedule.querySelectorAll(".schedule-row")];
  let corrected = 0;
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    if (row.querySelector(".schedule-title")?.textContent?.trim() !== "移動・準備") continue;
    const nextTimed = rows.slice(index + 1).find(candidate => {
      const title = candidate.querySelector(".schedule-title")?.textContent?.trim();
      return candidate.classList.contains("timed") && title && title !== "移動・準備";
    });
    if (!nextTimed) continue;
    const nextRange = nextTimed.querySelector(".schedule-time")?.textContent?.trim();
    const desired = correctedPreparationRange(nextRange);
    const timeNode = row.querySelector(".schedule-time");
    if (!desired || !timeNode || timeNode.textContent === desired) continue;
    timeNode.textContent = desired;
    corrected += 1;
  }
  return corrected;
}

export function activateNowLayout(root = typeof document !== "undefined" ? document : null) {
  if (!root?.body) return false;
  root.body.classList.add("task-board-now-active");
  return true;
}

function promoteTaskBoard(root = document) {
  if (!root?.body || root.getElementById("taskBoardPrimaryStyles")) return;
  const style = root.createElement("style");
  style.id = "taskBoardPrimaryStyles";
  style.textContent = `
    body.task-board-primary .planner-hero,
    body.task-board-primary .mode-picker,
    body.task-board-primary #planButton { display: none !important; }
    body.task-board-primary #planner { padding-bottom: 10px; }
    body.task-board-primary:not(.task-board-now-active) #nowPanel { display: none !important; }
    body.task-board-primary.task-board-now-active #nowPanel .method-alternative,
    body.task-board-primary.task-board-now-active #nowPanel .methods-help { display: none !important; }

    body.task-board-primary .task-board-schedule {
      margin: 0 14px 10px;
      padding: 16px;
      border: 1px solid #dbe7f2;
      border-radius: 16px;
      background: linear-gradient(180deg, #ffffff 0%, #f8fbff 100%);
    }
    body.task-board-primary .task-board-schedule-head {
      margin-bottom: 11px;
    }
    body.task-board-primary .task-board-schedule-head strong {
      font-size: 1rem;
      color: #173f68;
    }
    body.task-board-primary .task-board-schedule-head span {
      padding: 5px 9px;
      border-radius: 999px;
      background: #edf4fb;
      color: #66809a;
    }
    body.task-board-primary .schedule-empty {
      padding: 13px 14px;
      border: 1px dashed #c9d9e8;
      border-radius: 12px;
      background: #fbfdff;
      color: #6d8298;
      line-height: 1.55;
    }
    body.task-board-primary .task-board-summary {
      position: static;
      bottom: auto;
      z-index: auto;
      margin: 0 14px 16px;
      padding: 14px 15px;
      border: 1px solid #d7e4f0;
      border-radius: 16px;
      background: #f6faff;
      color: #234c73;
      box-shadow: none;
    }
    body.task-board-primary .task-board-summary-main {
      gap: 16px;
    }
    body.task-board-primary .task-board-summary-text {
      font-size: .86rem;
      line-height: 1.45;
      color: #244e76;
    }
    body.task-board-primary .task-board-summary-text small {
      margin-top: 4px;
      color: #71869b;
      opacity: 1;
    }
    body.task-board-primary .task-board-prep-button {
      padding: 9px 14px;
      border: 1px solid #2f6599;
      border-radius: 10px;
      background: #2f6599;
      color: #fff;
      box-shadow: 0 5px 12px rgba(47, 101, 153, .16);
      transition: background .15s ease, transform .15s ease, box-shadow .15s ease;
    }
    body.task-board-primary .task-board-prep-button:hover {
      background: #285a8b;
      box-shadow: 0 6px 14px rgba(47, 101, 153, .22);
      transform: translateY(-1px);
    }
    body.task-board-primary .task-board-materials {
      border-top-color: #d7e4f0;
      color: #365c80;
    }
    body.task-board-primary .material-muted {
      color: #71869b;
      opacity: 1;
    }
    @media(max-width:680px) {
      body.task-board-primary .task-board-schedule,
      body.task-board-primary .task-board-summary { margin-left: 10px; margin-right: 10px; }
      body.task-board-primary .task-board-schedule-head { align-items: flex-start; }
      body.task-board-primary .task-board-schedule-head span { text-align: right; }
      body.task-board-primary .task-board-summary-main { align-items: stretch; flex-direction: column; }
      body.task-board-primary .task-board-prep-button { width: 100%; }
    }
  `;
  root.head.append(style);
  root.body.classList.add("task-board-primary");
  if (hasActiveFocusFlow()) activateNowLayout(root);
}

let queued = false;
function queueCorrection() {
  if (queued || typeof requestAnimationFrame !== "function") return;
  queued = true;
  requestAnimationFrame(() => {
    queued = false;
    correctPreparationRows();
    if (hasActiveFocusFlow()) activateNowLayout(document);
  });
}

if (typeof document !== "undefined") {
  promoteTaskBoard(document);
  document.addEventListener("click", event => {
    if (event.target?.closest?.(".task-now-button")) activateNowLayout(document);
    if (event.target?.closest?.("#taskBoard")) queueCorrection();
  }, true);
  document.addEventListener("change", event => {
    if (event.target?.closest?.("#taskBoard")) queueCorrection();
  });
  for (const delay of [100, 500, 1500]) setTimeout(queueCorrection, delay);
  setInterval(queueCorrection, 30000);
}

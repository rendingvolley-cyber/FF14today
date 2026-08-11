const PREP_MINUTES = 7;

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
  `;
  root.head.append(style);
  root.body.classList.add("task-board-primary");
}

let queued = false;
function queueCorrection() {
  if (queued || typeof requestAnimationFrame !== "function") return;
  queued = true;
  requestAnimationFrame(() => {
    queued = false;
    correctPreparationRows();
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

const STORAGE_PREFIX = "ff14_today_gather_checklist_";
const originalFetch = window.fetch.bind(window);
let latestPlan = null;
let renderQueued = false;
let rendering = false;

function japanDateKey() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date());
  const get = type => parts.find(part => part.type === type)?.value || "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function storageKey() {
  return `${STORAGE_PREFIX}${japanDateKey()}`;
}

function loadChecks() {
  try { return JSON.parse(localStorage.getItem(storageKey()) || "{}"); }
  catch { return {}; }
}

function saveChecks(value) {
  localStorage.setItem(storageKey(), JSON.stringify(value));
}

function itemIdentity(item) {
  return [item?.key || item?.title || "task", item?.timing || "anytime"].join("|");
}

function installStyles() {
  if (document.getElementById("gatherChecklistStyles")) return;
  const style = document.createElement("style");
  style.id = "gatherChecklistStyles";
  style.textContent = `
    .gather-checklist-card{border:2px solid var(--accent);border-radius:22px;background:linear-gradient(180deg,#fff 0,#f8faff 100%);padding:22px;box-shadow:0 12px 32px rgba(79,124,255,.12)}
    .gather-checklist-head{display:flex;justify-content:space-between;gap:14px;align-items:flex-start;margin-bottom:16px}
    .gather-checklist-head h3{margin:0;font-size:clamp(20px,3vw,27px)}
    .gather-checklist-subtitle{margin:6px 0 0;color:var(--muted);line-height:1.65;font-size:13px}
    .gather-progress{flex:0 0 auto;border-radius:999px;background:var(--accent-soft);color:var(--accent);padding:7px 10px;font-size:11px;font-weight:900;white-space:nowrap}
    .gather-task-list{display:flex;flex-direction:column;gap:10px}
    .gather-task{display:grid;grid-template-columns:auto minmax(0,1fr);gap:12px;align-items:flex-start;border:1px solid var(--line);border-radius:17px;background:#fff;padding:15px;cursor:pointer;transition:.16s ease}
    .gather-task:hover{border-color:rgba(79,124,255,.42);transform:translateY(-1px)}
    .gather-task.important{border-color:rgba(79,124,255,.40);background:var(--accent-soft)}
    .gather-task input{width:21px;height:21px;margin-top:2px;accent-color:var(--accent);cursor:pointer}
    .gather-task-copy{min-width:0}.gather-task-top{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
    .gather-task-time{display:inline-flex;border-radius:999px;background:#f3f6fb;color:var(--muted);padding:4px 8px;font-size:10px;font-weight:900}
    .gather-task-title{font-weight:900;line-height:1.45}.gather-task-detail{margin:6px 0 0;color:#556176;font-size:12px;line-height:1.65}
    .gather-task:has(input:checked){opacity:.62}.gather-task:has(input:checked) .gather-task-title{text-decoration:line-through}
    .gather-next-window{margin:13px 2px 0;color:var(--muted);font-size:11px;line-height:1.6}
    .gather-all-done{margin:14px 0 0;padding:12px 14px;border-radius:14px;background:var(--accent);color:#fff;text-align:center;font-weight:900}
    @media(max-width:600px){.gather-checklist-card{padding:17px}.gather-checklist-head{flex-direction:column}.gather-progress{align-self:flex-start}}
  `;
  document.head.append(style);
}

function updateProgress(card, checklist) {
  const checks = loadChecks();
  const items = checklist.items || [];
  const done = items.filter(item => checks[itemIdentity(item)]).length;
  const progress = card.querySelector("[data-gather-progress]");
  if (progress) progress.textContent = `${done} / ${items.length} 完了`;
  let doneBox = card.querySelector(".gather-all-done");
  if (items.length && done === items.length) {
    if (!doneBox) {
      doneBox = document.createElement("div");
      doneBox.className = "gather-all-done";
      doneBox.textContent = "✓ この採集プランは完了";
      card.append(doneBox);
    }
  } else {
    doneBox?.remove();
  }
}

function taskNode(item, checklist, card) {
  const checks = loadChecks();
  const id = itemIdentity(item);
  const label = document.createElement("label");
  label.className = `gather-task${item.important ? " important" : ""}`;

  const input = document.createElement("input");
  input.type = "checkbox";
  input.checked = Boolean(checks[id]);
  input.addEventListener("change", () => {
    const next = loadChecks();
    if (input.checked) next[id] = true;
    else delete next[id];
    saveChecks(next);
    updateProgress(card, checklist);
  });

  const copy = document.createElement("div");
  copy.className = "gather-task-copy";
  const top = document.createElement("div");
  top.className = "gather-task-top";
  if (item.timing) {
    const time = document.createElement("span");
    time.className = "gather-task-time";
    time.textContent = item.timing;
    top.append(time);
  }
  const title = document.createElement("span");
  title.className = "gather-task-title";
  title.textContent = item.title;
  top.append(title);
  copy.append(top);
  if (item.detail) {
    const detail = document.createElement("p");
    detail.className = "gather-task-detail";
    detail.textContent = item.detail;
    copy.append(detail);
  }
  label.append(input, copy);
  return label;
}

function renderChecklist(plan) {
  if (rendering || !plan?.gather_checklist) return;
  const list = document.getElementById("methodList");
  const content = document.getElementById("planContent");
  if (!list || !content || content.classList.contains("hidden")) return;

  const checklist = plan.gather_checklist;
  const signature = JSON.stringify(checklist);
  if (list.dataset.gatherChecklistSignature === signature) return;
  rendering = true;
  installStyles();

  const card = document.createElement("article");
  card.className = "gather-checklist-card";
  const head = document.createElement("div");
  head.className = "gather-checklist-head";
  const headCopy = document.createElement("div");
  const title = document.createElement("h3");
  title.textContent = checklist.title || "採集タスク";
  const subtitle = document.createElement("p");
  subtitle.className = "gather-checklist-subtitle";
  subtitle.textContent = checklist.subtitle || "";
  headCopy.append(title, subtitle);
  const progress = document.createElement("span");
  progress.className = "gather-progress";
  progress.dataset.gatherProgress = "1";
  head.append(headCopy, progress);
  card.append(head);

  const tasks = document.createElement("div");
  tasks.className = "gather-task-list";
  (checklist.items || []).forEach(item => tasks.append(taskNode(item, checklist, card)));
  card.append(tasks);
  if (checklist.next_window_note) {
    const note = document.createElement("p");
    note.className = "gather-next-window";
    note.textContent = checklist.next_window_note;
    card.append(note);
  }

  list.replaceChildren(card);
  list.dataset.gatherChecklistSignature = signature;
  const help = document.querySelector(".methods-help");
  if (help) help.textContent = "時限採集がプレイ枠に入る時だけ、迷わないようチェック式で順番を出します。時限がなければ通常の効率候補に戻ります。";
  updateProgress(card, checklist);
  rendering = false;
}

function queueRender() {
  if (renderQueued) return;
  renderQueued = true;
  requestAnimationFrame(() => requestAnimationFrame(() => {
    renderQueued = false;
    renderChecklist(latestPlan);
  }));
}

window.fetch = async (...args) => {
  const response = await originalFetch(...args);
  try {
    const input = args[0];
    const rawUrl = typeof input === "string" ? input : input?.url || "";
    const url = new URL(rawUrl, location.href);
    if (url.pathname === "/api/plan" || url.pathname === "/api/state") {
      response.clone().json().then(data => {
        latestPlan = data?.plan?.gather_checklist ? data.plan : null;
        if (latestPlan) queueRender();
      }).catch(() => {});
    }
  } catch {}
  return response;
};

const observer = new MutationObserver(() => {
  if (latestPlan?.gather_checklist) queueRender();
});

function startObserver() {
  const list = document.getElementById("methodList");
  if (list) observer.observe(list, { childList: true, subtree: false });
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", startObserver, { once: true });
else startObserver();

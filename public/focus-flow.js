const STORAGE_PREFIX = "ff14_today_focus_flow_v1_";

export function japanDateKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  const get = type => parts.find(part => part.type === type)?.value || "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export function storageKey(dateKey = japanDateKey()) {
  return `${STORAGE_PREFIX}${dateKey}`;
}

export function normalizeFlowState(value) {
  const skipped = Array.isArray(value?.skippedTitles)
    ? [...new Set(value.skippedTitles.map(item => String(item || "").trim()).filter(Boolean))].slice(0, 12)
    : [];
  const active = value?.active && typeof value.active === "object"
    ? {
        title: String(value.active.title || "").trim(),
        startedAt: Number(value.active.startedAt) || 0,
        plannedMinutes: Math.max(0, Number(value.active.plannedMinutes) || 0)
      }
    : null;
  return {
    active: active?.title && active.startedAt > 0 ? active : null,
    skippedTitles: skipped
  };
}

export function elapsedMinutes(startedAt, now = Date.now()) {
  const elapsed = Math.floor((Number(now) - Number(startedAt)) / 60000);
  return Number.isFinite(elapsed) ? Math.max(0, elapsed) : 0;
}

export function formatElapsed(startedAt, now = Date.now()) {
  const totalSeconds = Math.max(0, Math.floor((Number(now) - Number(startedAt)) / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function chooseNextUnskipped(primaryTitle, alternatives, skippedTitles) {
  const skipped = new Set((skippedTitles || []).map(String));
  if (!skipped.has(String(primaryTitle || ""))) return null;
  return (alternatives || []).find(item => item?.title && !skipped.has(String(item.title))) || null;
}

export function patchCompletionBody(body, active, now = Date.now()) {
  if (!body || !active || String(body.task_title || "").trim() !== String(active.title || "").trim()) return body;
  const measured = elapsedMinutes(active.startedAt, now);
  if (measured < 1 || measured > 480) return body;
  return { ...body, actual_minutes: measured };
}

function bootFocusFlow() {
  const methodList = document.getElementById("methodList");
  const nowPanel = document.getElementById("nowPanel");
  if (!methodList || !nowPanel) return;

  let dateKey = japanDateKey();
  let pendingCompleteTitle = null;

  const load = () => {
    try {
      return normalizeFlowState(JSON.parse(localStorage.getItem(storageKey(dateKey)) || "{}"));
    } catch {
      return normalizeFlowState({});
    }
  };

  let flow = load();
  const save = () => {
    try {
      localStorage.setItem(storageKey(dateKey), JSON.stringify(flow));
    } catch {
      // Focus Flow persistence is optional. Never block the planner.
    }
  };

  const titleOfPrimary = () => methodList.querySelector(".method-card.recommended h3")?.textContent?.trim() || "";

  const originalFetch = window.fetch.bind(window);
  window.fetch = (input, init = {}) => {
    const url = typeof input === "string" ? input : input?.url || "";
    if (url.includes("/api/activity/complete") && typeof init.body === "string" && flow.active) {
      try {
        const body = JSON.parse(init.body);
        init = { ...init, body: JSON.stringify(patchCompletionBody(body, flow.active)) };
      } catch {
        // Preserve the original request if the body is not JSON.
      }
    }
    return originalFetch(input, init);
  };

  function parsePlannedMinutes(card) {
    const text = card?.querySelector(".method-meta")?.textContent || "";
    const match = text.match(/(\d+)\s*分/);
    return match ? Number(match[1]) : 0;
  }

  function alternatives() {
    return [...methodList.querySelectorAll(".method-alternative")].map(details => ({
      title: details.querySelector(".alternative-title")?.textContent?.trim() || "",
      button: details.querySelector("[data-choose-method-index]")
    })).filter(item => item.title && item.button);
  }

  function ensureResumeBanner() {
    let banner = document.getElementById("focusFlowResume");
    if (!flow.active) {
      banner?.remove();
      return;
    }

    if (!banner) {
      banner = document.createElement("div");
      banner.id = "focusFlowResume";
      banner.className = "focus-flow-resume";
      methodList.before(banner);
    }

    const currentTitle = titleOfPrimary();
    const activeVisible = currentTitle === flow.active.title;
    banner.replaceChildren();

    const copy = document.createElement("div");
    const label = document.createElement("strong");
    label.textContent = activeVisible ? "▶ いま実行中" : "↩ 途中から戻れます";
    const text = document.createElement("span");
    text.textContent = `${flow.active.title} · ${formatElapsed(flow.active.startedAt)}`;
    copy.append(label, text);
    banner.append(copy);

    if (!activeVisible) {
      const resume = document.createElement("button");
      resume.type = "button";
      resume.textContent = "この続きへ";
      resume.addEventListener("click", () => {
        const match = alternatives().find(item => item.title === flow.active?.title);
        if (match) match.button.click();
        else banner.classList.add("focus-flow-missing");
      });
      banner.append(resume);
    }
  }

  function renderActions(card, title) {
    let actions = card.querySelector(".focus-flow-actions");
    if (!actions) {
      actions = document.createElement("div");
      actions.className = "focus-flow-actions";
      const complete = card.querySelector("[data-complete-current]");
      if (complete) card.insertBefore(actions, complete);
      else card.append(actions);
    }

    let start = actions.querySelector(".focus-flow-start");
    if (!start) {
      start = document.createElement("button");
      start.type = "button";
      start.className = "focus-flow-start";
      actions.append(start);
    }

    let skip = actions.querySelector(".focus-flow-skip");
    if (!skip) {
      skip = document.createElement("button");
      skip.type = "button";
      skip.className = "focus-flow-skip";
      skip.textContent = "今日はスキップ";
      actions.append(skip);
    }

    const isRunning = flow.active?.title === title;
    start.classList.toggle("running", isRunning);
    start.textContent = isRunning ? `▶ 実行中 ${formatElapsed(flow.active.startedAt)}` : "▶ START";
    start.onclick = () => {
      if (flow.active?.title === title) return;
      flow.active = {
        title,
        startedAt: Date.now(),
        plannedMinutes: parsePlannedMinutes(card)
      };
      save();
      reconcile();
    };

    skip.onclick = () => {
      if (!flow.skippedTitles.includes(title)) flow.skippedTitles.push(title);
      if (flow.active?.title === title) flow.active = null;
      save();
      const nextChoice = alternatives().find(item => !flow.skippedTitles.includes(item.title));
      if (nextChoice) {
        nextChoice.button.click();
        setTimeout(reconcile, 0);
        return;
      }
      card.classList.add("focus-flow-skipped-all");
      actions.replaceChildren();
      const note = document.createElement("p");
      note.className = "focus-flow-done-note";
      note.textContent = "この候補は今日は追わなくてOK。別の遊び方に切り替えるか、ここで終了で十分です。";
      actions.append(note);
    };
  }

  function reconcile() {
    const today = japanDateKey();
    if (today !== dateKey) {
      dateKey = today;
      flow = load();
    }

    const card = methodList.querySelector(".method-card.recommended");
    if (!card) {
      ensureResumeBanner();
      return;
    }

    const title = titleOfPrimary();
    if (!title) return;

    if (pendingCompleteTitle && pendingCompleteTitle !== title && flow.active?.title === pendingCompleteTitle) {
      flow.active = null;
      pendingCompleteTitle = null;
      save();
    }

    const next = chooseNextUnskipped(title, alternatives(), flow.skippedTitles);
    if (next) {
      next.button.click();
      setTimeout(reconcile, 0);
      return;
    }

    renderActions(card, title);
    ensureResumeBanner();
  }

  methodList.addEventListener("click", event => {
    if (event.target.closest("[data-complete-current]")) pendingCompleteTitle = titleOfPrimary();
    setTimeout(reconcile, 0);
  }, true);

  reconcile();
  setInterval(reconcile, 1000);
}

if (typeof window !== "undefined" && typeof document !== "undefined") {
  window.addEventListener("DOMContentLoaded", bootFocusFlow, { once: true });
}

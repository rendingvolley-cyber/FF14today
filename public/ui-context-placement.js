function injectPlacementStyles() {
  if (document.getElementById("uiContextPlacementStyles")) return;
  const style = document.createElement("style");
  style.id = "uiContextPlacementStyles";
  style.textContent = `
    body.ui-context-placement-ready .topbar{margin-bottom:10px}
    .identity.identity-compact{padding:9px 12px;border-radius:16px;margin-bottom:12px;box-shadow:0 6px 18px rgba(40,72,128,.06)}
    .identity.identity-compact .identity-main{gap:9px}
    .identity.identity-compact .avatar-orb{width:34px;height:34px;font-size:14px}
    .identity.identity-compact .label{display:none}
    .identity.identity-compact h2{font-size:15px;margin:0 0 1px}
    .identity.identity-compact .muted{font-size:11px}
    .identity.identity-compact .identity-actions{gap:9px}
    .identity.identity-compact .sync-meta{font-size:11px}
    .identity.identity-compact .quiet-button{padding:7px 10px;font-size:11px}
    .context-inbox.routine-context-inbox{margin:12px 0 14px;padding:13px 14px;border-radius:15px;background:linear-gradient(180deg,#fbfdff,#f5f8ff)}
    .context-inbox.routine-context-inbox .context-inbox-icon{width:30px;height:30px;border-radius:9px;font-size:15px}
    .context-inbox.routine-context-inbox .context-inbox-copy{margin-top:6px}
    .context-inbox.plan-context-inbox{margin:18px 0 4px}
    @media(max-width:760px){
      .identity.identity-compact{flex-direction:row;align-items:center;gap:10px}
      .identity.identity-compact .identity-actions{width:auto;margin-left:auto;justify-content:flex-end}
      .identity.identity-compact .sync-meta{display:none}
    }
  `;
  document.head.append(style);
}

function promoteIdentity() {
  const topbar = document.querySelector(".topbar");
  const identity = document.getElementById("identity");
  if (!topbar || !identity) return false;
  if (topbar.nextElementSibling !== identity) topbar.insertAdjacentElement("afterend", identity);
  identity.classList.add("identity-compact");
  document.body.classList.add("ui-context-placement-ready");
  return true;
}

function inboxNodes() {
  const inbox = document.getElementById("contextInbox");
  if (!inbox) return null;
  return {
    inbox,
    title: inbox.querySelector(".context-inbox-title span:last-child"),
    copy: inbox.querySelector(".context-inbox-copy"),
    status: document.getElementById("contextInboxStatus")
  };
}

function copyFor(step) {
  if (step === "grand-company") {
    return {
      title: "双蛇党の納品一覧スクショを追加",
      copy: "今日の納品一覧が見えるスクショを、このカードのまま Ctrl+V。必要数・所持数・ボーナス表示を読み取ります。",
      idle: "双蛇党の納品一覧スクショをコピーして、このカードで Ctrl+V。"
    };
  }
  if (step === "retainer") {
    return {
      title: "リテイナーの調達依頼スクショを追加",
      copy: "いま開いているリテイナーの調達依頼画面を、このカードのまま Ctrl+V。名前・ジョブ・Lvと見えている候補を読み取ります。",
      idle: "リテイナーの調達依頼画面をコピーして、このカードで Ctrl+V。"
    };
  }
  return {
    title: "スクショを判断材料に追加",
    copy: "ジャーナル、製作・採集ステータス、所持素材など、今日のプラン判断に使う画面をそのまま貼り付けられます。",
    idle: "FF14でスクショをコピーして、このページで Ctrl+V。"
  };
}

function currentRoutineStep() {
  const root = document.getElementById("retainerAdvice");
  if (!root) return "plan";
  const gc = root.querySelector("[data-gc-content]");
  const retainer = root.querySelector("[data-retainer-content]");
  if (gc && !gc.hidden) return "grand-company";
  if (retainer && !retainer.hidden) return "retainer";
  return "plan";
}

function placeInbox(step = currentRoutineStep()) {
  const nodes = inboxNodes();
  if (!nodes) return false;
  const { inbox, title, copy, status } = nodes;
  const text = copyFor(step);
  let target = null;
  let anchor = null;

  if (step === "grand-company") {
    target = document.querySelector("[data-gc-content]");
    anchor = target?.querySelector(".retainer-advice-head");
  } else if (step === "retainer") {
    target = document.querySelector("[data-retainer-content]");
    anchor = target?.querySelector(".retainer-advice-head");
  } else {
    target = document.getElementById("planner");
    anchor = target?.querySelector(".quick-settings");
  }
  if (!target) return false;

  if (anchor) anchor.insertAdjacentElement("afterend", inbox);
  else target.prepend(inbox);

  inbox.classList.toggle("routine-context-inbox", step !== "plan");
  inbox.classList.toggle("plan-context-inbox", step === "plan");
  if (title) title.textContent = text.title;
  if (copy) copy.textContent = text.copy;
  if (status && (!status.dataset.kind || status.dataset.kind === "idle")) status.textContent = text.idle;
  inbox.dataset.workflowContext = step;
  return true;
}

function reconcilePlacement() {
  promoteIdentity();
  placeInbox(currentRoutineStep());
}

function queueReconcile() {
  setTimeout(reconcilePlacement, 0);
}

function boot() {
  injectPlacementStyles();
  reconcilePlacement();
  for (const delay of [80, 250, 800]) setTimeout(reconcilePlacement, delay);
  document.addEventListener("click", event => {
    if (event.target?.closest?.("[data-gc-open],[data-retainer-open],[data-plan-open]")) queueReconcile();
  });
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
else boot();

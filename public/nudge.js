const methodList = document.getElementById("methodList");

function makeLabel(text) {
  const label = document.createElement("span");
  label.className = "nudge-label";
  label.textContent = text;
  return label;
}

function annotateBody(root) {
  if (!root || root.dataset.nudgeAnnotated === "1") return;

  const reason = root.querySelector(":scope > .method-reason");
  if (reason && !reason.querySelector(".nudge-label")) {
    reason.prepend(makeLabel("目的・この行動で進むこと"));
  }

  const condition = root.querySelector(":scope > .method-condition");
  if (condition && !condition.querySelector(".nudge-label")) {
    const raw = condition.textContent.replace(/^選ぶ条件：/, "").trim();
    condition.replaceChildren(makeLabel("なぜ候補に入った？"), document.createTextNode(raw));
  }

  const steps = root.querySelector(":scope > .method-steps");
  const firstStepText = steps?.querySelector("li")?.textContent?.trim();
  if (steps && firstStepText && !root.querySelector(":scope > .first-step-nudge")) {
    const first = document.createElement("div");
    first.className = "first-step-nudge";
    const title = document.createElement("strong");
    title.textContent = "最初の一歩";
    const text = document.createElement("span");
    text.textContent = firstStepText;
    first.append(title, text);
    steps.before(first);
  }

  root.dataset.nudgeAnnotated = "1";
}

function annotateRecommendations() {
  if (!methodList) return;

  methodList.querySelectorAll(".method-card").forEach(card => annotateBody(card));
  methodList.querySelectorAll(".alternative-body").forEach(body => annotateBody(body));
}

if (methodList) {
  const observer = new MutationObserver(() => annotateRecommendations());
  observer.observe(methodList, { childList: true, subtree: true });
  annotateRecommendations();
}

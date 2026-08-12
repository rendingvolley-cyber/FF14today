function normalizeRoutineTabOrder(attempt = 0) {
  const root = document.getElementById("retainerAdvice");
  const tabs = root?.querySelector(".retainer-flow-tabs");
  const gcTab = root?.querySelector("[data-gc-open]");
  const tribeTab = root?.querySelector("[data-tribe-open]");
  const planTab = root?.querySelector("[data-plan-open]");

  if (tabs && gcTab && tribeTab && planTab) {
    tabs.insertBefore(gcTab, tribeTab);
    tabs.insertBefore(tribeTab, planTab);
    return;
  }

  if (attempt < 50) {
    setTimeout(() => normalizeRoutineTabOrder(attempt + 1), 100);
  }
}

void import("./grand-company-routine-core.js")
  .then(() => import("./gc-two-page-ui.js"))
  .finally(() => normalizeRoutineTabOrder());

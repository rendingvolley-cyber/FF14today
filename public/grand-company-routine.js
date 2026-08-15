const GC_COST_CACHE_MS = 1000;

function installGcCostFetchDedupe() {
  if (window.__ff14TodayGcCostFetchDedupe) return;
  window.__ff14TodayGcCostFetchDedupe = true;
  const previousFetch = window.fetch.bind(window);
  let cachedKey = "";
  let cachedUntil = 0;
  let cachedResponse = null;
  let inFlightKey = "";
  let inFlight = null;

  window.fetch = async (...args) => {
    const input = args[0];
    const init = args[1] || {};
    try {
      const rawUrl = typeof input === "string" ? input : input?.url || "";
      const url = new URL(rawUrl, location.href);
      const method = String(init.method || input?.method || "GET").toUpperCase();
      if (url.pathname !== "/api/grand-company/delivery-costs" || method !== "GET") {
        return previousFetch(...args);
      }

      const headers = new Headers(init.headers || input?.headers || undefined);
      const key = `${url.toString()}|${headers.get("x-profile-token") || ""}`;
      const now = Date.now();
      if (cachedResponse && cachedKey === key && now < cachedUntil) return cachedResponse.clone();
      if (inFlight && inFlightKey === key) return (await inFlight).clone();

      inFlightKey = key;
      inFlight = previousFetch(...args).then(response => {
        if (response.ok) {
          cachedKey = key;
          cachedUntil = Date.now() + GC_COST_CACHE_MS;
          cachedResponse = response.clone();
        }
        return response;
      }).finally(() => {
        inFlight = null;
        inFlightKey = "";
      });
      return (await inFlight).clone();
    } catch {
      return previousFetch(...args);
    }
  };
}

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

installGcCostFetchDedupe();

void import("./grand-company-routine-core.js")
  .then(() => import("./gc-two-page-ui.js"))
  .finally(() => normalizeRoutineTabOrder());

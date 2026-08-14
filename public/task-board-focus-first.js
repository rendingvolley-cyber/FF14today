(() => {
  const previousFetch = window.fetch.bind(window);
  const JOB_KEYS = {
    efficient: ["focus_combat_job_code", "ff14_today_combat_job_v1"],
    craft: ["focus_craft_job_code", "ff14_today_craft_job_v1"],
    gather: ["focus_gather_job_code", "ff14_today_gather_job_v1"]
  };

  function selected(mode) {
    const [, storageKey] = JOB_KEYS[mode] || [];
    if (!storageKey) return "";
    return String(localStorage.getItem(storageKey) || "").trim().toUpperCase();
  }

  function applyStateFocus(rawUrl) {
    const url = new URL(rawUrl, location.href);
    if (url.pathname !== "/api/state") return url.toString();
    const mode = String(url.searchParams.get("planner_mode") || "efficient");
    const [field] = JOB_KEYS[mode] || [];
    const code = selected(mode);
    if (field && code) url.searchParams.set(field, code);
    return url.toString();
  }

  function applyPlanFocus(init) {
    if (typeof init?.body !== "string") return init;
    try {
      const payload = JSON.parse(init.body);
      const mode = String(payload?.planner_mode || "efficient");
      const [field] = JOB_KEYS[mode] || [];
      const code = selected(mode);
      if (!field || !code) return init;
      payload[field] = code;
      return { ...init, body: JSON.stringify(payload) };
    } catch {
      return init;
    }
  }

  window.fetch = async function taskBoardFocusedFetch(input, init = {}) {
    try {
      const rawUrl = typeof input === "string" ? input : input?.url || "";
      const url = new URL(rawUrl, location.href);
      const method = String(init.method || input?.method || "GET").toUpperCase();
      if (url.pathname === "/api/state" && method === "GET") {
        const focused = applyStateFocus(rawUrl);
        input = typeof input === "string" ? focused : new Request(focused, input);
      } else if (url.pathname === "/api/plan" && method === "POST") {
        init = applyPlanFocus(init);
      }
    } catch {}
    return previousFetch(input, init);
  };
})();

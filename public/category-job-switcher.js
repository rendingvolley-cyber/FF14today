(() => {
  const previousFetch = window.fetch.bind(window);
  const KEYS = {
    efficient: "ff14_today_combat_job_v1",
    craft: "ff14_today_craft_job_v1",
    gather: "ff14_today_gather_job_v1"
  };
  const CATEGORY_MODE = { combat: "efficient", craft: "craft", gather: "gather" };
  const modeFocus = new Map();
  const modeNotice = new Map();
  let character = null;
  let renderTimer = null;
  let pendingCategory = "";
  let defaultRefreshQueued = false;

  function selectedCode(mode) {
    return String(localStorage.getItem(KEYS[mode] || "") || "").trim().toUpperCase();
  }

  function focusField(mode) {
    if (mode === "efficient") return "focus_combat_job_code";
    if (mode === "craft") return "focus_craft_job_code";
    if (mode === "gather") return "focus_gather_job_code";
    return null;
  }

  function modeFromUrl(url) {
    return String(url.searchParams.get("planner_mode") || "efficient");
  }

  function withFocusUrl(rawUrl) {
    const url = new URL(rawUrl, location.href);
    if (url.pathname !== "/api/state") return url.toString();
    const mode = modeFromUrl(url);
    const field = focusField(mode);
    const code = selectedCode(mode);
    if (field && code) url.searchParams.set(field, code);
    return url.toString();
  }

  async function interceptedFetch(input, init = {}) {
    let nextInput = input;
    let nextInit = init;
    try {
      const rawUrl = typeof input === "string" ? input : input?.url || "";
      const url = new URL(rawUrl, location.href);
      const method = String(init.method || input?.method || "GET").toUpperCase();
      if (url.pathname === "/api/state" && method === "GET") {
        const focused = withFocusUrl(rawUrl);
        nextInput = typeof input === "string" ? focused : new Request(focused, input);
      } else if (url.pathname === "/api/plan" && method === "POST" && typeof init.body === "string") {
        try {
          const payload = JSON.parse(init.body);
          const mode = String(payload.planner_mode || "efficient");
          const field = focusField(mode);
          const code = selectedCode(mode);
          if (field && code) {
            payload[field] = code;
            nextInit = { ...init, body: JSON.stringify(payload) };
          }
        } catch {}
      }
    } catch {}

    const response = await previousFetch(nextInput, nextInit);
    try {
      const rawUrl = typeof nextInput === "string" ? nextInput : nextInput?.url || "";
      const url = new URL(rawUrl, location.href);
      if (["/api/state", "/api/sync", "/api/plan"].includes(url.pathname) && (response.headers.get("content-type") || "").includes("application/json")) {
        response.clone().json().then(data => {
          if (data?.character) character = data.character;
          const plan = data?.plan;
          if (plan?.selected_mode) {
            const mode = String(plan.selected_mode);
            const code = String(plan?.focus_job?.code || "").trim().toUpperCase();
            if (code) modeFocus.set(mode, code);
            modeNotice.set(mode, String(plan?.notice || ""));
          }
          if (ensureDefaultSelections()) queueDefaultRefresh();
          scheduleRender();
        }).catch(() => {});
      }
    } catch {}
    return response;
  }

  function eligibleJobs(mode) {
    const jobs = Array.isArray(character?.jobs) ? character.jobs : [];
    return jobs.filter(job => {
      const level = Number(job?.level);
      if (!Number.isFinite(level)) return false;
      const code = String(job?.code || "").toUpperCase();
      if (mode === "efficient") {
        if (code === "BLU") return level >= 70 && level < 80;
        return ["tank", "healer", "melee", "ranged", "caster"].includes(job?.role) && level >= 70 && level < 100;
      }
      if (mode === "craft") return job?.role === "crafter" && level > 0 && level < 100;
      if (mode === "gather") return job?.role === "gatherer" && ["MIN", "BTN"].includes(code) && level > 0 && level < 100;
      return false;
    }).sort((a, b) => (Number(b.level) - Number(a.level)) || String(a.name_ja || a.code).localeCompare(String(b.name_ja || b.code), "ja"));
  }

  function preferredCode(mode, jobs) {
    const selected = selectedCode(mode);
    if (jobs.some(job => String(job.code).toUpperCase() === selected)) return selected;
    const planned = modeFocus.get(mode) || "";
    if (jobs.some(job => String(job.code).toUpperCase() === planned)) return planned;
    return String(jobs[0]?.code || "").trim().toUpperCase();
  }

  function ensureDefaultSelections() {
    if (!character) return false;
    let changed = false;
    for (const mode of Object.keys(KEYS)) {
      const jobs = eligibleJobs(mode);
      if (!jobs.length) continue;
      const current = selectedCode(mode);
      if (jobs.some(job => String(job.code).toUpperCase() === current)) continue;
      const code = preferredCode(mode, jobs);
      if (!code) continue;
      localStorage.setItem(KEYS[mode], code);
      modeFocus.set(mode, code);
      changed = true;
    }
    return changed;
  }

  function queueDefaultRefresh() {
    if (defaultRefreshQueued) return;
    defaultRefreshQueued = true;
    queueMicrotask(() => {
      defaultRefreshQueued = false;
      window.dispatchEvent(new CustomEvent("ff14today:context-updated", {
        detail: { source: "category-job-focus-defaults" }
      }));
    });
  }

  function injectStyle() {
    if (document.getElementById("categoryJobSwitcherStyle")) return;
    const style = document.createElement("style");
    style.id = "categoryJobSwitcherStyle";
    style.textContent = `
      .category-job-focus{margin:0 14px 12px;padding:10px 12px;border:1px solid #d9e6f3;border-radius:13px;background:#f8fbff;display:flex;align-items:center;gap:10px;flex-wrap:wrap}
      .category-job-focus.hidden{display:none}.category-job-focus-label{font-size:.75rem;font-weight:850;color:#54718f;white-space:nowrap}
      .category-job-focus select{min-width:220px;max-width:100%;border:1px solid #c8d9ea;border-radius:10px;background:#fff;color:#173c62;padding:8px 10px;font-weight:800}
      .category-job-focus-note{font-size:.72rem;color:#6b829a;flex:1;min-width:220px}.category-job-focus-note.warn{color:#9a6a20}
      @media(max-width:680px){.category-job-focus{display:grid;grid-template-columns:1fr}.category-job-focus select{width:100%}.category-job-focus-note{min-width:0}}
    `;
    document.head.append(style);
  }

  function ensurePanel() {
    const board = document.getElementById("taskBoard");
    const tabs = document.getElementById("taskBoardTabs");
    if (!board || !tabs) return null;
    let panel = document.getElementById("categoryJobFocus");
    if (panel) return panel;
    panel = document.createElement("section");
    panel.id = "categoryJobFocus";
    panel.className = "category-job-focus hidden";
    panel.innerHTML = `<span class="category-job-focus-label">対象ジョブ</span><select id="categoryJobFocusSelect" aria-label="このカテゴリで育てるジョブ"></select><span class="category-job-focus-note" id="categoryJobFocusNote">選んだジョブ以外へ勝手に切り替えません。</span>`;
    tabs.insertAdjacentElement("afterend", panel);
    panel.querySelector("select")?.addEventListener("change", event => {
      const mode = String(panel.dataset.mode || "");
      if (!KEYS[mode]) return;
      const code = String(event.target.value || "").trim().toUpperCase();
      if (!code) return;
      localStorage.setItem(KEYS[mode], code);
      modeFocus.set(mode, code);
      window.dispatchEvent(new CustomEvent("ff14today:context-updated", { detail: { source: "category-job-focus", mode, code } }));
      scheduleRender();
    });
    return panel;
  }

  function render(categoryOverride = "") {
    injectStyle();
    const panel = ensurePanel();
    if (!panel) return;
    const active = String(categoryOverride || pendingCategory || document.querySelector("#taskBoardTabs .task-board-tab.active")?.dataset.category || "");
    const mode = CATEGORY_MODE[active];
    panel.dataset.category = active;
    panel.dataset.mode = mode || "";
    if (!mode || !character) {
      panel.classList.add("hidden");
      return;
    }
    const jobs = eligibleJobs(mode);
    if (!jobs.length) {
      panel.classList.add("hidden");
      return;
    }
    panel.classList.remove("hidden");
    const select = panel.querySelector("select");
    let code = preferredCode(mode, jobs);
    if (!jobs.some(job => String(job.code).toUpperCase() === selectedCode(mode)) && code) {
      localStorage.setItem(KEYS[mode], code);
      modeFocus.set(mode, code);
      queueDefaultRefresh();
    }
    select.replaceChildren(...jobs.map(job => {
      const option = document.createElement("option");
      option.value = job.code;
      option.textContent = `${job.name_ja} · Lv${job.level}`;
      option.selected = String(job.code).toUpperCase() === code;
      return option;
    }));
    const note = document.getElementById("categoryJobFocusNote");
    const notice = modeNotice.get(mode) || "";
    const unsupported = /未整備|候補がありません|候補がまだありません/.test(notice);
    note.classList.toggle("warn", unsupported);
    note.textContent = unsupported ? "このジョブの根拠付き候補はまだ未整備です。別ジョブへ自動変更しません。" : "選んだジョブに合わせて候補を更新します。別ジョブへ勝手に切り替えません。";
  }

  function scheduleRender(categoryOverride = "") {
    clearTimeout(renderTimer);
    renderTimer = setTimeout(() => render(categoryOverride), 0);
  }

  window.fetch = interceptedFetch;
  document.addEventListener("click", event => {
    const tab = event.target.closest("#taskBoardTabs .task-board-tab");
    if (!tab) return;
    pendingCategory = String(tab.dataset.category || "");
    render(pendingCategory);
    setTimeout(() => render(pendingCategory), 40);
    setTimeout(() => {
      pendingCategory = "";
      render();
    }, 250);
  }, true);
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => scheduleRender(), { once: true });
  else scheduleRender();
  setInterval(() => {
    if (!document.getElementById("categoryJobFocus") && document.getElementById("taskBoardTabs")) render();
  }, 1000);
})();

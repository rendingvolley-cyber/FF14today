import { test, expect } from "@playwright/test";

const character = {
  lodestone_id: "3091607",
  name: "Kanade Tachibana",
  world: "Chocobo",
  data_center: "Mana",
  synced_at: "2026-08-11T00:00:00.000Z",
  jobs: [
    { code: "WAR", name_ja: "戦士", level: 88, role: "tank" },
    { code: "RDM", name_ja: "赤魔道士", level: 92, role: "caster" },
    { code: "BSM", name_ja: "鍛冶師", level: 95, role: "crafter" },
    { code: "ALC", name_ja: "錬金術師", level: 91, role: "crafter" },
    { code: "BTN", name_ja: "園芸師", level: 90, role: "gatherer" },
    { code: "MIN", name_ja: "採掘師", level: 81, role: "gatherer" },
    { code: "FSH", name_ja: "漁師", level: 80, role: "gatherer" }
  ]
};

function methodFor(mode, code) {
  if (mode === "efficient") return [{ rank: 1, task_key: `combat:${code}`, title: `${code}の戦闘候補`, minutes: 20, reason: "戦闘候補", job_code: code, job_name: code, job_level: 80, job_role: "caster", steps: [] }];
  if (mode === "craft" && code === "ALC") return [{ rank: 1, task_key: "craft:alc90:leve:ginseng-angle-brush", title: "ギルドリーヴ用「ウコギ・アングルブラシ」をHQで1個作る", minutes: 20, reason: "錬金術師候補", job_code: "ALC", job_name: "錬金術師", job_level: 91, job_role: "crafter", steps: [] }];
  if (mode === "gather" && code === "MIN") return [{ rank: 1, task_key: "gather:min81:collectable:rarefied-high-durium-ore", title: "サベネア島で「収集用の輝翠銀鉱」を1回採って納品する", minutes: 15, reason: "採掘師候補", job_code: "MIN", job_name: "採掘師", job_level: 81, job_role: "gatherer", steps: [] }];
  if (mode === "discover") return [{ rank: 1, task_key: "discover:gate", title: "ゴールドソーサーでGATEを1回", minutes: 20, reason: "その他", steps: [] }];
  return [];
}

function planFor(url) {
  const mode = url.searchParams.get("planner_mode") || "efficient";
  const combat = url.searchParams.get("focus_combat_job_code") || "RDM";
  const craft = url.searchParams.get("focus_craft_job_code") || "BSM";
  const gather = url.searchParams.get("focus_gather_job_code") || "BTN";
  const code = mode === "efficient" ? combat : mode === "craft" ? craft : mode === "gather" ? gather : "";
  const methods = methodFor(mode, code);
  const job = character.jobs.find(row => row.code === code) || null;
  return {
    selected_mode: mode,
    planner_kind: "e2e",
    session_complete: methods.length === 0,
    remaining_minutes: 60,
    notice: methods.length ? `${job?.name_ja || code}を選択中` : `${job?.name_ja || code}向け候補は未整備です。別ジョブへ勝手に切り替えません。`,
    focus_job: job ? { code: job.code, name: job.name_ja, level: job.level, role: job.role } : null,
    methods,
    now: methods[0] || null,
    next: null,
    fallback: { title: "終了", minutes: 0 },
    skip_today: []
  };
}

function generic(pathname) {
  if (pathname === "/api/sync") return { character };
  if (pathname === "/api/achievements/sync" || pathname === "/api/achievements") return { achievements: { total_achievements: 0, achievement_points: 0, page_total: 0, history: [] } };
  if (pathname === "/api/activity/today") return { count: 0 };
  if (pathname === "/api/retainer/recommendations") return { setup_required: true, recommendations: [] };
  if (pathname === "/api/grand-company/deliveries") return { setup_required: true, deliveries: [], recommended: null };
  if (pathname === "/api/context") return { context: {} };
  return {};
}

test("task board lists jobs and keeps the selected job per category", async ({ page }) => {
  await page.route("**/api/**", async route => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/state") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ character, preferences: { available_minutes: 60, energy: 3 }, plan: planFor(url) }) });
      return;
    }
    if (url.pathname === "/api/plan") {
      let payload = {};
      try { payload = route.request().postDataJSON() || {}; } catch {}
      const fake = new URL("https://example.invalid/api/state");
      fake.searchParams.set("planner_mode", payload.planner_mode || "efficient");
      if (payload.focus_combat_job_code) fake.searchParams.set("focus_combat_job_code", payload.focus_combat_job_code);
      if (payload.focus_craft_job_code) fake.searchParams.set("focus_craft_job_code", payload.focus_craft_job_code);
      if (payload.focus_gather_job_code) fake.searchParams.set("focus_gather_job_code", payload.focus_gather_job_code);
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ plan: planFor(fake) }) });
      return;
    }
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(generic(url.pathname)) });
  });

  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.locator("#taskBoard")).toBeVisible();

  await page.locator('#taskBoardTabs [data-category="combat"]').click();
  await expect(page.locator("#categoryJobFocus")).toBeVisible();
  await expect(page.locator("#categoryJobFocusSelect option")).toHaveCount(2);
  await expect(page.locator("#categoryJobFocusSelect")).toContainText("赤魔道士 · Lv92");
  await expect(page.locator("#categoryJobFocusSelect")).toContainText("戦士 · Lv88");
  const combatRequest = page.waitForRequest(req => {
    const url = new URL(req.url());
    return url.pathname === "/api/state" && url.searchParams.get("planner_mode") === "efficient" && url.searchParams.get("focus_combat_job_code") === "WAR";
  });
  await page.locator("#categoryJobFocusSelect").selectOption("WAR");
  await combatRequest;

  await page.locator('#taskBoardTabs [data-category="craft"]').click();
  await expect(page.locator("#categoryJobFocusSelect")).toContainText("鍛冶師 · Lv95");
  await expect(page.locator("#categoryJobFocusSelect")).toContainText("錬金術師 · Lv91");
  const craftRequest = page.waitForRequest(req => {
    const url = new URL(req.url());
    return url.pathname === "/api/state" && url.searchParams.get("planner_mode") === "craft" && url.searchParams.get("focus_craft_job_code") === "ALC";
  });
  await page.locator("#categoryJobFocusSelect").selectOption("ALC");
  await craftRequest;
  await expect(page.locator("#taskBoardGrid")).toContainText("ウコギ・アングルブラシ");

  await page.locator('#taskBoardTabs [data-category="gather"]').click();
  await expect(page.locator("#categoryJobFocusSelect")).toContainText("園芸師 · Lv90");
  await expect(page.locator("#categoryJobFocusSelect")).toContainText("採掘師 · Lv81");
  const gatherRequest = page.waitForRequest(req => {
    const url = new URL(req.url());
    return url.pathname === "/api/state" && url.searchParams.get("planner_mode") === "gather" && url.searchParams.get("focus_gather_job_code") === "MIN";
  });
  await page.locator("#categoryJobFocusSelect").selectOption("MIN");
  await gatherRequest;
  await expect(page.locator("#taskBoardGrid")).toContainText("収集用の輝翠銀鉱");

  await page.locator("#categoryJobFocusSelect").selectOption("BTN");
  await expect(page.locator("#categoryJobFocusNote")).toContainText("別ジョブへ自動変更しません");

  await page.locator('#taskBoardTabs [data-category="fishing"]').click();
  await expect(page.locator("#categoryJobFocus")).toBeHidden();
});

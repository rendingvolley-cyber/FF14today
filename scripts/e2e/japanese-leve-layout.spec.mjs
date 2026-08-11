import { test, expect } from "@playwright/test";

const character = {
  lodestone_id: "3091607",
  name: "Kanade Tachibana",
  world: "Chocobo",
  data_center: "Mana",
  synced_at: "2026-08-11T00:00:00.000Z",
  jobs: [
    { code: "RDM", name_ja: "赤魔道士", level: 92, role: "caster" },
    { code: "ALC", name_ja: "錬金術師", level: 90, role: "crafter" }
  ]
};

const efficientPlan = {
  selected_mode: "efficient",
  planner_kind: "RULE",
  notice: "戦闘候補",
  focus_job: { code: "RDM", name: "赤魔道士", level: 92, role: "caster" },
  methods: [{
    rank: 1,
    task_key: "roulette:leveling",
    badge: "日次ボーナス",
    title: "赤魔道士で「コンテンツルーレット：レベリング」を1回",
    minutes: 30,
    reason: "日次ボーナスを回収する。",
    steps: ["コンテンツファインダーを開く"]
  }],
  skip_today: []
};

const craftPlan = {
  selected_mode: "craft",
  planner_kind: "RULE",
  notice: "生産候補",
  focus_job: { code: "ALC", name: "錬金術師", level: 90, role: "crafter" },
  methods: [
    {
      rank: 1,
      task_key: "craft:alc90:leve:ginseng-angle-brush",
      badge: "ギルドリーヴ納品",
      title: "ギルドリーヴ用「ウコギ・アングルブラシ」をHQで1個作る",
      minutes: 20,
      reason: "トライヨラのLv90錬金術師ギルドリーヴの納品物。",
      condition: "トライヨラのギルドリーヴ発行NPCで受注・納品する。",
      job_code: "ALC",
      job_name: "錬金術師",
      job_level: 90,
      job_role: "crafter",
      steps: ["製作手帳で「ウコギ・アングルブラシ」を開く"]
    },
    {
      rank: 2,
      task_key: "craft:alc90:leve:growth-formula-lambda",
      badge: "材料軽めのリーヴ",
      title: "ギルドリーヴ用「グロースフォーミュラ・ラムダ」をHQで3個作る",
      minutes: 18,
      reason: "トライヨラのLv90錬金術師ギルドリーヴの納品物。",
      job_code: "ALC",
      job_name: "錬金術師",
      job_level: 90,
      job_role: "crafter",
      steps: ["製作手帳で「グロースフォーミュラ・ラムダ」を開く"]
    }
  ],
  skip_today: []
};

const emptyPlan = mode => ({ selected_mode: mode, planner_kind: "RULE", notice: "", focus_job: null, methods: [], skip_today: [] });
const achievements = { total_achievements: 0, achievement_points: 0, page_total: 0, history: [] };

function planFor(mode) {
  if (mode === "craft") return craftPlan;
  if (mode === "efficient") return efficientPlan;
  return emptyPlan(mode);
}

test("task board is the only chooser and guildleve labels are Japanese", async ({ page }) => {
  const pageErrors = [];
  page.on("pageerror", error => pageErrors.push(error.message));

  await page.route("**/api/**", async route => {
    const url = new URL(route.request().url());
    let body = {};
    if (url.pathname === "/api/state") {
      body = { character, preferences: { available_minutes: 60, energy: 3 }, plan: planFor(url.searchParams.get("planner_mode") || "efficient") };
    } else if (url.pathname === "/api/plan") {
      let requestBody = {};
      try { requestBody = route.request().postDataJSON() || {}; } catch {}
      body = { plan: planFor(requestBody.planner_mode || "efficient") };
    } else if (url.pathname === "/api/sync") {
      body = { character };
    } else if (url.pathname === "/api/achievements" || url.pathname === "/api/achievements/sync") {
      body = { achievements };
    } else if (url.pathname === "/api/activity/today") {
      body = { count: 0 };
    } else if (url.pathname === "/api/retainer/recommendations") {
      body = { setup_required: true, recommendations: [] };
    } else if (url.pathname === "/api/grand-company/deliveries") {
      body = { setup_required: true, deliveries: [], recommended: null };
    } else if (url.pathname === "/api/context") {
      body = { context: {} };
    } else if (url.pathname === "/api/leve/cost-advice") {
      body = { ok: false, setup_required: true, message: "E2Eでは価格表示を省略" };
    }
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
  });

  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.locator("#taskBoard")).toHaveCount(1);
  await expect(page.locator("#taskBoard")).toBeVisible();
  await expect(page.locator(".planner-hero")).toBeHidden();
  await expect(page.locator(".mode-picker")).toBeHidden();
  await expect(page.locator("#planButton")).toBeHidden();
  await expect(page.locator("#nowPanel")).toBeHidden();

  await page.locator('#taskBoardTabs [data-category="craft"]').click();
  const grid = page.locator("#taskBoardGrid");
  await expect(grid).toContainText("ウコギ・アングルブラシ");
  await expect(grid).toContainText("グロースフォーミュラ・ラムダ");
  for (const forbidden of ["Ginseng Angle Brush", "Growth Formula Lambda", "Big Brush, Big Dreams", "Fast-forwarding Flora", "Tuliyollal", "Malihali"]) {
    await expect(grid).not.toContainText(forbidden);
  }

  await grid.locator(".task-select-card").first().locator(".task-now-button").click();
  await expect(page.locator("#nowPanel")).toBeVisible();
  await expect(page.locator(".method-card.recommended h3")).toContainText("ウコギ・アングルブラシ");
  await expect(page.locator(".method-alternative")).toBeHidden();
  await expect(page.locator("#taskBoard")).toHaveCount(1);

  expect(pageErrors).toEqual([]);
});

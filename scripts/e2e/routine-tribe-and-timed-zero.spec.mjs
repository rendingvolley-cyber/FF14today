import { test, expect } from "@playwright/test";

const character = {
  lodestone_id: "3091607",
  name: "Kanade Tachibana",
  world: "Chocobo",
  data_center: "Mana",
  synced_at: "2026-08-11T00:45:00.000Z",
  jobs: [
    { code: "RDM", name_ja: "赤魔道士", level: 92, role: "caster" },
    { code: "FSH", name_ja: "漁師", level: 80, role: "gatherer" }
  ]
};

const emptyPlan = {
  selected_mode: "efficient",
  planner_kind: "RULE",
  notice: "",
  focus_job: null,
  methods: [],
  skip_today: []
};

function payload(pathname) {
  if (pathname === "/api/sync") return { character };
  if (pathname === "/api/state") return { character, preferences: { available_minutes: 60, energy: 3 }, plan: emptyPlan };
  if (pathname === "/api/plan") return { plan: emptyPlan };
  if (pathname === "/api/achievements/sync" || pathname === "/api/achievements") {
    return { achievements: { total_achievements: 0, achievement_points: 0, page_total: 0, history: [] } };
  }
  if (pathname === "/api/activity/today") return { count: 0 };
  if (pathname === "/api/retainer/recommendations") return { setup_required: true, recommendations: [], message: "調達依頼画面を貼ってください。" };
  if (pathname === "/api/grand-company/deliveries") return { setup_required: true, deliveries: [], recommended: null, message: "双蛇党の納品一覧スクショをCtrl+Vしてください。" };
  if (pathname === "/api/context") return { context: {} };
  return {};
}

test("routine flows from Grand Company to craft/gather tribes to retainer and timed tabs show an explicit zero state", async ({ page }) => {
  const pageErrors = [];
  page.on("pageerror", error => pageErrors.push(error.message));
  await page.addInitScript(() => localStorage.clear());

  await page.route("**/api/**", async route => {
    const url = new URL(route.request().url());
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(payload(url.pathname)) });
  });

  await page.goto("/", { waitUntil: "domcontentloaded" });

  await expect(page.locator("[data-gc-open] .retainer-flow-step")).toHaveText("1");
  await expect(page.locator("[data-tribe-open] .retainer-flow-step")).toHaveText("2");
  await expect(page.locator("[data-retainer-open] .retainer-flow-step")).toHaveText("3");
  await expect(page.locator("[data-plan-open] .retainer-flow-step")).toHaveText("4");
  await expect(page.locator("[data-gc-content]")).toBeVisible();

  await page.locator("button[data-gc-done]").click();
  await expect(page.locator("[data-tribe-content]")).toBeVisible();
  await expect(page.locator("[data-tribe-content]")).toContainText("次に友好部族（生産・採集）");
  await expect(page.locator("#contextInbox")).toBeHidden();

  await page.locator("[data-tribe-craft-toggle]").click();
  await expect(page.locator("[data-tribe-tab-status]")).toHaveText("1/2");
  await expect(page.locator("[data-tribe-content]")).toBeVisible();

  await page.locator("[data-tribe-gather-toggle]").click();
  await expect(page.locator("[data-tribe-tab-status]")).toHaveText("✓ 完了");
  await expect(page.locator("[data-retainer-content]")).toBeVisible();
  await expect(page.locator("#retainerRoutineContent #contextInbox")).toHaveCount(1);

  await expect(page.locator("#taskBoard")).toBeVisible();
  await page.getByRole("button", { name: /^釣り/ }).click();
  await expect(page.locator(".task-board-timed-zero")).toBeVisible();
  await expect(page.locator(".task-board-timed-zero")).toContainText("現在表示できる候補はありません");

  expect(pageErrors).toEqual([]);
});

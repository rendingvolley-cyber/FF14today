import { test, expect } from "@playwright/test";

const character = {
  lodestone_id: "3091607",
  name: "Kanade Tachibana",
  world: "Chocobo",
  data_center: "Mana",
  synced_at: "2026-08-11T00:20:00.000Z",
  jobs: [{ code: "RDM", name_ja: "赤魔道士", level: 92, role: "caster" }]
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
  if (pathname === "/api/grand-company/deliveries") return { setup_required: true, deliveries: [], recommended: null, message: "双蛇党の納品一覧スクショをCtrl+Vしてください。" };
  if (pathname === "/api/context") return { context: {} };
  return {};
}

test("character identity stays at top and screenshot input follows GC -> tribes -> plan", async ({ page }) => {
  const pageErrors = [];
  page.on("pageerror", error => pageErrors.push(error.message));
  await page.addInitScript(() => localStorage.clear());

  await page.route("**/api/**", async route => {
    const url = new URL(route.request().url());
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(payload(url.pathname)) });
  });

  await page.goto("/", { waitUntil: "domcontentloaded" });

  await expect(page.locator("#identity")).toBeVisible();
  await expect(page.locator("#identity #characterName")).toHaveText("Kanade Tachibana");
  await expect(page.locator("#retainerAdvice")).toBeVisible();
  await expect(page.locator("[data-retainer-open]")).toBeHidden();
  await expect(page.locator("[data-gc-open] .retainer-flow-step")).toHaveText("1");
  await expect(page.locator("[data-tribe-open] .retainer-flow-step")).toHaveText("2");
  await expect(page.locator("[data-plan-open] .retainer-flow-step")).toHaveText("3");

  await expect.poll(async () => page.evaluate(() => {
    const topbar = document.querySelector(".topbar");
    const identity = document.getElementById("identity");
    const routine = document.getElementById("retainerAdvice");
    return Boolean(topbar && identity && routine && topbar.nextElementSibling === identity && identity.nextElementSibling === routine);
  })).toBe(true);
  await expect(page.locator("#identity")).toHaveClass(/identity-compact/);

  await expect(page.locator("#grandCompanyRoutineContent #contextInbox")).toHaveCount(1);
  await expect(page.locator("#grandCompanyRoutineContent #contextInbox")).toContainText("双蛇党の納品一覧スクショを追加");
  await expect(page.locator("#planner #contextInbox")).toHaveCount(0);

  await page.locator("button[data-gc-done]").click();
  await expect(page.locator("[data-tribe-open]")).toHaveAttribute("aria-selected", "true");
  await expect(page.locator("[data-tribe-content]")).toBeVisible();
  await expect(page.locator("#contextInbox")).toBeHidden();

  await page.locator("[data-plan-open]").click();
  await expect(page.locator("#planner #contextInbox")).toHaveCount(1);
  await expect(page.locator("#planner #contextInbox")).toContainText("スクショを判断材料に追加");

  expect(pageErrors).toEqual([]);
});

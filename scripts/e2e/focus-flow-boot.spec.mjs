import { test, expect } from "@playwright/test";

const character = {
  lodestone_id: "3091607",
  name: "Kanade Tachibana",
  world: "Chocobo",
  data_center: "Mana",
  synced_at: "2026-08-10T12:00:00.000Z",
  jobs: [{ code: "RDM", name_ja: "赤魔道士", level: 92 }]
};

const achievements = {
  total_achievements: 123,
  achievement_points: 456,
  page_total: 7,
  synced_at: "2026-08-10T12:00:00.000Z",
  cached: true,
  history: []
};

const plan = {
  selected_mode: "efficient",
  planner_kind: "RULE",
  notice: "E2E test plan",
  focus_job: { code: "RDM", name: "赤魔道士", level: 92, role: "caster" },
  methods: [
    { rank: 1, task_key: "e2e:primary", title: "E2Eメイン", minutes: 15, reason: "起動確認", steps: ["STARTを押す"] },
    { rank: 2, task_key: "e2e:alt", title: "E2E代替", minutes: 10, reason: "代替確認", steps: ["切り替える"] }
  ],
  skip_today: []
};

function payloadFor(pathname) {
  if (pathname === "/api/state") return { character, preferences: { available_minutes: 60, energy: 2 }, plan };
  if (pathname === "/api/achievements") return { achievements };
  if (pathname === "/api/activity/today") return { count: 0 };
  if (pathname === "/api/sync") return { character };
  if (pathname === "/api/achievements/sync") return { achievements };
  if (pathname === "/api/plan") return { plan };
  if (pathname === "/api/retainer/recommendations") return { setup_required: true, recommendations: [] };
  return {};
}

test("page boots, stays responsive, and Focus Flow survives reload", async ({ page }) => {
  const pageErrors = [];
  page.on("pageerror", error => pageErrors.push(error.message));

  await page.route("**/api/**", async route => {
    const url = new URL(route.request().url());
    await route.fulfill({
      status: 200,
      contentType: "application/json; charset=utf-8",
      body: JSON.stringify(payloadFor(url.pathname))
    });
  });

  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.locator("#characterName")).toHaveText("Kanade Tachibana");
  await expect(page.locator(".method-card.recommended h3")).toHaveText("E2Eメイン");
  await expect(page.locator(".focus-flow-start")).toHaveCount(1);

  const beforeStart = await page.evaluate(() => new Promise(resolve => setTimeout(() => resolve("responsive"), 250)));
  expect(beforeStart).toBe("responsive");

  await page.locator(".focus-flow-start").click();
  await expect(page.locator(".focus-flow-start")).toContainText("実行中");
  await page.waitForTimeout(1250);

  const afterStart = await page.evaluate(() => new Promise(resolve => setTimeout(() => resolve("responsive"), 250)));
  expect(afterStart).toBe("responsive");

  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.locator("#characterName")).toHaveText("Kanade Tachibana");
  await expect(page.locator(".focus-flow-start")).toContainText("実行中");
  await expect(page.locator("#focusFlowResume")).toContainText("いま実行中");

  const afterReload = await page.evaluate(() => new Promise(resolve => setTimeout(() => resolve("responsive"), 250)));
  expect(afterReload).toBe("responsive");
  expect(pageErrors).toEqual([]);
});

import { test, expect } from "@playwright/test";

const character = {
  lodestone_id: "3091607",
  name: "Kanade Tachibana",
  world: "Chocobo",
  data_center: "Mana",
  synced_at: "2026-08-10T12:00:00.000Z",
  jobs: [{ code: "ALC", name_ja: "錬金術師", level: 90 }]
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
  selected_mode: "craft",
  planner_kind: "RULE",
  notice: "E2E leve plan",
  focus_job: { code: "ALC", name: "錬金術師", level: 90, role: "crafter" },
  methods: [
    {
      rank: 1,
      task_key: "craft:alc90:leve:ginseng-angle-brush",
      title: "Ginseng Angle Brush HQを1個納品",
      minutes: 15,
      reason: "リーヴと調達比較の起動確認",
      steps: ["STARTを押す"]
    },
    { rank: 2, task_key: "e2e:alt", title: "E2E代替", minutes: 10, reason: "代替確認", steps: ["切り替える"] }
  ],
  skip_today: []
};

const leveAdvice = {
  ok: true,
  world: "Chocobo",
  source: "Universalis",
  market_age_minutes: 3,
  energy: 2,
  available_minutes: 60,
  advice: {
    recommendedKey: "mixed",
    recommendationReason: "完成品購入より安く、原材料から作るより短時間です。",
    routes: [
      {
        key: "buy_finished",
        label: "完成品HQを買う",
        gil: 18600,
        estimatedMinutes: 2,
        craftCount: 0,
        available: true,
        purchases: [{ itemName: "Ginseng Angle Brush", quantity: 1, hq: true }],
        crafts: []
      },
      {
        key: "mixed",
        label: "中間素材を買って最終品だけ作る",
        gil: 13200,
        estimatedMinutes: 5,
        craftCount: 1,
        available: true,
        purchases: [{ itemName: "Ginseng Lumber", quantity: 3, hq: false }],
        crafts: [{ itemName: "Ginseng Angle Brush", syntheses: 1 }]
      },
      {
        key: "craft_raw",
        label: "原材料から全部作る",
        gil: 11400,
        estimatedMinutes: 12,
        craftCount: 4,
        available: true,
        purchases: [],
        crafts: [{ itemName: "Ginseng Angle Brush", syntheses: 1 }]
      }
    ]
  }
};

function payloadFor(pathname) {
  if (pathname === "/api/state") return { character, preferences: { available_minutes: 60, energy: 2 }, plan };
  if (pathname === "/api/achievements") return { achievements };
  if (pathname === "/api/activity/today") return { count: 0 };
  if (pathname === "/api/sync") return { character };
  if (pathname === "/api/achievements/sync") return { achievements };
  if (pathname === "/api/plan") return { plan };
  if (pathname === "/api/retainer/recommendations") return { setup_required: true, recommendations: [] };
  if (pathname === "/api/leve/cost-advice") return leveAdvice;
  return {};
}

test("page, Focus Flow, and leve advice stay responsive through reload", async ({ page }) => {
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
  await expect(page.locator(".method-card.recommended h3")).toContainText("Ginseng Angle Brush");
  await expect(page.locator(".focus-flow-start")).toHaveCount(1);
  await expect(page.locator(".leve-cost-title")).toHaveText("中間素材を買って最終品だけ作る");
  await expect(page.locator(".leve-cost-advice")).toContainText("13,200G");

  const beforeStart = await page.evaluate(() => new Promise(resolve => setTimeout(() => resolve("responsive"), 250)));
  expect(beforeStart).toBe("responsive");

  await page.locator(".focus-flow-start").click();
  await expect(page.locator(".focus-flow-start")).toContainText("実行中");
  await page.waitForTimeout(1250);

  const afterStart = await page.evaluate(() => new Promise(resolve => setTimeout(() => resolve("responsive"), 250)));
  expect(afterStart).toBe("responsive");
  await expect(page.locator(".leve-cost-advice")).toHaveCount(1);

  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.locator("#characterName")).toHaveText("Kanade Tachibana");
  await expect(page.locator(".focus-flow-start")).toContainText("実行中");
  await expect(page.locator("#focusFlowResume")).toContainText("いま実行中");
  await expect(page.locator(".leve-cost-title")).toHaveText("中間素材を買って最終品だけ作る");

  const afterReload = await page.evaluate(() => new Promise(resolve => setTimeout(() => resolve("responsive"), 250)));
  expect(afterReload).toBe("responsive");
  expect(pageErrors).toEqual([]);
});

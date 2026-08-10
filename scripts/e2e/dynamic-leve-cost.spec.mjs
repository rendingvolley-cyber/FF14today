import { test, expect } from "@playwright/test";

const character = {
  lodestone_id: "3091607",
  name: "Kanade Tachibana",
  world: "Chocobo",
  data_center: "Mana",
  synced_at: "2026-08-10T12:00:00.000Z",
  jobs: [{ code: "WVR", name_ja: "裁縫師", level: 95 }]
};

const plan = {
  selected_mode: "craft",
  planner_kind: "RULE",
  notice: "dynamic leve E2E",
  focus_job: { code: "WVR", name: "裁縫師", level: 95, role: "crafter" },
  methods: [{
    rank: 1,
    task_key: "craft:wvr95:leve:dynamic-widget",
    badge: "ギルドリーヴ",
    title: "「Dynamic Widget」をHQで2個製作して納品",
    minutes: 20,
    reason: "未知のリーヴでもレシピを自動解決する確認",
    steps: ["STARTを押す"]
  }],
  skip_today: []
};

const dynamicAdvice = {
  ok: true,
  world: "Chocobo",
  source: "Universalis",
  market_age_minutes: 4,
  market_pricing: "listing_quantity_curve",
  recipe_source: "XIVAPI v2",
  recipe_dynamic: true,
  recipe_warnings: [],
  inventory_evidence: { applied: false, observed_at: null, item_count: 0 },
  advice: {
    dynamicRecipeGraph: true,
    recommendedKey: "mixed",
    recommendationReason: "実質コストが最安です。製作経験も残せます。",
    routes: [{
      key: "mixed",
      label: "安い中間工程だけ自作する",
      available: true,
      gil: 8400,
      additionalGil: 8400,
      inventoryOpportunityGil: 0,
      inventoryEvidenceApplied: false,
      estimatedMinutes: 7,
      craftCount: 3,
      purchases: [{ itemName: "Dynamic Ore", quantity: 4, hq: false }],
      crafts: [
        { itemName: "Dynamic Ingot", syntheses: 2 },
        { itemName: "Dynamic Widget", syntheses: 2 }
      ]
    }]
  }
};

function basePayload(pathname) {
  if (pathname === "/api/state") return { character, preferences: { available_minutes: 60, energy: 3 }, plan };
  if (pathname === "/api/achievements") return { achievements: { total_achievements: 0, achievement_points: 0, page_total: 0, history: [] } };
  if (pathname === "/api/activity/today") return { count: 0 };
  if (pathname === "/api/retainer/recommendations") return { setup_required: true, recommendations: [] };
  if (pathname === "/api/grand-company/deliveries") return { setup_required: true, deliveries: [], recommended: null };
  if (pathname === "/api/context") return { context: {} };
  return {};
}

test("unknown guildleve card sends bounded dynamic recipe metadata", async ({ page }) => {
  const pageErrors = [];
  let captured = null;
  page.on("pageerror", error => pageErrors.push(error.message));

  await page.route("**/api/**", async route => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/leve/cost-advice") {
      captured = {
        dynamic: url.searchParams.get("dynamic"),
        taskKey: url.searchParams.get("task_key"),
        itemName: url.searchParams.get("item_name"),
        quantity: url.searchParams.get("quantity"),
        hqRequired: url.searchParams.get("hq_required"),
        profileToken: route.request().headers()["x-profile-token"] || ""
      };
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(dynamicAdvice) });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(basePayload(url.pathname))
    });
  });

  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.locator(".version")).toContainText("v1.9.3");
  await expect(page.locator(".method-card.recommended h3")).toContainText("Dynamic Widget");
  await expect(page.locator(".leve-cost-title")).toHaveText("安い中間工程だけ自作する");
  await expect(page.locator(".leve-cost-kicker")).toContainText("レシピ自動解決");
  await expect(page.locator(".leve-cost-source")).toContainText("XIVAPI v2から自動解決");
  await expect(page.locator(".leve-cost-source")).toContainText("出品数量を積み上げた概算");

  expect(captured).not.toBeNull();
  expect(captured.dynamic).toBe("1");
  expect(captured.taskKey).toMatch(/^craft:dynamic:[0-9a-f]{8}$/);
  expect(captured.itemName).toBe("Dynamic Widget");
  expect(captured.quantity).toBe("2");
  expect(captured.hqRequired).toBe("1");
  expect(captured.profileToken).toMatch(/^[A-Za-z0-9_-]{43,128}$/);
  expect(pageErrors).toEqual([]);
});

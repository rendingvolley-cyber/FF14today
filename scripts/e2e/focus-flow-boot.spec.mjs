import { test, expect } from "@playwright/test";

const character = {
  lodestone_id: "3091607",
  name: "Kanade Tachibana",
  world: "Chocobo",
  data_center: "Mana",
  synced_at: "2026-08-10T12:00:00.000Z",
  jobs: [{ code: "ALC", name_ja: "錬金術師", level: 90, role: "crafter" }]
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

function leveAdvice(withInventory = false) {
  const route = (base, held = {}) => ({
    ...base,
    additionalGil: withInventory ? (held.additionalGil ?? base.gil) : base.gil,
    inventoryOpportunityGil: withInventory ? (held.inventoryOpportunityGil ?? 0) : 0,
    inventoryEvidenceApplied: withInventory && Boolean(held.applied),
    inventoryUsed: withInventory ? (held.inventoryUsed || []) : [],
    purchases: (base.purchases || []).map((purchase, index) => {
      const allocation = held.purchaseAllocations?.[index];
      return allocation && withInventory ? { ...purchase, ...allocation } : purchase;
    })
  });

  return {
    ok: true,
    world: "Chocobo",
    source: "Universalis",
    market_age_minutes: 3,
    energy: 2,
    available_minutes: 60,
    inventory_evidence: {
      applied: withInventory,
      observed_at: withInventory ? "2026-08-10T12:45:00.000Z" : null,
      item_count: withInventory ? 2 : 0
    },
    advice: {
      inventoryEvidenceApplied: withInventory,
      recommendedKey: "mixed",
      recommendationReason: withInventory
        ? "完成品購入より安く、手持ちを市場価値約10,000G分使うため、追加支出は約3,200Gです。"
        : "完成品購入より安く、原材料から作るより短時間です。",
      routes: [
        route({
          key: "buy_finished",
          label: "完成品HQを買う",
          gil: 18600,
          estimatedMinutes: 2,
          craftCount: 0,
          available: true,
          purchases: [{ itemName: "Ginseng Angle Brush", quantity: 1, hq: true }],
          crafts: []
        }),
        route({
          key: "mixed",
          label: "中間素材を買って最終品だけ作る",
          gil: 13200,
          estimatedMinutes: 5,
          craftCount: 1,
          available: true,
          purchases: [{ itemName: "Ginseng Lumber", quantity: 3, hq: false }],
          crafts: [{ itemName: "Ginseng Angle Brush", syntheses: 1 }]
        }, {
          applied: true,
          additionalGil: 3200,
          inventoryOpportunityGil: 10000,
          inventoryUsed: [{ itemName: "Ginseng Lumber", quantity: 2, opportunityTotal: 10000 }],
          purchaseAllocations: [{ heldQuantity: 2, buyQuantity: 1, additionalTotal: 3200, inventoryOpportunityTotal: 10000 }]
        }),
        route({
          key: "craft_raw",
          label: "原材料から全部作る",
          gil: 11400,
          estimatedMinutes: 12,
          craftCount: 4,
          available: true,
          purchases: [],
          crafts: [{ itemName: "Ginseng Angle Brush", syntheses: 1 }]
        })
      ]
    }
  };
}

const grandCompany = {
  ok: true,
  setup_required: false,
  company_name: "双蛇党",
  observed_at: "2026-08-10T12:30:00.000Z",
  confidence: 0.95,
  deliveries: [
    {
      row_index: 0,
      class_or_job: "錬金術師",
      item_name: "E2E納品薬",
      requested_quantity: 3,
      owned_quantity: 3,
      starred: true,
      bonus_text: "ボーナス",
      reward_text: "軍票 1000",
      confidence: 0.95,
      ready_now: true,
      missing_quantity: 0
    },
    {
      row_index: 1,
      class_or_job: "調理師",
      item_name: "E2E納品料理",
      requested_quantity: 2,
      owned_quantity: 0,
      starred: false,
      bonus_text: null,
      reward_text: null,
      confidence: 0.9,
      ready_now: false,
      missing_quantity: 2
    }
  ],
  recommended: {
    row_index: 0,
    class_or_job: "錬金術師",
    item_name: "E2E納品薬",
    requested_quantity: 3,
    owned_quantity: 3,
    starred: true,
    bonus_text: "ボーナス",
    reward_text: "軍票 1000",
    confidence: 0.95,
    ready_now: true,
    missing_quantity: 0,
    recommendation_reason: "必要数をすでに所持していて、画面上にボーナス表示もあります。最初にこれを納品します。"
  }
};

function payloadFor(pathname, withInventory = false) {
  if (pathname === "/api/state") return { character, preferences: { available_minutes: 60, energy: 2 }, plan };
  if (pathname === "/api/achievements") return { achievements };
  if (pathname === "/api/activity/today") return { count: 0 };
  if (pathname === "/api/sync") return { character };
  if (pathname === "/api/achievements/sync") return { achievements };
  if (pathname === "/api/plan") return { plan };
  if (pathname === "/api/grand-company/deliveries") return grandCompany;
  if (pathname === "/api/leve/cost-advice") return leveAdvice(withInventory);
  return {};
}

test("daily routine, inventory-aware leve cost, and Focus Flow survive reload", async ({ page }) => {
  const pageErrors = [];
  const leveProfileHeaders = [];
  let inventoryApplied = false;
  page.on("pageerror", error => pageErrors.push(error.message));

  await page.route("**/api/**", async route => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/leve/cost-advice") {
      leveProfileHeaders.push(route.request().headers()["x-profile-token"] || "");
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json; charset=utf-8",
      body: JSON.stringify(payloadFor(url.pathname, inventoryApplied))
    });
  });

  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.locator("#characterName")).toHaveText("Kanade Tachibana");
  await expect(page.locator("[data-gc-open]")).toHaveAttribute("aria-selected", "true");
  await expect(page.locator("[data-tribe-open] .retainer-flow-step")).toHaveText("2");
  await expect(page.locator("[data-plan-open] .retainer-flow-step")).toHaveText("3");
  await expect(page.locator("[data-gc-content]")).toContainText("E2E納品薬");
  await expect(page.locator("[data-gc-content]")).toContainText("必要 3 / 所持 3");
  await expect(page.locator("[data-gc-tab-status]")).toHaveText("すぐ納品");

  await expect(page.locator(".method-card.recommended h3")).toContainText("Ginseng Angle Brush");
  await expect(page.locator(".focus-flow-start")).toHaveCount(1);
  await expect(page.locator(".leve-cost-title")).toHaveText("中間素材を買って最終品だけ作る");
  await expect(page.locator(".leve-cost-advice")).toContainText("13,200G");
  await expect(page.locator(".leve-cost-inventory-prompt")).toContainText("素材名と所持数");
  expect(leveProfileHeaders.some(value => /^[A-Za-z0-9_-]{43,128}$/.test(value))).toBe(true);

  inventoryApplied = true;
  await page.evaluate(() => {
    window.dispatchEvent(new CustomEvent("ff14today:context-saved", {
      detail: { pageType: "inventory_items" }
    }));
  });
  await expect(page.locator(".leve-cost-inventory-economics")).toContainText("追加支出");
  await expect(page.locator(".leve-cost-inventory-economics")).toContainText("3,200G");
  await expect(page.locator(".leve-cost-inventory-economics")).toContainText("実質コスト");
  await expect(page.locator(".leve-cost-inventory-economics")).toContainText("13,200G");
  await expect(page.locator(".leve-cost-inventory-economics")).toContainText("手持ち利用 10,000G相当");
  await expect(page.locator(".leve-cost-actions")).toContainText("手持ち2 / 買う1");
  await expect(page.locator(".leve-cost-source")).toContainText("0G扱いせず");

  await page.locator("button[data-gc-done]").click();
  await expect(page.locator("[data-tribe-open]")).toHaveAttribute("aria-selected", "true");
  await expect(page.locator("[data-gc-content]")).toBeHidden();
  await expect(page.locator("[data-tribe-content]")).toBeVisible();
  await expect(page.locator("[data-tribe-content]")).toContainText("友好部族 今日の12枠");
  await expect(page.locator("[data-tribe-tab-status]")).toHaveText("0/12");

  for (const completed of [3, 6, 9]) {
    await page.locator('[data-tribe-group-toggle][aria-pressed="false"]').first().click();
    await expect(page.locator("[data-tribe-tab-status]")).toHaveText(`${completed}/12`);
  }
  await page.locator('[data-tribe-group-toggle][aria-pressed="false"]').first().click();
  await expect(page.locator("[data-tribe-tab-status]")).toHaveText("✓ 完了");
  await expect(page.locator("[data-plan-open]")).toHaveAttribute("aria-selected", "true");
  await expect(page.locator("[data-tribe-content]")).toBeHidden();

  await expect(page.locator("#nowPanel")).toBeHidden();
  await expect(page.locator("#taskBoardGrid .task-now-button").first()).toBeVisible();
  await page.locator("#taskBoardGrid .task-now-button").first().click();
  await expect(page.locator("#nowPanel")).toBeVisible();
  await expect(page.locator(".focus-flow-start")).toBeVisible();

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
  await expect(page.locator("[data-plan-open]")).toHaveAttribute("aria-selected", "true");
  await expect(page.locator("[data-gc-tab-status]")).toContainText("納品済み");
  await expect(page.locator("[data-tribe-tab-status]")).toContainText("完了");
  await expect(page.locator("#nowPanel")).toBeVisible();
  await expect(page.locator(".focus-flow-start")).toContainText("実行中");
  await expect(page.locator("#focusFlowResume")).toContainText("いま実行中");
  await expect(page.locator(".leve-cost-inventory-economics")).toContainText("追加支出");
  await expect(page.locator(".leve-cost-title")).toHaveText("中間素材を買って最終品だけ作る");

  const afterReload = await page.evaluate(() => new Promise(resolve => setTimeout(() => resolve("responsive"), 250)));
  expect(afterReload).toBe("responsive");
  expect(pageErrors).toEqual([]);
});

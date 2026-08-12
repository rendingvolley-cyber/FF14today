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

const pastedDelivery = {
  row_index: 0,
  class_or_job: "錬金術師",
  item_name: "E2E貼付納品薬",
  requested_quantity: 3,
  owned_quantity: 1,
  starred: true,
  bonus_text: "ボーナス",
  reward_text: "軍票 1000",
  confidence: 0.96,
  ready_now: false,
  missing_quantity: 2,
  recommendation_reason: "★表示があり、必要数まであと2個です。"
};

const deliveryCosts = {
  ok: true,
  world: "Chocobo",
  source: "Universalis",
  market_age_minutes: 3,
  market_pricing: "listing_quantity_curve",
  cost_advice: true,
  company_name: "双蛇党",
  observed_at: "2026-08-11T01:10:00.000Z",
  decision_owner: "user",
  recommendation: {
    row_index: 0,
    item_name: "E2E貼付納品薬",
    reason: "★表示があり、調達おすすめは「原材料から全部作る」約1,200Gです。"
  },
  deliveries: [{
    ...pastedDelivery,
    procurement: {
      quantity_to_acquire: 2,
      quantity_basis: "missing_quantity",
      status: "ok",
      market_buy: {
        key: "buy_finished",
        label: "完成品を買う",
        available: true,
        gil: 2800,
        estimated_minutes: 2,
        craft_count: 0,
        materials: [{ item_id: 1001, item_name: "E2E貼付納品薬", quantity: 2, unit_price: 1400, total_gil: 2800 }],
        crafts: []
      },
      craft_raw: {
        key: "craft_raw",
        label: "原材料から全部作る",
        available: true,
        gil: 1200,
        estimated_minutes: 5,
        craft_count: 2,
        materials: [
          { item_id: 2001, item_name: "薬草", quantity: 4, unit_price: 200, total_gil: 800 },
          { item_id: 2002, item_name: "蒸留水", quantity: 2, unit_price: 200, total_gil: 400 }
        ],
        crafts: [{ item_id: 1001, item_name: "E2E貼付納品薬", syntheses: 2, output_quantity: 2 }]
      },
      recommended_route: {
        key: "craft_raw",
        label: "原材料から全部作る",
        available: true,
        gil: 1200,
        estimated_minutes: 5,
        craft_count: 2,
        materials: [],
        crafts: []
      },
      recommendation_reason: "実質コストが最安です。"
    },
    recipe_source: "XIVAPI v2",
    recipe_error: null
  }]
};

const sealMarket = {
  ok: true,
  world: "Chocobo",
  source: "Universalis",
  ranking_schema: "sell-through-300-v1",
  ranking_mode: "daily_sale_velocity_desc_with_value_floor",
  sell_batch_quantity: 300,
  target_max_days: 3,
  cached: false,
  cache_age_minutes: 0,
  recommendations: [
    {
      rank: 1,
      score: 89,
      sales_priority: "かなり売れる",
      item_id: 5530,
      item_name: "コークス",
      item_name_en: "Coke",
      seal_cost: 200,
      exchange_quantity: 1,
      daily_sale_velocity: 852.3,
      average_sale_price: 248,
      minimum_listing_price: 249,
      listed_quantity: 4432,
      estimated_days_supply: 5.2,
      sell_batch_quantity: 300,
      estimated_days_to_sell_batch: 0.35,
      estimated_gross_per_exchange: 248,
      estimated_gil_per_1000_seals: 1240,
      market_age_minutes: 4
    },
    {
      rank: 2,
      score: 89,
      sales_priority: "非常に売れやすい",
      item_id: 5268,
      item_name: "樹液塊",
      item_name_en: "Hardened Sap",
      seal_cost: 200,
      exchange_quantity: 1,
      daily_sale_velocity: 300,
      average_sale_price: 900,
      minimum_listing_price: 850,
      listed_quantity: 300,
      estimated_days_supply: 1,
      sell_batch_quantity: 300,
      estimated_days_to_sell_batch: 1,
      estimated_gross_per_exchange: 900,
      estimated_gil_per_1000_seals: 4500,
      market_age_minutes: 5
    }
  ]
};

const savedPlanContext = {
  journal: {
    page_type: "journal",
    journal_entries: [
      { title: "誤分類1" },
      { title: "誤分類2" },
      { title: "誤分類3" }
    ]
  }
};

function payload(pathname, gcUploaded = false) {
  if (pathname === "/api/sync") return { character };
  if (pathname === "/api/state") return { character, preferences: { available_minutes: 60, energy: 3 }, plan: emptyPlan };
  if (pathname === "/api/plan") return { plan: emptyPlan };
  if (pathname === "/api/achievements/sync" || pathname === "/api/achievements") {
    return { achievements: { total_achievements: 0, achievement_points: 0, page_total: 0, history: [] } };
  }
  if (pathname === "/api/activity/today") return { count: 0 };
  if (pathname === "/api/grand-company/seal-exchange-recommendations") return sealMarket;
  if (pathname === "/api/grand-company/delivery-costs") {
    return gcUploaded ? deliveryCosts : { ok: true, setup_required: true, deliveries: [], recommendation: null, cost_advice: false };
  }
  if (pathname === "/api/grand-company/deliveries") {
    return gcUploaded
      ? {
          ok: true,
          setup_required: false,
          company_name: "双蛇党",
          observed_at: "2026-08-11T01:10:00.000Z",
          confidence: 0.96,
          deliveries: [pastedDelivery],
          recommended: pastedDelivery
        }
      : { setup_required: true, deliveries: [], recommended: null, message: "双蛇党の納品一覧スクショをCtrl+Vしてください。" };
  }
  if (pathname === "/api/context") return { context: savedPlanContext };
  return {};
}

test("GC screenshot stays in the GC card and routine flows GC -> craft/gather tribes -> plan", async ({ page }) => {
  const pageErrors = [];
  let gcUploaded = false;
  let contextPasteBody = "";
  page.on("pageerror", error => pageErrors.push(error.message));
  await page.addInitScript(() => localStorage.clear());

  await page.route("**/api/**", async route => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/context/image") {
      contextPasteBody = route.request().postData() || "";
      gcUploaded = true;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          duplicate: false,
          context_saved: false,
          grand_company_context_saved: true,
          analysis: {
            page_type: "grand_company_deliveries",
            confidence: 0.96,
            grand_company_deliveries: {
              company_name: "双蛇党",
              deliveries: [pastedDelivery]
            },
            journal_entries: [],
            achievement_entries: [],
            crafter_stats: null,
            gatherer_stats: null
          }
        })
      });
      return;
    }
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(payload(url.pathname, gcUploaded)) });
  });

  await page.goto("/", { waitUntil: "domcontentloaded" });

  await expect(page.locator("[data-gc-open] .retainer-flow-step")).toHaveText("1");
  await expect(page.locator("[data-tribe-open] .retainer-flow-step")).toHaveText("2");
  await expect(page.locator("[data-plan-open] .retainer-flow-step")).toHaveText("3");
  await expect(page.locator("[data-retainer-open]")).toBeHidden();
  const routineY = await page.evaluate(() => ["[data-gc-open]", "[data-tribe-open]", "[data-plan-open]"]
    .map(selector => document.querySelector(selector)?.getBoundingClientRect().top ?? null));
  expect(routineY.every(value => Number.isFinite(value))).toBe(true);
  expect(Math.max(...routineY) - Math.min(...routineY)).toBeLessThan(2);

  await expect(page.locator("[data-gc-content]")).toBeVisible();
  await expect(page.locator("#grandCompanyRoutineContent #contextInbox")).toHaveCount(1);
  await expect(page.locator("#contextInbox")).toHaveAttribute("data-workflow-context", "grand-company");
  await expect(page.locator("#grandCompanyRoutineContent #contextInboxSaved")).not.toContainText("ジャーナル 3件");

  const sealSection = page.locator("[data-gc-seal-market]");
  await expect(sealSection).toBeVisible();
  await expect(sealSection).toContainText("300個出す前提で、売れ筋順に比較");
  await expect(sealSection.locator(".gc-seal-table")).toBeVisible();
  await expect(sealSection).toContainText("コークス");
  await expect(sealSection).toContainText("300個向け1位");
  await expect(sealSection).toContainText("852.3個");
  await expect(sealSection).toContainText("約0.35日");
  await expect(sealSection).toContainText("1,240G");

  await page.evaluate(() => {
    const file = new File([new Uint8Array([1, 2, 3, 4])], "gc.png", { type: "image/png" });
    const event = new Event("paste", { bubbles: true, cancelable: true });
    Object.defineProperty(event, "clipboardData", {
      value: { items: [{ type: "image/png", getAsFile: () => file }] }
    });
    document.dispatchEvent(event);
  });

  await expect.poll(() => contextPasteBody).toContain('name="workflow_context"');
  await expect.poll(() => contextPasteBody).toContain("grand-company");
  await expect(page.locator("#grandCompanyRoutineContent #contextInboxStatus")).toContainText("双蛇党納品を1件");
  await expect(page.locator("[data-gc-content]")).toContainText("E2E貼付納品薬");
  await expect(page.locator("[data-gc-content]")).toContainText("必要 3 / 所持 1");

  const deliveryTable = page.locator(".gc-delivery-table");
  await expect(deliveryTable).toBeVisible();
  await expect(deliveryTable).toContainText("納品品");
  await expect(deliveryTable).toContainText("調達おすすめ");
  await expect(deliveryTable).toContainText("原材料から全部作る");
  await expect(deliveryTable).toContainText("約1,200G");
  await expect(page.locator(".gc-delivery-detail-row")).toBeHidden();
  const detailButton = page.locator(".gc-detail-toggle").first();
  await expect(detailButton).toHaveText("詳細");
  await detailButton.click();
  await expect(detailButton).toHaveAttribute("aria-expanded", "true");
  await expect(page.locator(".gc-delivery-detail-row")).toBeVisible();
  await expect(page.locator(".gc-delivery-detail-row")).toContainText("マケボで買う");
  await expect(page.locator(".gc-delivery-detail-row")).toContainText("約2,800G");
  await expect(page.locator(".gc-delivery-detail-row")).toContainText("原材料から作る");
  await expect(page.locator(".gc-delivery-detail-row")).toContainText("製作素材：");
  await expect(page.locator(".gc-delivery-detail-row")).toContainText("薬草 ×4（約800G）");
  await detailButton.click();
  await expect(page.locator(".gc-delivery-detail-row")).toBeHidden();
  await expect(page.locator("[data-gc-content]")).toContainText("一覧で選び、価格・製作素材は「詳細」で確認");

  await page.locator("button[data-gc-done]").click();
  await expect(page.locator("[data-tribe-content]")).toBeVisible();
  await expect(page.locator("[data-tribe-content]")).toContainText("双蛇党納品の次に友好部族（生産・採集）");
  await expect(page.locator("#contextInbox")).toBeHidden();

  await page.locator("[data-tribe-craft-toggle]").click();
  await expect(page.locator("[data-tribe-tab-status]")).toHaveText("1/2");
  await page.locator("[data-tribe-gather-toggle]").click();
  await expect(page.locator("[data-tribe-tab-status]")).toHaveText("✓ 完了");
  await expect(page.locator("[data-plan-open]")).toHaveAttribute("aria-selected", "true");
  await expect(page.locator("#planner #contextInboxSaved")).toContainText("ジャーナル 3件");

  await expect(page.locator("#taskBoard")).toBeVisible();
  await page.getByRole("button", { name: /^釣り/ }).click();
  await expect(page.locator(".task-board-timed-zero")).toBeVisible();
  await expect(page.locator(".task-board-timed-zero")).toContainText("現在表示できる候補はありません");

  expect(pageErrors).toEqual([]);
});

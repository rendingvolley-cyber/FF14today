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
  owned_quantity: 3,
  starred: true,
  bonus_text: "ボーナス",
  reward_text: "軍票 1000",
  confidence: 0.96,
  ready_now: true,
  missing_quantity: 0,
  recommendation_reason: "必要数をすでに所持していて、画面上にボーナス表示もあります。最初にこれを納品します。"
};

const sealMarket = {
  ok: true,
  world: "Chocobo",
  source: "Universalis",
  cached: false,
  cache_age_minutes: 0,
  recommendations: [
    {
      rank: 1,
      score: 86.4,
      item_id: 5530,
      item_name: "コークス",
      item_name_en: "Coke",
      seal_cost: 200,
      exchange_quantity: 1,
      daily_sale_velocity: 28.4,
      average_sale_price: 820,
      minimum_listing_price: 790,
      listed_quantity: 34,
      estimated_days_supply: 1.2,
      estimated_gross_per_exchange: 820,
      estimated_gil_per_1000_seals: 4100,
      market_age_minutes: 4
    },
    {
      rank: 2,
      score: 74.2,
      item_id: 5268,
      item_name: "樹液塊",
      item_name_en: "Hardened Sap",
      seal_cost: 200,
      exchange_quantity: 1,
      daily_sale_velocity: 14.1,
      average_sale_price: 900,
      minimum_listing_price: 850,
      listed_quantity: 55,
      estimated_days_supply: 3.9,
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
  if (pathname === "/api/retainer/recommendations") return { setup_required: true, recommendations: [], message: "調達依頼画面を貼ってください。" };
  if (pathname === "/api/grand-company/seal-exchange-recommendations") return sealMarket;
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

test("GC screenshot stays in the GC card and routine flows GC -> retainer -> craft/gather tribes -> plan", async ({ page }) => {
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
  await expect(page.locator("[data-retainer-open] .retainer-flow-step")).toHaveText("2");
  await expect(page.locator("[data-tribe-open] .retainer-flow-step")).toHaveText("3");
  await expect(page.locator("[data-plan-open] .retainer-flow-step")).toHaveText("4");
  await expect(page.locator("[data-gc-content]")).toBeVisible();
  await expect(page.locator("#grandCompanyRoutineContent #contextInbox")).toHaveCount(1);
  await expect(page.locator("#contextInbox")).toHaveAttribute("data-workflow-context", "grand-company");
  await expect(page.locator("#grandCompanyRoutineContent #contextInboxSaved")).not.toContainText("ジャーナル 3件");

  const sealSection = page.locator("[data-gc-seal-market]");
  await expect(sealSection).toBeVisible();
  await expect(sealSection).toContainText("マーケットの売れ筋から交換先を決める");
  await expect(sealSection).toContainText("コークス");
  await expect(sealSection).toContainText("いま交換するならこれ");
  await expect(sealSection).toContainText("4,100ギル");
  await expect(sealSection).toContainText("28.4個");

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
  await expect(page.locator("[data-gc-content]")).toContainText("必要 3 / 所持 3");
  await expect(page.locator("[data-gc-tab-status]")).toHaveText("すぐ納品");
  await expect(page.locator("#grandCompanyRoutineContent #contextInboxSaved")).not.toContainText("ジャーナル 3件");

  await page.locator("button[data-gc-done]").click();
  await expect(page.locator("[data-retainer-content]")).toBeVisible();
  await expect(page.locator("[data-retainer-open]")).toHaveAttribute("aria-selected", "true");
  await expect(page.locator("#retainerRoutineContent #contextInbox")).toHaveCount(1);
  await expect(page.locator("#retainerRoutineContent #contextInboxSaved")).not.toContainText("ジャーナル 3件");

  await page.locator("button[data-retainer-done]").click();
  await expect(page.locator("[data-tribe-content]")).toBeVisible();
  await expect(page.locator("[data-tribe-content]")).toContainText("リテイナーの次に友好部族（生産・採集）");
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

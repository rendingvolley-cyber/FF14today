import { test, expect } from "@playwright/test";

const materialFixture = {
  ok: true,
  company_name: "双蛇党",
  crafting_count: 2,
  actionable_count: 2,
  resolved_count: 2,
  unresolved_count: 0,
  unresolved: [],
  deliveries: [],
  aggregate: {
    direct_materials: [
      { item_id: 1, item_name: "オルコクロマイトインゴット", quantity: 5 },
      { item_id: 2, item_name: "ガルガンチュアレザー", quantity: 2 }
    ],
    raw_materials: [
      { item_id: 3, item_name: "オルコクロマイト", quantity: 15 },
      { item_id: 4, item_name: "獣皮", quantity: 4 }
    ]
  },
  market_price_independent: true
};

function apiFixture(pathname) {
  if (pathname === "/api/grand-company/recipe-materials") return materialFixture;
  if (pathname === "/api/state") return { character: null, preferences: {}, plan: null };
  if (pathname === "/api/achievements") return {};
  if (pathname === "/api/activity/today") return { count: 0 };
  if (pathname === "/api/hunts/today") return {
    ok: true,
    today: { total_count: 0, completed_count: 0, remaining_count: 0, remaining_areas: 0, estimated_minutes: 0, total_exp_reward: 0, groups: [] }
  };
  if (pathname === "/api/grand-company/deliveries") return {
    ok: true,
    setup_required: false,
    company_name: "双蛇党",
    deliveries: [],
    crafting_deliveries: [],
    gathering_deliveries: [],
    page_status: { crafting: false, gathering: false }
  };
  if (pathname === "/api/grand-company/delivery-costs" || pathname === "/api/grand-company/procurement-summary") {
    return { ok: true, deliveries: [], recommendation: null };
  }
  return null;
}

test("GC recipe material panel renders under today's delivery list", async ({ page }) => {
  const pageErrors = [];
  page.on("pageerror", error => pageErrors.push(error.message));

  await page.route("**/api/**", async route => {
    const url = new URL(route.request().url());
    const fixture = apiFixture(url.pathname);
    if (fixture !== null) {
      await route.fulfill({
        status: 200,
        contentType: "application/json; charset=utf-8",
        body: JSON.stringify(fixture)
      });
      return;
    }
    await route.fulfill({
      status: 503,
      contentType: "application/json; charset=utf-8",
      body: JSON.stringify({ error: "e2e_external_api_blocked" })
    });
  });

  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.evaluate(() => {
    const gc = document.querySelector("[data-gc-content]");
    if (!gc) throw new Error("GC root missing");
    gc.hidden = false;
    gc.innerHTML = `
      <div data-gc-two-page-lists>
        <div class="gc-category-head"><h3>今日の納品一覧</h3><span>製作と採集を別々に表示</span></div>
        <section data-gc-category="crafting"><div class="gc-category-head"><h3>製作一覧（軍需品調達）</h3></div></section>
      </div>`;
  });

  const panel = page.locator("[data-gc-material-requirements-panel]");
  await expect(panel).toBeVisible();
  await expect(panel).toContainText("製作に必要な素材一覧");
  await expect(panel).toContainText("オルコクロマイトインゴット");
  await expect(panel).toContainText("×5");
  await expect(panel).toContainText("ガルガンチュアレザー");
  await expect(panel).toContainText("×2");

  await panel.getByRole("button", { name: "原材料まで展開" }).click();
  await expect(panel).toContainText("オルコクロマイト");
  await expect(panel).toContainText("×15");
  await expect(panel).toContainText("獣皮");
  await expect(panel).toContainText("×4");
  expect(pageErrors).toEqual([]);
});

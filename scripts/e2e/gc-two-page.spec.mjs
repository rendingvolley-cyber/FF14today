import { test, expect } from "@playwright/test";

const character = {
  lodestone_id: "3091607",
  name: "Kanade Tachibana",
  world: "Chocobo",
  data_center: "Mana",
  synced_at: "2026-08-11T04:00:00.000Z",
  jobs: [{ code: "RDM", name_ja: "赤魔道士", level: 92, role: "caster" }]
};

const emptyPlan = { selected_mode: "efficient", planner_kind: "RULE", notice: "", focus_job: null, methods: [], skip_today: [] };

const crafting = {
  row_index: 0,
  page_kind: "crafting",
  page_row_index: 0,
  item_name: "製作テスト納品品",
  requested_quantity: 2,
  owned_quantity: 0,
  starred: true,
  bonus_text: null,
  reward_text: "軍票 1200",
  confidence: 0.95,
  procurement: {
    status: "ok",
    quantity_to_acquire: 2,
    market_buy: { available: true, gil: 2400 },
    craft_raw: { available: true, gil: 900, materials: [{ item_name: "製作素材A", quantity: 4, total_gil: 900 }] },
    recommended_route: { label: "原材料から全部作る", available: true, gil: 900 }
  }
};

const gathering = {
  row_index: 1,
  page_kind: "gathering",
  page_row_index: 0,
  item_name: "採集テスト納品品",
  requested_quantity: 10,
  owned_quantity: 3,
  starred: false,
  bonus_text: null,
  reward_text: "軍票 800",
  confidence: 0.95,
  procurement: {
    status: "recipe_unavailable",
    quantity_to_acquire: 7,
    market_buy: null,
    craft_raw: null,
    recommended_route: null
  }
};

function basePayload(pathname) {
  if (pathname === "/api/sync") return { character };
  if (pathname === "/api/state") return { character, preferences: { available_minutes: 60, energy: 3 }, plan: emptyPlan };
  if (pathname === "/api/plan") return { plan: emptyPlan };
  if (pathname === "/api/achievements/sync" || pathname === "/api/achievements") return { achievements: { total_achievements: 0, achievement_points: 0, page_total: 0, history: [] } };
  if (pathname === "/api/activity/today") return { count: 0 };
  if (pathname === "/api/retainer/recommendations") return { setup_required: true, recommendations: [], message: "調達依頼画面を貼ってください。" };
  if (pathname === "/api/context") return { context: {} };
  if (pathname === "/api/grand-company/seal-exchange-recommendations") return { ok: true, sell_batch_quantity: 300, recommendations: [] };
  if (pathname === "/api/grand-company/deliveries") return {
    ok: true,
    setup_required: false,
    page_status: { crafting: true, gathering: true },
    missing_pages: [],
    crafting_deliveries: [crafting],
    gathering_deliveries: [gathering],
    deliveries: [crafting, gathering],
    recommended: crafting
  };
  if (pathname === "/api/grand-company/delivery-costs") return {
    ok: true,
    cost_advice: true,
    deliveries: [crafting, gathering],
    recommendation: { row_index: 0, item_name: crafting.item_name, reason: "製作ページのおすすめ候補です。" },
    decision_owner: "user"
  };
  return {};
}

async function pasteImage(page) {
  await page.evaluate(() => {
    const file = new File([new Uint8Array([1, 2, 3])], "gc.png", { type: "image/png" });
    const event = new Event("paste", { bubbles: true, cancelable: true });
    Object.defineProperty(event, "clipboardData", { value: { items: [{ type: "image/png", getAsFile: () => file }] } });
    document.dispatchEvent(event);
  });
}

test("GC crafting and gathering pages stay separate and paste target is explicit", async ({ page }) => {
  const pageErrors = [];
  const pastedBodies = [];
  page.on("pageerror", error => pageErrors.push(error.message));
  await page.addInitScript(() => localStorage.clear());

  await page.route("**/api/**", async route => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/context/image") {
      const body = route.request().postData() || "";
      pastedBodies.push(body);
      const kind = body.includes("gathering") ? "gathering" : "crafting";
      const row = kind === "crafting" ? crafting : gathering;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          grand_company_context_saved: true,
          grand_company_page_kind: kind,
          grand_company_page_status: { crafting: true, gathering: true },
          analysis: {
            page_type: "grand_company_deliveries",
            confidence: 0.95,
            grand_company_deliveries: { page_kind: kind, deliveries: [row] }
          }
        })
      });
      return;
    }
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(basePayload(url.pathname)) });
  });

  await page.goto("/", { waitUntil: "domcontentloaded" });

  await expect(page.locator("[data-gc-page-capture]")).toBeVisible();
  await expect(page.locator('[data-gc-page-state="crafting"]')).toContainText("登録済 1件");
  await expect(page.locator('[data-gc-page-state="gathering"]')).toContainText("登録済 1件");
  await expect(page.locator('[data-gc-category="crafting"]')).toContainText("製作一覧（軍需品調達）");
  await expect(page.locator('[data-gc-category="crafting"]')).toContainText("製作テスト納品品");
  await expect(page.locator('[data-gc-category="gathering"]')).toContainText("採集一覧（補給品調達）");
  await expect(page.locator('[data-gc-category="gathering"]')).toContainText("採集テスト納品品");

  const craftingDetails = page.locator('[data-gc-category="crafting"] details').first();
  await craftingDetails.locator("summary").click();
  await expect(craftingDetails).toContainText("マケボで買う");
  await expect(craftingDetails).toContainText("原材料から作る");
  await expect(craftingDetails).toContainText("製作素材A ×4");

  await page.locator('[data-gc-page-select="crafting"]').click();
  await expect(page.locator("#contextInbox")).toHaveAttribute("data-gc-page-kind", "crafting");
  await pasteImage(page);
  await expect.poll(() => pastedBodies.length).toBeGreaterThanOrEqual(1);
  expect(pastedBodies.at(-1)).toContain('name="gc_page_kind"');
  expect(pastedBodies.at(-1)).toContain("crafting");

  await page.locator('[data-gc-page-select="gathering"]').click();
  await expect(page.locator("#contextInbox")).toHaveAttribute("data-gc-page-kind", "gathering");
  await pasteImage(page);
  await expect.poll(() => pastedBodies.length).toBeGreaterThanOrEqual(2);
  expect(pastedBodies.at(-1)).toContain("gathering");

  await expect(page.locator('[data-gc-category="crafting"]')).toContainText("製作テスト納品品");
  await expect(page.locator('[data-gc-category="gathering"]')).toContainText("採集テスト納品品");
  expect(pageErrors).toEqual([]);
});

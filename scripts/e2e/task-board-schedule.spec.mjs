import { test, expect } from "@playwright/test";

const character = {
  lodestone_id: "3091607",
  name: "Kanade Tachibana",
  world: "Chocobo",
  data_center: "Mana",
  synced_at: "2026-08-10T17:40:00.000Z",
  jobs: [
    { code: "RDM", name_ja: "赤魔道士", level: 92, role: "caster" },
    { code: "ALC", name_ja: "錬金術師", level: 90, role: "crafter" },
    { code: "MIN", name_ja: "採掘師", level: 81, role: "gatherer" },
    { code: "FSH", name_ja: "漁師", level: 80, role: "gatherer" }
  ]
};

const plans = {
  efficient: {
    selected_mode: "efficient",
    planner_kind: "RULE",
    notice: "戦闘候補",
    focus_job: { code: "RDM", name: "赤魔道士", level: 92, role: "caster" },
    methods: [{ rank: 1, task_key: "roulette:leveling", badge: "日次ボーナス", title: "赤魔道士で「コンテンツルーレット：レベリング」を1回", minutes: 30, reason: "未消化の日次ボーナスを回収する。", steps: ["コンテンツファインダーを開く"] }],
    skip_today: []
  },
  craft: {
    selected_mode: "craft",
    planner_kind: "RULE",
    notice: "生産候補",
    focus_job: { code: "ALC", name: "錬金術師", level: 90, role: "crafter" },
    methods: [
      { rank: 1, task_key: "craft:alc90:leve:ginseng-angle-brush", badge: "ギルドリーヴ納品", title: "ギルドリーヴ用「Ginseng Angle Brush」をHQで1個作る", minutes: 20, reason: "経験値効率の高いリーヴ。", job_code: "ALC", job_name: "錬金術師", job_level: 90, job_role: "crafter", steps: ["製作手帳を開く"] },
      { rank: 2, task_key: "craft:alc90:leve:growth-formula-lambda", badge: "材料軽めのリーヴ", title: "ギルドリーヴ用「Growth Formula Lambda」をHQで3個作る", minutes: 18, reason: "材料が軽い代替案。", job_code: "ALC", job_name: "錬金術師", job_level: 90, job_role: "crafter", steps: ["製作手帳を開く"] }
    ],
    skip_today: []
  },
  gather: {
    selected_mode: "gather",
    planner_kind: "RULE",
    notice: "採集候補",
    focus_job: { code: "MIN", name: "採掘師", level: 81, role: "gatherer" },
    methods: [
      { rank: 1, task_key: "gather:min81:collectable:rarefied-raw-ametrine", badge: "時間限定・次窓あり", title: "「Rarefied Raw Ametrine」を収集価値1000目標で採る", minutes: 18, reason: "Lv81採掘師の時間限定収集品。次の出現まで実時間約20分。ET 00:00-02:00 / 12:00-14:00。", job_code: "MIN", job_name: "採掘師", job_level: 81, job_role: "gatherer", steps: ["Labyrinthosへ移動"] },
      { rank: 2, task_key: "gather:min81:collectable:rarefied-high-durium-ore", badge: "いつでも採れる収集品", title: "Thavnairで「Rarefied High Durium Ore」を収集品として採る", minutes: 15, reason: "時間窓待ちが不要。", job_code: "MIN", job_name: "採掘師", job_level: 81, job_role: "gatherer", steps: ["Thavnairへ移動"] }
    ],
    skip_today: []
  },
  discover: {
    selected_mode: "discover",
    planner_kind: "RULE",
    notice: "その他候補",
    focus_job: null,
    methods: [
      { rank: 1, task_key: "discover:ocean-fishing", badge: "イベント釣り", title: "漁師でオーシャンフィッシングを1航海", minutes: 35, reason: "1航海だけで区切れる釣り。", job_code: "FSH", job_name: "漁師", job_level: 80, job_role: "gatherer", steps: ["リムサへ移動"] },
      { rank: 2, task_key: "discover:gold-saucer-gate", badge: "短い寄り道", title: "ゴールドソーサーで次のGATEを1回だけ遊ぶ", minutes: 20, reason: "短い寄り道。", steps: ["ゴールドソーサーへ移動"] }
    ],
    skip_today: []
  }
};

function statePayload(url) {
  const mode = url.searchParams.get("planner_mode") || "efficient";
  return { character, preferences: { available_minutes: 60, energy: 3 }, plan: plans[mode] || plans.efficient };
}

const costAdvice = {
  ok: true,
  world: "Chocobo",
  source: "Universalis",
  market_age_minutes: 3,
  market_pricing: "listing_quantity_curve",
  recipe_source: "verified_static_fallback",
  recipe_dynamic: false,
  recipe_warnings: [],
  inventory_evidence: { applied: false, observed_at: null, item_count: 0 },
  advice: {
    recommendedKey: "buy_direct",
    recommendationReason: "準備時間と価格のバランスが良い。",
    routes: [{
      key: "buy_direct",
      label: "中間素材を買って最終品だけ作る",
      available: true,
      gil: 8945,
      additionalGil: 8945,
      inventoryOpportunityGil: 0,
      inventoryEvidenceApplied: false,
      estimatedMinutes: 6,
      craftCount: 1,
      purchases: [
        { itemId: 36238, itemName: "エンチャント・マンガンインク", quantity: 1, hq: false, total: 1845 },
        { itemId: 44019, itemName: "ジンセン材", quantity: 3, hq: false, total: 5100 },
        { itemId: 44058, itemName: "シルバー・ロボレザー", quantity: 1, hq: false, total: 2000 }
      ],
      crafts: [{ itemId: 41856, itemName: "ジンセン・アングルブラシ", syntheses: 1 }]
    }]
  }
};

const emptyAchievements = { total_achievements: 0, achievement_points: 0, page_total: 0, history: [] };

function genericPayload(pathname) {
  if (pathname === "/api/sync") return { character };
  if (pathname === "/api/achievements/sync") return { achievements: emptyAchievements };
  if (pathname === "/api/achievements") return { achievements: emptyAchievements };
  if (pathname === "/api/activity/today") return { count: 0 };
  if (pathname === "/api/retainer/recommendations") return { setup_required: true, recommendations: [] };
  if (pathname === "/api/grand-company/deliveries") return { setup_required: true, deliveries: [], recommended: null };
  if (pathname === "/api/context") return { context: {} };
  return {};
}

test("category tabs, timed schedule, multi-select and material aggregation work together", async ({ page }) => {
  const pageErrors = [];
  page.on("pageerror", error => pageErrors.push(error.message));

  await page.route("**/api/**", async route => {
    const url = new URL(route.request().url());
    let body;
    if (url.pathname === "/api/state") {
      body = statePayload(url);
    } else if (url.pathname === "/api/plan") {
      let requestBody = {};
      try { requestBody = route.request().postDataJSON() || {}; } catch {}
      const mode = requestBody.planner_mode || "efficient";
      body = { plan: plans[mode] || plans.efficient };
    } else if (url.pathname === "/api/leve/cost-advice") {
      body = costAdvice;
    } else {
      body = genericPayload(url.pathname);
    }
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
  });

  await page.goto("/", { waitUntil: "domcontentloaded" });

  await expect(page.locator("#taskBoard")).toBeVisible();
  await expect(page.locator("#taskBoardTabs .task-board-tab")).toHaveCount(5);
  await expect(page.locator("#taskBoardTabs")).toContainText("戦闘");
  await expect(page.locator("#taskBoardTabs")).toContainText("生産");
  await expect(page.locator("#taskBoardTabs")).toContainText("採集");
  await expect(page.locator("#taskBoardTabs")).toContainText("釣り");
  await expect(page.locator("#taskBoardTabs")).toContainText("その他");
  await expect(page.locator("#taskBoardGrid")).toContainText("コンテンツルーレット：レベリング");

  await expect(page.locator("#taskBoardTimed")).toBeVisible();
  await expect(page.locator("#taskBoardTimed")).toContainText("Rarefied Raw Ametrine");
  await expect(page.locator("#taskBoardTimed")).toContainText("あと20分");

  await page.locator('#taskBoardTabs [data-category="craft"]').click();
  await expect(page.locator("#taskBoardGrid")).toContainText("Ginseng Angle Brush");
  await page.locator("#taskBoardGrid .task-select-card").first().locator('input[type="checkbox"]').check();
  await expect(page.locator("#taskBoardSummaryText")).toContainText("選択1件");
  await expect(page.locator("#taskBoardSummaryText")).toContainText("不足素材3種");

  await page.locator("#taskBoardPrepButton").click();
  await expect(page.locator("#taskBoardMaterials")).toBeVisible();
  await expect(page.locator("#taskBoardMaterials")).toContainText("エンチャント・マンガンインク");
  await expect(page.locator("#taskBoardMaterials")).toContainText("ジンセン材");
  await expect(page.locator("#taskBoardMaterials")).toContainText("×3");
  await expect(page.locator("#taskBoardSummaryText")).toContainText("8,945G");

  await page.locator("#taskBoardTimedList .timed-task").first().locator('input[type="checkbox"]').check();
  await expect(page.locator("#taskBoardSummaryText")).toContainText("選択2件");
  await expect(page.locator("#taskBoardScheduleRows")).toContainText("移動・準備");
  await expect(page.locator("#taskBoardScheduleRows")).toContainText("Rarefied Raw Ametrine");

  await page.locator('#taskBoardTabs [data-category="fishing"]').click();
  await expect(page.locator("#taskBoardGrid")).toContainText("オーシャンフィッシング");
  await page.locator('#taskBoardTabs [data-category="other"]').click();
  await expect(page.locator("#taskBoardGrid")).toContainText("ゴールドソーサー");

  await page.locator('#taskBoardTabs [data-category="craft"]').click();
  await page.locator("#taskBoardGrid .task-select-card").first().locator(".task-now-button").click();
  await expect(page.locator(".method-card.recommended h3")).toContainText("Ginseng Angle Brush");

  expect(pageErrors).toEqual([]);
});

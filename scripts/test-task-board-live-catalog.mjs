import assert from "node:assert/strict";
import {
  parseFishTrackerData,
  calculateForecastTarget,
  nextFishWindow,
  buildBigFishRows,
  nextWeeklyResetMs,
  extractJapaneseDeadline,
  buildCatalogPlan
} from "../src/task-board-live-catalog.js";
import { seedCatalogPlan } from "../src/task-board-null-plan-recovery.js";
import {
  parseTeamcraftLazyFiles,
  nextGatherWindow,
  buildTimedGatheringRowsFromData,
  applyGameWindowPolicyToPlan
} from "../src/time-sensitive-game-windows.js";

const fishData = {
  FISH: {
    "1": {
      _id: 1,
      bigFish: true,
      dataMissing: false,
      gig: null,
      patch: 2,
      location: 10,
      startHour: 0,
      endHour: 24,
      weatherSet: [],
      previousWeatherSet: [],
      predators: [],
      bestCatchPath: [100],
      folklore: null,
      hookset: "Powerful",
      tug: "heavy"
    }
  },
  ITEMS: {
    "1": { name_ja: "テスト大物魚" },
    "100": { name_ja: "テスト餌" }
  },
  FISHING_SPOTS: { "10": { territory_id: 20, name_ja: "テスト釣り場" } },
  WEATHER_RATES: { "20": { zone_id: 30, weather_rates: [[1, 100]] } },
  WEATHER_TYPES: { "1": { name_ja: "晴れ" } },
  ZONES: { "30": { name_ja: "テスト地域" } }
};

{
  const parsed = parseFishTrackerData(`const DATA = ${JSON.stringify(fishData)};`);
  assert.equal(parsed.ITEMS[1].name_ja, "テスト大物魚");
  assert.throws(() => parseFishTrackerData("const X = {};"), /fish_data_marker_missing/);
}

{
  const now = Date.parse("2026-08-14T19:28:00+09:00");
  const window = nextFishWindow(fishData, fishData.FISH[1], now, 24);
  assert.ok(window);
  assert.equal(window.start_at_ms, now);
  assert.ok(window.end_at_ms > now);
  const rows = buildBigFishRows(fishData, 100, now, 3);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].name, "テスト大物魚");
  assert.equal(rows[0].bait[0], "テスト餌");
  assert.equal(rows[0].location, "テスト釣り場");
}

{
  assert.equal(calculateForecastTarget(0), 56);
  const reset = nextWeeklyResetMs(Date.parse("2026-08-14T19:28:00+09:00"));
  assert.equal(new Date(reset).toISOString(), "2026-08-18T08:00:00.000Z");
  const deadline = extractJapaneseDeadline("セール期間 2026年8月20日 23:59まで", Date.parse("2026-08-14T00:00:00+09:00"));
  assert.equal(new Date(deadline).toISOString(), "2026-08-20T14:59:00.000Z");
}

const character = {
  jobs: [
    { code: "RPR", name_ja: "リーパー", level: 73, role: "melee" },
    { code: "MIN", name_ja: "採掘師", level: 81, role: "gatherer" },
    { code: "BTN", name_ja: "園芸師", level: 82, role: "gatherer" },
    { code: "FSH", name_ja: "漁師", level: 100, role: "gatherer" }
  ],
  bozja_rank: 0
};
const env = {
  DB: {
    prepare() {
      return {
        bind() {
          return {
            async first() { return null; },
            async all() { return { results: [] }; }
          };
        }
      };
    }
  }
};

{
  const seeded = seedCatalogPlan(
    { character, preferences: { available_minutes: 60 }, plan: null },
    "https://example.invalid/api/state?planner_mode=efficient&focus_combat_job_code=RPR"
  );
  assert.equal(seeded.plan.selected_mode, "efficient");
  assert.equal(seeded.plan.remaining_minutes, 60);
  const request = new Request("https://example.invalid/api/state?planner_mode=efficient&focus_combat_job_code=RPR");
  const recovered = await buildCatalogPlan(request, env, seeded);
  assert.equal(recovered.focus_job.code, "RPR");
  assert.ok(recovered.methods.length >= 3);
}

{
  const existing = { character, plan: { selected_mode: "efficient", methods: [{ task_key: "keep" }] } };
  assert.equal(seedCatalogPlan(existing, "https://example.invalid/api/state?planner_mode=gather"), existing);
}

{
  const request = new Request("https://example.invalid/api/state?planner_mode=efficient&focus_combat_job_code=RPR");
  const plan = await buildCatalogPlan(request, env, { character, preferences: { available_minutes: 60 }, plan: { selected_mode: "efficient" } });
  assert.equal(plan.focus_job.code, "RPR");
  assert.ok(plan.methods.length >= 3);
  assert.ok(plan.methods.every(row => row.job_code === "RPR"));
  assert.ok(plan.methods.some(row => /レベリング/.test(row.title)));
}

{
  const request = new Request("https://example.invalid/api/state?planner_mode=gather&focus_gather_job_code=MIN");
  const plan = await buildCatalogPlan(request, env, { character, preferences: { available_minutes: 60 }, plan: { selected_mode: "gather" } });
  assert.ok(plan.methods.some(row => row.job_code === "MIN"));
  assert.ok(plan.methods.some(row => row.job_code === "FSH" && /釣り手帳/.test(row.title)));
}

{
  const files = parseTeamcraftLazyFiles(`
    'nodes': { hashedFileName: 'nodes.abc.json' },
    'items': { hashedFileName: 'items.def.json' },
    'places': { hashedFileName: 'places.ghi.json' }
  `);
  assert.deepEqual(files, { nodes: "nodes.abc.json", items: "items.def.json", places: "places.ghi.json" });
}

{
  const now = 175000;
  const window = nextGatherWindow({ spawns: [0], duration: 120 }, now, 12);
  assert.ok(window);
  assert.equal(window.open, true);
  assert.ok(window.end_at_ms > now);
}

{
  const now = 175000;
  const timedData = {
    nodes: {
      1: { limited: true, legendary: true, ephemeral: false, folklore: 9, spawns: [0], duration: 120, level: 81, type: 0, zoneid: 10, x: 12.3, y: 45.6, items: [100] },
      2: { limited: true, legendary: false, ephemeral: true, spawns: [0], duration: 240, level: 82, type: 2, zoneid: 20, x: 22.2, y: 33.3, items: [200] },
      3: { limited: true, legendary: true, ephemeral: false, spawns: [0], duration: 120, level: 90, type: 0, zoneid: 30, items: [300] },
      4: { limited: true, legendary: true, ephemeral: false, spawns: [0], duration: 120, level: 70, type: 0, zoneid: 40, items: [400] }
    },
    items: {
      100: { ja: "伝説の鉱石" },
      200: { ja: "刻限の草" },
      300: { ja: "高レベル鉱石" },
      400: { ja: "旧レベル鉱石" }
    },
    places: { 10: { ja: "採掘エリア" }, 20: { ja: "園芸エリア" }, 30: { ja: "高レベルエリア" }, 40: { ja: "旧エリア" } }
  };
  const rows = buildTimedGatheringRowsFromData(timedData, character, now, 6);
  assert.equal(rows.length, 2);
  assert.ok(rows.some(row => row.job_code === "MIN" && row.node_kind === "伝説" && /伝説の鉱石/.test(row.title)));
  assert.ok(rows.some(row => row.job_code === "BTN" && row.node_kind === "刻限" && /刻限の草/.test(row.title)));
  assert.ok(rows.every(row => row.schedule_type === "game_window"));
}

{
  const gather = applyGameWindowPolicyToPlan({ selected_mode: "gather", methods: [{ task_key: "normal" }] }, "gather", [{ task_key: "live:timed-gather:1", schedule_type: "game_window" }]);
  assert.equal(gather.methods.length, 2);
  const discover = applyGameWindowPolicyToPlan({ selected_mode: "discover", methods: [
    { task_key: "keep" },
    { task_key: "live:deadline:weekly-reset", schedule_type: "weekly" },
    { task_key: "live:deadline:ceremony", schedule_type: "event", source_kind: "lodestone" }
  ] }, "discover", []);
  assert.deepEqual(discover.methods.map(row => row.task_key), ["keep"]);
}

console.log("task-board live catalog OK");

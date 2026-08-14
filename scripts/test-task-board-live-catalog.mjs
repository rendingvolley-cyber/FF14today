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
    { code: "RPR", name_ja: "リーパー", level: 72, role: "melee" },
    { code: "MIN", name_ja: "採掘師", level: 81, role: "gatherer" },
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

console.log("task-board live catalog OK");

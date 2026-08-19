import app from "./gc-supply-duty-entry.js";
import { grandCompanyMaterialRequirements } from "./gc-material-requirements.js";
import { grandCompanyProcurementSummaryResponse } from "./gc-procurement-summary.js";
import { augmentStateResponse, liveFeedResponse } from "./task-board-live-catalog.js";
import { seedCatalogPlan } from "./task-board-null-plan-recovery.js";
import { applyGameWindowPolicy } from "./time-sensitive-game-windows.js";
import { addNearestTeleportHints } from "./time-sensitive-nearest-teleport.js";
import { replaceCraftSocietyFallback } from "./craft-leve-focus-wrapper.js";
import { augmentLeveRewardMarketResponse } from "./leve-reward-market-comparison.js";

const TIME_SENSITIVE_LAYOUT_VERSION = "stacked-v3-20260815";
const PROCUREMENT_UI_VERSION = "gc-procurement-v1-20260815";
const GC_MATERIAL_UI_VERSION = "gc-material-requirements-v2-20260819";
const CRAFT_PROCUREMENT_UI_VERSION = "craft-procurement-v2-20260816";
const SHOPPING_LIST_UI_VERSION = "procurement-shopping-v1-20260815";
const TASK_BOARD_NO_SCHEDULE_VERSION = "task-board-no-schedule-v1-20260816";
const GC_ITEM_NAME_STATUS_VERSION = "gc-item-name-status-v1-20260816";

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff"
    }
  });
}

function noStore(response) {
  const headers = new Headers(response.headers);
  headers.set("cache-control", "no-store, max-age=0");
  headers.set("pragma", "no-cache");
  headers.set("expires", "0");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}

async function topThreeResponse(response) {
  if (!response.ok || !(response.headers.get("content-type") || "").includes("application/json")) return response;
  let data;
  try { data = await response.clone().json(); }
  catch { return response; }
  const recommendations = Array.isArray(data?.recommendations)
    ? data.recommendations.slice(0, 3).map((row, index) => ({
      ...row,
      item_name: row?.item_name || row?.item_name_en || "交換品",
      rank: index + 1
    }))
    : [];
  return json({
    ...data,
    recommendations,
    recommendation_limit: 3,
    message: recommendations.length
      ? `軍票交換は、300個を3日以内に捌ける実売速度を満たす候補だけを1日実売数順で上位${recommendations.length}件表示しています。`
      : data?.message
  }, response.status);
}

export async function applyCraftProcurementPolicyResponse(request, response) {
  if (!response.ok || !(response.headers.get("content-type") || "").includes("application/json")) return response;
  let data;
  try { data = await response.clone().json(); }
  catch { return response; }
  if (!data?.plan) return response;
  const url = new URL(request.url);
  const mode = String(url.searchParams.get("planner_mode") || data.plan.selected_mode || "");
  if (mode !== "craft") return response;
  const availableMinutes = Number(data?.preferences?.available_minutes || data?.plan?.remaining_minutes || 60) || 60;
  return json(replaceCraftSocietyFallback(data, { availableMinutes }), response.status);
}

async function taskBoardStateResponse(request, response, env) {
  if (!response.ok || !(response.headers.get("content-type") || "").includes("application/json")) return response;
  let data;
  try { data = await response.clone().json(); }
  catch { return response; }
  const seeded = seedCatalogPlan(data, request.url);
  const prepared = seeded === data ? response : json(seeded, response.status);
  const augmented = await augmentStateResponse(request, prepared, env);
  const procurement = await applyCraftProcurementPolicyResponse(request, augmented);
  const timed = await applyGameWindowPolicy(request, procurement);
  return addNearestTeleportHints(request, timed);
}

function rewriteHtml(response) {
  if (!response.ok || !(response.headers.get("content-type") || "").includes("text/html")) return response;
  const transformed = new HTMLRewriter()
    .on("head", {
      element(element) {
        element.prepend(`<script src="/gc-item-name-status.js?v=${GC_ITEM_NAME_STATUS_VERSION}"></script>`, { html: true });
        element.prepend(`<script src="/task-board-no-schedule.js?v=${TASK_BOARD_NO_SCHEDULE_VERSION}"></script>`, { html: true });
        element.prepend(`<script type="module" src="/procurement-shopping-list.js?v=${SHOPPING_LIST_UI_VERSION}"></script>`, { html: true });
        element.prepend(`<script type="module" src="/craft-procurement-summary.js?v=${CRAFT_PROCUREMENT_UI_VERSION}"></script>`, { html: true });
        element.prepend(`<script type="module" src="/gc-procurement-summary.js?v=${PROCUREMENT_UI_VERSION}"></script>`, { html: true });
        element.prepend(`<script type="module" src="/gc-material-requirements.js?v=${GC_MATERIAL_UI_VERSION}"></script>`, { html: true });
        element.prepend(`<script src="/time-sensitive-game-window-labels.js?v=${TIME_SENSITIVE_LAYOUT_VERSION}"></script>`, { html: true });
        element.prepend('<script src="/task-board-focus-first.js"></script>', { html: true });
      }
    })
    .transform(response);
  return noStore(transformed);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/live-feed" && request.method === "GET") {
      return liveFeedResponse(env);
    }
    if (url.pathname === "/api/grand-company/procurement-summary" && request.method === "GET") {
      return grandCompanyProcurementSummaryResponse(request, env, app);
    }
    if (url.pathname === "/api/grand-company/recipe-materials" && request.method === "GET") {
      const result = await grandCompanyMaterialRequirements(request, env, app);
      return json(result.data, result.status);
    }
    if (url.pathname === "/api/leve/cost-advice" && request.method === "GET") {
      const response = await app.fetch(request, env);
      return augmentLeveRewardMarketResponse(request, response);
    }

    const response = await app.fetch(request, env);

    if ((url.pathname === "/time-sensitive-game-window-labels.js" ||
         url.pathname === "/task-board-focus-first.js" ||
         url.pathname === "/task-board-no-schedule.js" ||
         url.pathname === "/gc-item-name-status.js" ||
         url.pathname === "/gc-procurement-summary.js" ||
         url.pathname === "/gc-procurement-summary-core.js" ||
         url.pathname === "/gc-material-requirements.js" ||
         url.pathname === "/craft-procurement-summary.js" ||
         url.pathname === "/craft-procurement-summary-core.js" ||
         url.pathname === "/procurement-shopping-list.js" ||
         url.pathname === "/procurement-shopping-list-core.js") && request.method === "GET") {
      return noStore(response);
    }
    if (url.pathname === "/api/state" && request.method === "GET") {
      return taskBoardStateResponse(request, response, env);
    }
    if (url.pathname === "/api/grand-company/seal-exchange-recommendations" && request.method === "GET") {
      return topThreeResponse(response);
    }
    if (url.pathname === "/api/health" && request.method === "GET" && response.ok && (response.headers.get("content-type") || "").includes("application/json")) {
      let data;
      try { data = await response.clone().json(); }
      catch { return response; }
      return json({
        ...data,
        gc_seal_recommendation_limit: 3,
        gc_seal_velocity_hard_gate: true,
        gc_procurement_summary: true,
        gc_procurement_market_world: "Chocobo",
        gc_item_name_status_ui: true,
        gc_recipe_material_requirements: true,
        gc_recipe_material_price_independent: true,
        gc_recipe_material_ui_version: GC_MATERIAL_UI_VERSION,
        craft_leve_procurement_summary: true,
        craft_leve_reward_market_compare: true,
        procurement_shopping_list: true,
        task_board_focus_first_request: true,
        task_board_daily_schedule: false,
        task_board_live_catalog: true,
        task_board_null_plan_recovery: true,
        task_board_craft_procurement_outer_policy: true,
        time_sensitive_scope: "game_windows",
        time_sensitive_gathering: true,
        time_sensitive_nearest_teleport: true,
        time_sensitive_layout_version: TIME_SENSITIVE_LAYOUT_VERSION,
        html_cache_policy: "no-store",
        big_fish_live_feed: true,
        lodestone_deadline_feed: true
      }, response.status);
    }
    if (request.method === "GET") return rewriteHtml(response);
    return response;
  }
};

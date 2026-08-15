import app from "./gc-supply-duty-entry.js";
import { grandCompanyProcurementSummaryResponse } from "./gc-procurement-summary.js";
import { augmentStateResponse, liveFeedResponse } from "./task-board-live-catalog.js";
import { seedCatalogPlan } from "./task-board-null-plan-recovery.js";
import { applyGameWindowPolicy } from "./time-sensitive-game-windows.js";
import { addNearestTeleportHints } from "./time-sensitive-nearest-teleport.js";

const TIME_SENSITIVE_LAYOUT_VERSION = "stacked-v3-20260815";
const PROCUREMENT_UI_VERSION = "gc-procurement-v1-20260815";

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

function displayName(row) {
  const base = row?.item_name || row?.item_name_en || "交換品";
  if (row?.recommendation_strength === "fallback") return `${base}（条件弱め）`;
  if (row?.recommendation_strength === "secondary") return `${base}（次点）`;
  return base;
}

async function topThreeResponse(response) {
  if (!response.ok || !(response.headers.get("content-type") || "").includes("application/json")) return response;
  let data;
  try { data = await response.clone().json(); }
  catch { return response; }
  const recommendations = Array.isArray(data?.recommendations)
    ? data.recommendations.slice(0, 3).map((row, index) => ({
      ...row,
      item_name: displayName(row),
      rank: index + 1
    }))
    : [];
  return json({
    ...data,
    recommendations,
    recommendation_limit: 3,
    message: recommendations.length
      ? `軍票交換は市場データのある上位${recommendations.length}件を表示しています。条件を満たさない次点は明示しています。`
      : data?.message
  }, response.status);
}

async function taskBoardStateResponse(request, response, env) {
  if (!response.ok || !(response.headers.get("content-type") || "").includes("application/json")) return response;
  let data;
  try { data = await response.clone().json(); }
  catch { return response; }
  const seeded = seedCatalogPlan(data, request.url);
  const prepared = seeded === data ? response : json(seeded, response.status);
  const augmented = await augmentStateResponse(request, prepared, env);
  const timed = await applyGameWindowPolicy(request, augmented);
  return addNearestTeleportHints(request, timed);
}

function rewriteHtml(response) {
  if (!response.ok || !(response.headers.get("content-type") || "").includes("text/html")) return response;
  const transformed = new HTMLRewriter()
    .on("head", {
      element(element) {
        element.prepend(`<script type="module" src="/gc-procurement-summary.js?v=${PROCUREMENT_UI_VERSION}"></script>`, { html: true });
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

    const response = await app.fetch(request, env);

    if ((url.pathname === "/time-sensitive-game-window-labels.js" ||
         url.pathname === "/task-board-focus-first.js" ||
         url.pathname === "/gc-procurement-summary.js" ||
         url.pathname === "/gc-procurement-summary-core.js") && request.method === "GET") {
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
        gc_procurement_summary: true,
        gc_procurement_market_world: "Chocobo",
        task_board_focus_first_request: true,
        task_board_live_catalog: true,
        task_board_null_plan_recovery: true,
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

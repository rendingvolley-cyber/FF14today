import app from "./gc-supply-duty-entry.js";
import { augmentStateResponse, liveFeedResponse } from "./task-board-live-catalog.js";
import { seedCatalogPlan } from "./task-board-null-plan-recovery.js";

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
  return augmentStateResponse(request, prepared, env);
}

function rewriteHtml(response) {
  if (!response.ok || !(response.headers.get("content-type") || "").includes("text/html")) return response;
  return new HTMLRewriter()
    .on("head", {
      element(element) {
        element.prepend('<script src="/task-board-focus-first.js"></script>', { html: true });
      }
    })
    .transform(response);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/live-feed" && request.method === "GET") {
      return liveFeedResponse(env);
    }

    const response = await app.fetch(request, env);

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
        task_board_focus_first_request: true,
        task_board_live_catalog: true,
        task_board_null_plan_recovery: true,
        big_fish_live_feed: true,
        lodestone_deadline_feed: true
      }, response.status);
    }
    if (request.method === "GET") return rewriteHtml(response);
    return response;
  }
};

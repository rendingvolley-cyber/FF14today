import app from "./category-job-focus-wrapper.js";
import { localizeGuildlevePlan } from "./plan-japanese-wrapper.js";

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

async function localizePlanResponse(response) {
  if (!response.ok || !(response.headers.get("content-type") || "").includes("application/json")) return response;
  let data;
  try { data = await response.clone().json(); }
  catch { return response; }
  if (data?.plan) data.plan = localizeGuildlevePlan(data.plan);
  if (data && typeof data === "object" && data.version && !data.plan) data.guildleve_labels_locale = "ja";
  return json(data, response.status);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const response = await app.fetch(request, env);
    if ((url.pathname === "/api/plan" && request.method === "POST") ||
        (url.pathname === "/api/state" && request.method === "GET") ||
        (url.pathname === "/api/health" && request.method === "GET")) {
      return localizePlanResponse(response);
    }
    return response;
  }
};

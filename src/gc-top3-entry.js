import app from "./gc-supply-duty-entry.js";

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

async function topThreeResponse(response) {
  if (!response.ok || !(response.headers.get("content-type") || "").includes("application/json")) return response;
  let data;
  try { data = await response.clone().json(); }
  catch { return response; }
  const recommendations = Array.isArray(data?.recommendations)
    ? data.recommendations.slice(0, 3).map((row, index) => ({ ...row, rank: index + 1 }))
    : [];
  return json({
    ...data,
    recommendations,
    recommendation_limit: 3,
    message: recommendations.length
      ? `軍票交換は売れ筋上位${recommendations.length}件を表示しています。`
      : data?.message
  }, response.status);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const response = await app.fetch(request, env);
    if (url.pathname === "/api/grand-company/seal-exchange-recommendations" && request.method === "GET") {
      return topThreeResponse(response);
    }
    if (url.pathname === "/api/health" && request.method === "GET" && response.ok && (response.headers.get("content-type") || "").includes("application/json")) {
      let data;
      try { data = await response.clone().json(); }
      catch { return response; }
      return json({ ...data, gc_seal_recommendation_limit: 3 }, response.status);
    }
    return response;
  }
};

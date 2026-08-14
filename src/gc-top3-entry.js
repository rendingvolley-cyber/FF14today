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
    const response = await app.fetch(request, env);
    if (url.pathname === "/api/grand-company/seal-exchange-recommendations" && request.method === "GET") {
      return topThreeResponse(response);
    }
    if (url.pathname === "/api/health" && request.method === "GET" && response.ok && (response.headers.get("content-type") || "").includes("application/json")) {
      let data;
      try { data = await response.clone().json(); }
      catch { return response; }
      return json({ ...data, gc_seal_recommendation_limit: 3, task_board_focus_first_request: true }, response.status);
    }
    if (request.method === "GET") return rewriteHtml(response);
    return response;
  }
};

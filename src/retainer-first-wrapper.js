import app from "./retainer-market-wrapper.js";

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

function rewriteHtml(response) {
  if (!response.ok || !(response.headers.get("content-type") || "").includes("text/html")) return response;
  return new HTMLRewriter()
    .on(".version", {
      element(element) {
        element.setInnerContent("v1.6.1 · RETAINER FIRST");
      }
    })
    .transform(response);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const response = await app.fetch(request, env);

    if (url.pathname === "/api/health" && request.method === "GET" && response.ok) {
      let data;
      try { data = await response.clone().json(); }
      catch { return response; }
      return json({
        ...data,
        version: "1.6.1",
        retainer_first_daily_flow: true,
        retainer_daily_completion_local: true
      }, response.status);
    }

    if (request.method === "GET" && (response.headers.get("content-type") || "").includes("text/html")) {
      return rewriteHtml(response);
    }

    return response;
  }
};

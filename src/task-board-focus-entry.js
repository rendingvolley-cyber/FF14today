import app from "./gc-top3-entry.js";

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

export default {
  async fetch(request, env) {
    const response = await app.fetch(request, env);
    const url = new URL(request.url);
    if (url.pathname === "/api/health" && request.method === "GET" && response.ok && (response.headers.get("content-type") || "").includes("application/json")) {
      let data;
      try { data = await response.clone().json(); }
      catch { return response; }
      return json({ ...data, task_board_focus_first_request: true }, response.status);
    }
    if (request.method === "GET") return rewriteHtml(response);
    return response;
  }
};

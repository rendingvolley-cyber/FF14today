import app from "./gather-window-wrapper.js";

function rewriteHtml(response) {
  const type = response.headers.get("content-type") || "";
  if (!response.ok || !type.includes("text/html")) return response;
  return new HTMLRewriter()
    .on("head", {
      element(element) {
        element.append('<script src="/gather-checklist.js" type="module"></script>', { html: true });
      }
    })
    .on(".version", {
      element(element) {
        element.setInnerContent("v1.5.1 · GATHER TASKS");
      }
    })
    .transform(response);
}

export default {
  async fetch(request, env) {
    const response = await app.fetch(request, env);
    if (request.method === "GET") return rewriteHtml(response);
    return response;
  }
};

const previousFetch = window.fetch.bind(window);

window.fetch = async (input, init = {}) => {
  try {
    const rawUrl = typeof input === "string" ? input : input?.url || "";
    const url = new URL(rawUrl, location.href);
    const body = init?.body;
    if (url.pathname === "/api/context/image" && body instanceof FormData) {
      const workflow = String(body.get("workflow_context") || "").trim();
      if (workflow === "grand-company") {
        const kind = document.getElementById("contextInbox")?.dataset?.gcPageKind;
        if (kind === "crafting" || kind === "gathering") body.set("gc_page_kind", kind);
      }
    }
  } catch {}
  return previousFetch(input, init);
};

void import("./context-inbox-core.js");

import app from "./gc-top3-entry.js";
import { grandCompanyMaterialRequirements } from "./gc-material-requirements.js";
import {
  augmentPlanWithHunts,
  completeAllHunts,
  errorResponse,
  getTodayHunts,
  profileHashFromRequest,
  recognizeHuntImage,
  updateHuntProgress
} from "./hunt-service.js";

const HUNT_UI_VERSION = "hunt-mvp-v1-20260819";
const GC_MATERIAL_UI_VERSION = "gc-material-requirements-v2-20260819";

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
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function injectHuntUi(response) {
  if (!response.ok || !(response.headers.get("content-type") || "").includes("text/html")) return response;
  const transformed = new HTMLRewriter()
    .on("head", {
      element(element) {
        element.prepend(`<script type="module" src="/gc-material-requirements.js?v=${GC_MATERIAL_UI_VERSION}"></script>`, { html: true });
        element.prepend(`<script type="module" src="/hunt-section.js?v=${HUNT_UI_VERSION}"></script>`, { html: true });
      }
    })
    .transform(response);
  return noStore(transformed);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    try {
      if (url.pathname === "/api/hunts/today" && request.method === "GET") {
        const profileHash = await profileHashFromRequest(request);
        return json({ ok: true, today: await getTodayHunts(env, profileHash) });
      }
      if (url.pathname === "/api/hunts/recognize" && request.method === "POST") {
        return json(await recognizeHuntImage(request, env));
      }
      if (url.pathname === "/api/hunts/progress" && request.method === "POST") {
        return json(await updateHuntProgress(request, env));
      }
      if (url.pathname === "/api/hunts/complete-all" && request.method === "POST") {
        return json(await completeAllHunts(request, env));
      }
      if (url.pathname === "/api/grand-company/recipe-materials" && request.method === "GET") {
        const result = await grandCompanyMaterialRequirements(request, env, app);
        return json(result.data, result.status);
      }
    } catch (error) {
      return errorResponse(error);
    }

    const response = await app.fetch(request, env);
    if ((url.pathname === "/api/state" && request.method === "GET") ||
        (url.pathname === "/api/plan" && request.method === "POST")) {
      try { return await augmentPlanWithHunts(request, response, env); }
      catch { return response; }
    }
    if (url.pathname === "/api/health" && request.method === "GET" && response.ok && (response.headers.get("content-type") || "").includes("application/json")) {
      let data;
      try { data = await response.clone().json(); }
      catch { return response; }
      return json({
        ...data,
        daily_hunt_section: true,
        daily_hunt_image_recognition: true,
        daily_hunt_progress: true,
        daily_hunt_task_board_bridge: true,
        daily_hunt_ui_version: HUNT_UI_VERSION,
        gc_recipe_material_requirements: true,
        gc_recipe_material_price_independent: true,
        gc_recipe_material_ui_version: GC_MATERIAL_UI_VERSION
      }, response.status);
    }
    if ((url.pathname === "/hunt-section.js" || url.pathname === "/gc-material-requirements.js") && request.method === "GET") {
      return noStore(response);
    }
    if (request.method === "GET") return injectHuntUi(response);
    return response;
  }
};

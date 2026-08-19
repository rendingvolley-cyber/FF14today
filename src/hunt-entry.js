import app from "./gc-top3-entry.js";
import {
  augmentPlanWithHunts,
  completeAllHunts,
  errorResponse,
  getTodayHunts,
  profileHashFromRequest,
  recognizeHuntImage,
  updateHuntProgress
} from "./hunt-service.js";

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
        daily_hunt_task_board_bridge: true
      }, response.status);
    }
    return response;
  }
};

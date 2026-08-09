import app from "./index.js";
import {
  getLodestoneAchievementState,
  syncLodestoneAchievements
} from "./lodestone-achievements.js";

const OWNER_LODESTONE_ID = "3091607";
const OWNER_LODESTONE_URL = "https://jp.finalfantasyxiv.com/lodestone/character/3091607/";

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

function singleUserEnv(env) {
  return env;
}

async function rewriteApiRequest(request, env) {
  const url = new URL(request.url);

  if (url.pathname === "/api/health") {
    return json({
      ok: true,
      service: "ff14-today",
      version: "0.6.0",
      single_user: true,
      owner_lodestone_id: OWNER_LODESTONE_ID,
      lodestone_achievements: true,
      screenshot_import: false
    });
  }

  if (url.pathname === "/api/state" && request.method === "GET") {
    url.searchParams.set("lodestone_id", OWNER_LODESTONE_ID);
    return app.fetch(new Request(url.toString(), request), singleUserEnv(env));
  }

  if (url.pathname === "/api/sync" && request.method === "POST") {
    const headers = new Headers(request.headers);
    headers.set("content-type", "application/json");
    const rewritten = new Request(request.url, {
      method: "POST",
      headers,
      body: JSON.stringify({ lodestone_url: OWNER_LODESTONE_URL })
    });
    return app.fetch(rewritten, singleUserEnv(env));
  }

  if (url.pathname === "/api/plan" && request.method === "POST") {
    let payload = {};
    try { payload = await request.clone().json(); } catch {}
    payload.lodestone_id = OWNER_LODESTONE_ID;
    const headers = new Headers(request.headers);
    headers.set("content-type", "application/json");
    const rewritten = new Request(request.url, {
      method: "POST",
      headers,
      body: JSON.stringify(payload)
    });
    return app.fetch(rewritten, singleUserEnv(env));
  }

  if (url.pathname === "/api/achievements" && request.method === "GET") {
    const state = await getLodestoneAchievementState(env, OWNER_LODESTONE_ID);
    if (!state) return json({ ok: true, achievements: null });
    return json({ ok: true, achievements: state });
  }

  if (url.pathname === "/api/achievements/sync" && request.method === "POST") {
    const force = url.searchParams.get("force") === "1";
    const state = await syncLodestoneAchievements(env, OWNER_LODESTONE_ID, { force });
    return json({ ok: true, achievements: state });
  }

  if (url.pathname.startsWith("/api/achievement-import/")) {
    return json({
      error: "screenshot_import_removed",
      detail: "v0.6ではアチーブメントをLodestoneから直接同期します。"
    }, 410);
  }

  return app.fetch(request, singleUserEnv(env));
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) {
      try {
        return await rewriteApiRequest(request, env);
      } catch (error) {
        return json({
          error: "Server error",
          detail: error?.message || String(error)
        }, 500);
      }
    }
    return env.ASSETS.fetch(request);
  }
};

import app from "./index.js";
import {
  getLodestoneAchievementState,
  syncLodestoneAchievements
} from "./lodestone-achievements.js";
import { makeConcretePlan } from "./concrete-plan.js";

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

function normalizeCompletedDaily(value) {
  return {
    leveling: Boolean(value?.leveling),
    alliance: Boolean(value?.alliance)
  };
}

function completedDailyFromUrl(url) {
  return normalizeCompletedDaily({
    leveling: url.searchParams.get("completed_leveling") === "1",
    alliance: url.searchParams.get("completed_alliance") === "1"
  });
}

async function getOwnerCharacter(env) {
  const row = await env.DB.prepare(`
    SELECT lodestone_id, lodestone_url, name, world, data_center, jobs_json,
           bozja_rank, synced_at, parser_version
    FROM character_state
    WHERE lodestone_id=?
    LIMIT 1
  `).bind(OWNER_LODESTONE_ID).first();

  if (!row) return null;
  return {
    lodestone_id: row.lodestone_id,
    lodestone_url: row.lodestone_url,
    name: row.name,
    world: row.world,
    data_center: row.data_center,
    jobs: JSON.parse(row.jobs_json),
    bozja_rank: row.bozja_rank,
    synced_at: row.synced_at,
    parser_version: row.parser_version
  };
}

async function rewriteStateResponse(response, completedDaily) {
  const type = response.headers.get("content-type") || "";
  if (!type.includes("application/json")) return response;

  let data;
  try { data = await response.clone().json(); }
  catch { return response; }

  if (data?.character && data?.plan) {
    const minutes = Number(data.preferences?.available_minutes) || 60;
    const energy = Number(data.preferences?.energy) || 2;
    data.plan = makeConcretePlan(data.character, minutes, energy, data.plan, completedDaily);
  }

  return json(data, response.status);
}

async function rewritePlanResponse(response, env, payload) {
  const type = response.headers.get("content-type") || "";
  if (!type.includes("application/json")) return response;

  let data;
  try { data = await response.clone().json(); }
  catch { return response; }

  if (response.ok && data?.plan) {
    const character = await getOwnerCharacter(env);
    if (character) {
      const minutes = Math.max(15, Math.min(240, Number(payload.available_minutes) || 60));
      const energy = Math.max(1, Math.min(5, Number(payload.energy) || 2));
      const completedDaily = normalizeCompletedDaily(payload.completed_daily);
      data.plan = makeConcretePlan(character, minutes, energy, data.plan, completedDaily);
    }
  }

  return json(data, response.status);
}

async function rewriteApiRequest(request, env) {
  const url = new URL(request.url);

  if (url.pathname === "/api/health") {
    return json({
      ok: true,
      service: "ff14-today",
      version: "0.7.2",
      single_user: true,
      owner_lodestone_id: OWNER_LODESTONE_ID,
      lodestone_achievements: true,
      concrete_planner: true,
      ranked_methods: 3,
      daily_checklist: true,
      screenshot_import: false
    });
  }

  if (url.pathname === "/api/state" && request.method === "GET") {
    const completedDaily = completedDailyFromUrl(url);
    url.searchParams.set("lodestone_id", OWNER_LODESTONE_ID);
    const response = await app.fetch(new Request(url.toString(), request), singleUserEnv(env));
    return rewriteStateResponse(response, completedDaily);
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
    const response = await app.fetch(rewritten, singleUserEnv(env));
    return rewritePlanResponse(response, env, payload);
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
      detail: "v0.7ではアチーブメントをLodestoneから直接同期します。"
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

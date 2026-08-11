import app from "./gc-market-fallback-wrapper.js";
import { applyCategoryJobFocus } from "./category-job-focus.js";

const OWNER_LODESTONE_ID = "3091607";

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

async function ownerCharacter(env) {
  try {
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
  } catch {
    return null;
  }
}

async function rewritePlanResponse(response, env, options) {
  if (!response.ok || !(response.headers.get("content-type") || "").includes("application/json")) return response;
  let data;
  try { data = await response.clone().json(); }
  catch { return response; }
  if (!data?.plan) return response;
  if (!options.focusCraftJobCode && !options.focusGatherJobCode) return response;
  const character = data.character || await ownerCharacter(env);
  if (!character) return response;
  data.plan = applyCategoryJobFocus(data.plan, character, options);
  return json(data, response.status);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/plan" && request.method === "POST") {
      let payload = {};
      try { payload = await request.clone().json(); } catch {}
      const response = await app.fetch(request, env);
      return rewritePlanResponse(response, env, {
        focusCraftJobCode: String(payload.focus_craft_job_code || "").trim(),
        focusGatherJobCode: String(payload.focus_gather_job_code || "").trim(),
        availableMinutes: Number(payload.available_minutes) || Number(payload.remaining_minutes) || undefined
      });
    }

    if (url.pathname === "/api/state" && request.method === "GET") {
      const response = await app.fetch(request, env);
      return rewritePlanResponse(response, env, {
        focusCraftJobCode: String(url.searchParams.get("focus_craft_job_code") || "").trim(),
        focusGatherJobCode: String(url.searchParams.get("focus_gather_job_code") || "").trim()
      });
    }

    const response = await app.fetch(request, env);
    if (url.pathname === "/api/health" && request.method === "GET" && response.ok && (response.headers.get("content-type") || "").includes("application/json")) {
      let data;
      try { data = await response.clone().json(); }
      catch { return response; }
      return json({ ...data, category_job_focus: true, category_job_focus_version: "v1" }, response.status);
    }
    return response;
  }
};

import app from "./retainer-first-wrapper.js";
import { applyCombatJobFocus } from "./combat-job-focus.js";

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

function japanDateKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  const get = type => parts.find(part => part.type === type)?.value || "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

async function ownerCharacter(env) {
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

async function completionCounts(env) {
  try {
    const result = await env.DB.prepare(`
      SELECT task_key, COUNT(*) AS completion_count
      FROM activity_history
      WHERE lodestone_id=? AND activity_date=?
      GROUP BY task_key
      LIMIT 100
    `).bind(OWNER_LODESTONE_ID, japanDateKey()).all();
    const counts = {};
    for (const row of result.results || []) {
      const key = String(row.task_key || "").trim();
      if (key) counts[key] = Math.max(0, Number(row.completion_count) || 0);
    }
    return counts;
  } catch {
    return {};
  }
}

function completedFromStateUrl(url) {
  return {
    leveling: url.searchParams.get("completed_leveling") === "1",
    alliance: url.searchParams.get("completed_alliance") === "1"
  };
}

async function rewritePlanResponse(response, env, options) {
  if (!response.ok || !(response.headers.get("content-type") || "").includes("application/json")) return response;
  let data;
  try { data = await response.clone().json(); }
  catch { return response; }
  if (!data?.plan || data.plan.selected_mode !== "efficient" || !options.focusJobCode) return response;
  const character = data.character || await ownerCharacter(env);
  if (!character) return response;
  data.plan = applyCombatJobFocus(data.plan, character, {
    focusJobCode: options.focusJobCode,
    availableMinutes: options.availableMinutes,
    completedDaily: options.completedDaily,
    completionCounts: await completionCounts(env)
  });
  return json(data, response.status);
}

function rewriteHtml(response) {
  if (!response.ok || !(response.headers.get("content-type") || "").includes("text/html")) return response;
  return new HTMLRewriter()
    .on("head", {
      element(element) {
        element.append('<link rel="stylesheet" href="/combat-job-switcher.css"><script src="/combat-job-switcher.js" type="module"></script>', { html: true });
      }
    })
    .on(".version", {
      element(element) {
        element.setInnerContent("v1.7.1 · 80-90 ROUTES");
      }
    })
    .transform(response);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/plan" && request.method === "POST") {
      let payload = {};
      try { payload = await request.clone().json(); } catch {}
      const response = await app.fetch(request, env);
      return rewritePlanResponse(response, env, {
        focusJobCode: String(payload.focus_combat_job_code || "").trim(),
        availableMinutes: Number(payload.available_minutes) || 60,
        completedDaily: payload.completed_daily || {}
      });
    }

    if (url.pathname === "/api/state" && request.method === "GET") {
      const response = await app.fetch(request, env);
      return rewritePlanResponse(response, env, {
        focusJobCode: String(url.searchParams.get("focus_combat_job_code") || "").trim(),
        availableMinutes: 60,
        completedDaily: completedFromStateUrl(url)
      });
    }

    const response = await app.fetch(request, env);
    if (url.pathname === "/api/health" && request.method === "GET" && response.ok) {
      let data;
      try { data = await response.clone().json(); }
      catch { return response; }
      return json({
        ...data,
        version: "1.7.1",
        combat_job_switcher: true,
        combat_job_focus_leveling: true,
        combat_leveling_routes_80_90: true
      }, response.status);
    }
    if (request.method === "GET" && (response.headers.get("content-type") || "").includes("text/html")) {
      return rewriteHtml(response);
    }
    return response;
  }
};

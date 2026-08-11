import app from "./category-job-focus-wrapper.js";
import {
  rebuildDiscoverTaskBoardPlan,
  rebuildEfficientTaskBoardPlan
} from "./task-board-recovery.js";
import { handleRetainerWorkflowImage } from "./retainer-workflow-image.js";

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
  try {
    const row = await env.DB.prepare(`
      SELECT lodestone_id, lodestone_url, name, world, data_center, jobs_json,
             bozja_rank, synced_at, parser_version
      FROM character_state
      WHERE lodestone_id=? LIMIT 1
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

function explicitFromStateUrl(url) {
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
  if (!data?.plan) return response;

  const character = data.character || await ownerCharacter(env);
  if (!character) return response;
  const counts = await completionCounts(env);
  const availableMinutes = Number(options.availableMinutes)
    || Number(data?.preferences?.available_minutes)
    || Number(data?.plan?.remaining_minutes)
    || 60;
  const energy = Number(options.energy)
    || Number(data?.preferences?.energy)
    || 3;

  if (options.mode === "efficient") {
    const focusJobCode = String(options.focusJobCode || data?.plan?.focus_job?.code || "").trim();
    if (focusJobCode) {
      data.plan = rebuildEfficientTaskBoardPlan({
        character,
        currentPlan: data.plan,
        focusJobCode,
        availableMinutes,
        energy,
        completionCounts: counts,
        explicitCompletedDaily: options.completedDaily || data?.plan?.completed_daily || {}
      });
    }
  }

  if (options.mode === "discover" && options.catalogDiscover) {
    data.plan = rebuildDiscoverTaskBoardPlan({
      character,
      currentPlan: data.plan,
      availableMinutes,
      energy,
      completionCounts: counts
    });
  }

  return json(data, response.status);
}

async function workflowContext(request) {
  try {
    const form = await request.clone().formData();
    return String(form.get("workflow_context") || "").trim();
  } catch {
    return "";
  }
}

async function rewriteRetainerRecommendations(response) {
  if (!response.ok || !(response.headers.get("content-type") || "").includes("application/json")) return response;
  let data;
  try { data = await response.clone().json(); }
  catch { return response; }
  if (!data?.setup_required) return response;
  return json({
    ...data,
    message: "貼る画面：リテイナーを1人開く → ベンチャー → 調達依頼 → アイテム候補が複数行並ぶ画面。複数リテイナーが並ぶ『リテイナー一覧』画面だけでは派遣アイテムを判定できません。"
  }, response.status);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/context/image" && request.method === "POST") {
      const context = await workflowContext(request);
      if (context === "retainer") {
        try {
          return await handleRetainerWorkflowImage(request, env);
        } catch (error) {
          return json({
            ok: false,
            error: "retainer_image_analysis_failed",
            detail: error?.message || "リテイナー画像を解析できませんでした。"
          }, Number(error?.status) || 500);
        }
      }
      return app.fetch(request, env);
    }

    if (url.pathname === "/api/state" && request.method === "GET") {
      const response = await app.fetch(request, env);
      const mode = String(url.searchParams.get("planner_mode") || "efficient");
      return rewritePlanResponse(response, env, {
        mode,
        catalogDiscover: mode === "discover",
        focusJobCode: url.searchParams.get("focus_combat_job_code") || "",
        completedDaily: explicitFromStateUrl(url)
      });
    }

    if (url.pathname === "/api/plan" && request.method === "POST") {
      let payload = {};
      try { payload = await request.clone().json(); } catch {}
      const response = await app.fetch(request, env);
      const mode = String(payload.planner_mode || "efficient");
      if (mode !== "efficient") return response;
      return rewritePlanResponse(response, env, {
        mode,
        catalogDiscover: false,
        focusJobCode: payload.focus_combat_job_code || "",
        availableMinutes: payload.available_minutes,
        energy: payload.energy,
        completedDaily: payload.completed_daily || {}
      });
    }

    if (url.pathname === "/api/retainer/recommendations" && request.method === "GET") {
      const response = await app.fetch(request, env);
      return rewriteRetainerRecommendations(response);
    }

    const response = await app.fetch(request, env);
    if (url.pathname === "/api/health" && request.method === "GET" && response.ok && (response.headers.get("content-type") || "").includes("application/json")) {
      let data;
      try { data = await response.clone().json(); }
      catch { return response; }
      return json({
        ...data,
        task_board_variety_recovery: true,
        daily_roulette_history_suppression: true,
        retainer_workflow_direct_parser: true
      }, response.status);
    }
    return response;
  }
};

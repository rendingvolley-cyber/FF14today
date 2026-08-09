import app from "./index.js";
import {
  getLodestoneAchievementState,
  syncLodestoneAchievements
} from "./lodestone-achievements.js";
import { makeConcretePlan } from "./concrete-plan.js";

const OWNER_LODESTONE_ID = "3091607";
const OWNER_LODESTONE_URL = "https://jp.finalfantasyxiv.com/lodestone/character/3091607/";

let activitySchemaReady = null;

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

function clampNumber(value, fallback, min, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.round(parsed)));
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

async function ensureActivitySchema(env) {
  if (!activitySchemaReady) {
    activitySchemaReady = (async () => {
      await env.DB.prepare(`
        CREATE TABLE IF NOT EXISTS activity_history (
          completion_id TEXT PRIMARY KEY,
          lodestone_id TEXT NOT NULL,
          activity_date TEXT NOT NULL,
          task_key TEXT NOT NULL,
          task_title TEXT NOT NULL,
          task_kind TEXT NOT NULL DEFAULT 'todo',
          daily_key TEXT,
          job_code TEXT,
          job_level INTEGER,
          planned_minutes INTEGER NOT NULL,
          actual_minutes INTEGER,
          completed_at TEXT NOT NULL,
          source TEXT NOT NULL DEFAULT 'ff14_today'
        )
      `).run();
      await env.DB.prepare(`
        CREATE INDEX IF NOT EXISTS idx_activity_history_date
        ON activity_history(lodestone_id, activity_date, completed_at)
      `).run();
    })().catch(error => {
      activitySchemaReady = null;
      throw error;
    });
  }
  return activitySchemaReady;
}

async function getCompletedTaskKeysToday(env) {
  await ensureActivitySchema(env);
  const date = japanDateKey();
  const result = await env.DB.prepare(`
    SELECT DISTINCT task_key
    FROM activity_history
    WHERE lodestone_id=? AND activity_date=?
    ORDER BY task_key
    LIMIT 100
  `).bind(OWNER_LODESTONE_ID, date).all();

  return (result.results || [])
    .map(row => String(row.task_key || "").trim())
    .filter(Boolean);
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
      const minutes = clampNumber(payload.available_minutes, 60, 0, 240);
      const energy = clampNumber(payload.energy, 2, 1, 5);
      const completedDaily = normalizeCompletedDaily(payload.completed_daily);
      const completedTaskKeys = await getCompletedTaskKeysToday(env);
      data.plan = makeConcretePlan(
        character,
        minutes,
        energy,
        data.plan,
        completedDaily,
        completedTaskKeys
      );
    }
  }

  return json(data, response.status);
}

function normalizeCompletionPayload(payload) {
  const completionId = String(payload?.completion_id || "").trim();
  const taskKey = String(payload?.task_key || "").trim().slice(0, 160);
  const taskTitle = String(payload?.task_title || "").trim().slice(0, 300);
  const dailyKey = payload?.daily_key == null ? null : String(payload.daily_key);
  const jobCode = payload?.job_code == null ? null : String(payload.job_code).slice(0, 12);
  const jobLevel = payload?.job_level == null ? null : clampNumber(payload.job_level, null, 1, 100);
  const plannedMinutes = clampNumber(payload?.planned_minutes, 0, 1, 240);
  const actualMinutes = payload?.actual_minutes == null
    ? null
    : clampNumber(payload.actual_minutes, null, 1, 480);

  if (!/^[A-Za-z0-9_-]{16,128}$/.test(completionId)) throw new Error("completion_id が不正です。");
  if (!taskKey) throw new Error("task_key がありません。");
  if (!taskTitle) throw new Error("task_title がありません。");
  if (dailyKey !== null && !["leveling", "alliance"].includes(dailyKey)) throw new Error("daily_key が不正です。");
  if (!plannedMinutes) throw new Error("planned_minutes が不正です。");

  return { completionId, taskKey, taskTitle, dailyKey, jobCode, jobLevel, plannedMinutes, actualMinutes };
}

async function recordActivity(request, env) {
  let payload = {};
  try { payload = await request.json(); } catch {}
  const item = normalizeCompletionPayload(payload);

  await ensureActivitySchema(env);
  const completedAt = new Date().toISOString();
  const activityDate = japanDateKey();

  await env.DB.prepare(`
    INSERT INTO activity_history (
      completion_id, lodestone_id, activity_date, task_key, task_title,
      task_kind, daily_key, job_code, job_level, planned_minutes,
      actual_minutes, completed_at, source
    ) VALUES (?, ?, ?, ?, ?, 'todo', ?, ?, ?, ?, ?, ?, 'ff14_today')
    ON CONFLICT(completion_id) DO NOTHING
  `).bind(
    item.completionId,
    OWNER_LODESTONE_ID,
    activityDate,
    item.taskKey,
    item.taskTitle,
    item.dailyKey,
    item.jobCode,
    item.jobLevel,
    item.plannedMinutes,
    item.actualMinutes,
    completedAt
  ).run();

  return json({
    ok: true,
    activity: {
      completion_id: item.completionId,
      activity_date: activityDate,
      task_key: item.taskKey,
      task_title: item.taskTitle,
      daily_key: item.dailyKey,
      planned_minutes: item.plannedMinutes,
      actual_minutes: item.actualMinutes,
      completed_at: completedAt
    }
  });
}

async function getTodayActivity(env) {
  await ensureActivitySchema(env);
  const date = japanDateKey();
  const result = await env.DB.prepare(`
    SELECT completion_id, task_key, task_title, daily_key, job_code, job_level,
           planned_minutes, actual_minutes, completed_at
    FROM activity_history
    WHERE lodestone_id=? AND activity_date=?
    ORDER BY completed_at DESC
    LIMIT 20
  `).bind(OWNER_LODESTONE_ID, date).all();

  return json({
    ok: true,
    activity_date: date,
    count: result.results?.length || 0,
    items: result.results || []
  });
}

async function rewriteApiRequest(request, env) {
  const url = new URL(request.url);

  if (url.pathname === "/api/health") {
    return json({
      ok: true,
      service: "ff14-today",
      version: "0.8.1",
      single_user: true,
      owner_lodestone_id: OWNER_LODESTONE_ID,
      lodestone_achievements: true,
      concrete_planner: true,
      ranked_methods: 3,
      daily_checklist: true,
      task_completion: true,
      activity_history: true,
      suppress_completed_todos: true,
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

    const requestedMinutes = clampNumber(payload.available_minutes, 60, 0, 240);
    if (requestedMinutes < 15) {
      const character = await getOwnerCharacter(env);
      if (!character) return json({ error: "Sync Lodestone first." }, 409);
      const completedDaily = normalizeCompletedDaily(payload.completed_daily);
      const completedTaskKeys = await getCompletedTaskKeysToday(env);
      const plan = makeConcretePlan(
        character,
        requestedMinutes,
        clampNumber(payload.energy, 2, 1, 5),
        null,
        completedDaily,
        completedTaskKeys
      );
      return json({ ok: true, plan });
    }

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

  if (url.pathname === "/api/activity/complete" && request.method === "POST") {
    return recordActivity(request, env);
  }

  if (url.pathname === "/api/activity/today" && request.method === "GET") {
    return getTodayActivity(env);
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
      detail: "v0.8ではアチーブメントをLodestoneから直接同期します。"
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

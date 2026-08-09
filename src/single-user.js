import app from "./index.js";

const OWNER_LODESTONE_ID = "3091607";
const OWNER_LODESTONE_URL = "https://na.finalfantasyxiv.com/lodestone/character/3091607/";
const INTERNAL_AI_ACCESS_CODE = "ff14-today-single-user";
const DAILY_AI_LIMIT = 20;

const OWNER_EVIDENCE_REQUEST = {
  kind: "achievement_screenshot",
  title: "実績 → もうすぐ達成！",
  reason: "全実績を順番に撮る必要はありません。今日やる候補になりやすい、達成が近い実績だけ先に読み取ります。",
  instructions: [
    "FF14で「実績」画面を開く",
    "上の「もうすぐ達成！」タブを選ぶ",
    "いま見えている範囲を1枚スクショする",
    "ブラウザへ戻って Ctrl+V でそのまま貼り付ける"
  ]
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store"
    }
  });
}

function withInternalAiAccess(request) {
  const headers = new Headers(request.headers);
  headers.set("x-ai-access-code", INTERNAL_AI_ACCESS_CODE);
  return headers;
}

function singleUserEnv(env) {
  return new Proxy(env, {
    get(target, prop, receiver) {
      if (prop === "AI_ACCESS_CODE") return INTERNAL_AI_ACCESS_CODE;
      return Reflect.get(target, prop, receiver);
    }
  });
}

async function withOwnerEvidence(response) {
  const type = response.headers.get("content-type") || "";
  if (!type.includes("application/json")) return response;

  let data;
  try { data = await response.clone().json(); }
  catch { return response; }

  if (data?.progress_summary) {
    data.progress_summary.evidence_request = OWNER_EVIDENCE_REQUEST;
  }

  return new Response(JSON.stringify(data, null, 2), {
    status: response.status,
    headers: response.headers
  });
}

async function enforceGlobalAiLimit(env) {
  const day = new Date().toISOString().slice(0, 10);
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS single_user_ai_usage (
      usage_date TEXT PRIMARY KEY,
      screenshot_analyses INTEGER NOT NULL DEFAULT 0
    )
  `).run();

  const row = await env.DB.prepare(`
    SELECT screenshot_analyses FROM single_user_ai_usage WHERE usage_date=?
  `).bind(day).first();

  const count = Number(row?.screenshot_analyses || 0);
  if (count >= DAILY_AI_LIMIT) {
    return { ok: false, day, count };
  }

  await env.DB.prepare(`
    INSERT INTO single_user_ai_usage (usage_date, screenshot_analyses)
    VALUES (?, 1)
    ON CONFLICT(usage_date)
    DO UPDATE SET screenshot_analyses=screenshot_analyses+1
  `).bind(day).run();

  return { ok: true, day, count: count + 1 };
}

async function rewriteApiRequest(request, env) {
  const url = new URL(request.url);

  if (url.pathname === "/api/health") {
    return json({
      ok: true,
      service: "ff14-today",
      version: "0.5.0",
      single_user: true,
      owner_lodestone_id: OWNER_LODESTONE_ID,
      screenshot_import: true,
      clipboard_paste: true,
      gemini_secret_configured: Boolean(env.GEMINI_API_KEY),
      daily_ai_limit: DAILY_AI_LIMIT
    });
  }

  if (url.pathname === "/api/state" && request.method === "GET") {
    url.searchParams.set("lodestone_id", OWNER_LODESTONE_ID);
    const response = await app.fetch(new Request(url.toString(), request), singleUserEnv(env));
    return withOwnerEvidence(response);
  }

  if (url.pathname === "/api/sync" && request.method === "POST") {
    const headers = new Headers(request.headers);
    headers.set("content-type", "application/json");
    const rewritten = new Request(request.url, {
      method: "POST",
      headers,
      body: JSON.stringify({ lodestone_url: OWNER_LODESTONE_URL })
    });
    const response = await app.fetch(rewritten, singleUserEnv(env));
    return withOwnerEvidence(response);
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

  if (url.pathname === "/api/achievement-import/analyze" && request.method === "POST") {
    if (!env.GEMINI_API_KEY) {
      return json({ error: "Gemini APIキーがCloudflare Secretに未設定です。" }, 503);
    }

    const usage = await enforceGlobalAiLimit(env);
    if (!usage.ok) {
      return json({ error: `今日のSS解析上限（${DAILY_AI_LIMIT}回）に達しました。` }, 429);
    }

    let form;
    try { form = await request.clone().formData(); }
    catch { return json({ error: "画像アップロードを読み取れませんでした。" }, 400); }

    const file = form.get("image");
    const rewrittenForm = new FormData();
    rewrittenForm.append("lodestone_id", OWNER_LODESTONE_ID);
    if (file instanceof File) {
      rewrittenForm.append("image", file, file.name || "achievement.png");
    }

    const rewritten = new Request(request.url, {
      method: "POST",
      headers: withInternalAiAccess(request),
      body: rewrittenForm
    });
    return app.fetch(rewritten, singleUserEnv(env));
  }

  if (url.pathname === "/api/achievement-import/confirm" && request.method === "POST") {
    const response = await app.fetch(request, singleUserEnv(env));
    return withOwnerEvidence(response);
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
        return json({ error: "Server error", detail: error?.message || String(error) }, 500);
      }
    }
    return env.ASSETS.fetch(request);
  }
};
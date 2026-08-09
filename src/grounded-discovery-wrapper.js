import app from "./gather-ui-wrapper.js";

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

function isGroundedDiscoveryMethod(method) {
  if (!method) return false;
  if (method.measurable_motive === true) return true;
  if (method.strategic_value === true) return true;
  if (method.source_kind === "journal_screenshot") return true;
  return false;
}

function rerank(methods) {
  return methods.map((method, index) => ({ ...method, rank: index + 1 }));
}

function asNow(method) {
  if (!method) return null;
  return {
    task_key: method.task_key,
    daily_key: method.daily_key,
    title: method.title,
    minutes: method.minutes,
    reason: method.reason,
    condition: method.condition,
    steps: method.steps,
    repeat_count: method.repeat_count || 0
  };
}

export function applyGroundedDiscoveryGate(plan) {
  if (!plan || plan.session_complete || plan.selected_mode !== "discover" || !Array.isArray(plan.methods)) return plan;

  const methods = rerank(plan.methods.filter(isGroundedDiscoveryMethod).slice(0, 3));
  const recommended = methods[0] || null;

  return {
    ...plan,
    planner_kind: "grounded-discovery-v1.5.2",
    methods,
    now: asNow(recommended),
    next: methods[1] ? { title: methods[1].title, minutes: methods[1].minutes, reason: methods[1].reason } : null,
    fallback: methods[2]
      ? { title: methods[2].title, minutes: methods[2].minutes, reason: methods[2].reason }
      : { title: "根拠の薄い候補は出さない", minutes: 0, reason: "3枠を埋めるためのFATE・寄り道・回数消化は推薦しません。" },
    notice: methods.length
      ? `根拠を確認できた発見候補だけを${methods.length}件表示しています。3枠を埋めるための水増しはしません。`
      : "いまは称号進捗・未達報酬・期限・時限・将来価値まで確認できる発見候補がありません。適当なFATE等で枠を埋めず、根拠が増えるまで候補不足として扱います。",
    discovery_evidence_gate: true
  };
}

async function rewriteJsonPlan(response) {
  if (!response.ok || !(response.headers.get("content-type") || "").includes("application/json")) return response;
  let data;
  try { data = await response.clone().json(); }
  catch { return response; }
  if (data?.plan?.selected_mode === "discover") data.plan = applyGroundedDiscoveryGate(data.plan);
  if (data && typeof data === "object" && data.version && !data.plan) {
    data.version = "1.5.2";
    data.grounded_discovery_gate = true;
  }
  return json(data, response.status);
}

function rewriteHtml(response) {
  if (!response.ok || !(response.headers.get("content-type") || "").includes("text/html")) return response;
  return new HTMLRewriter()
    .on(".version", {
      element(element) {
        element.setInnerContent("v1.5.2 · GROUNDED");
      }
    })
    .transform(response);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const response = await app.fetch(request, env);
    if ((url.pathname === "/api/plan" && request.method === "POST") ||
        (url.pathname === "/api/state" && request.method === "GET") ||
        (url.pathname === "/api/health" && request.method === "GET")) {
      return rewriteJsonPlan(response);
    }
    if (request.method === "GET" && (response.headers.get("content-type") || "").includes("text/html")) {
      return rewriteHtml(response);
    }
    return response;
  }
};

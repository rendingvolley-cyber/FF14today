const AMETRINE_KEY = "gather:min81:collectable:rarefied-raw-ametrine";
const EORZEA_REAL_MS_PER_HOUR = 175 * 1000;
const AMETRINE_PERIOD_MS = 12 * EORZEA_REAL_MS_PER_HOUR;
const AMETRINE_WINDOW_MS = 2 * EORZEA_REAL_MS_PER_HOUR;

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

export function ametrineGameWindow(nowMs = Date.now()) {
  const cycle = Math.floor(nowMs / AMETRINE_PERIOD_MS);
  const cycleStart = cycle * AMETRINE_PERIOD_MS;
  const cycleEnd = cycleStart + AMETRINE_WINDOW_MS;
  const open = nowMs >= cycleStart && nowMs < cycleEnd;
  const startAt = open ? cycleStart : (cycle + 1) * AMETRINE_PERIOD_MS;
  return {
    open,
    start_at_ms: startAt,
    end_at_ms: startAt + AMETRINE_WINDOW_MS,
    label: "ET 00:00-02:00 / 12:00-14:00"
  };
}

function annotateGatherMethod(method, nowMs) {
  if (method?.task_key !== AMETRINE_KEY) return method;
  const window = ametrineGameWindow(nowMs);
  return {
    ...method,
    source_kind: "timed_gather",
    schedule_type: "game_window",
    time_window: {
      start_at_ms: window.start_at_ms,
      end_at_ms: window.end_at_ms,
      state: window.open ? "open" : "upcoming",
      label: window.label
    }
  };
}

function isExternalDeadline(method) {
  const key = String(method?.task_key || "");
  return key.startsWith("live:deadline:")
    || method?.source_kind === "lodestone"
    || method?.source_kind === "official_reset"
    || method?.schedule_type === "event"
    || method?.schedule_type === "weekly";
}

export function applyGameWindowPolicyToPlan(plan, mode, nowMs = Date.now()) {
  if (!plan || !Array.isArray(plan.methods)) return plan;
  if (mode === "gather") {
    return { ...plan, methods: plan.methods.map(method => annotateGatherMethod(method, nowMs)) };
  }
  if (mode === "discover") {
    const methods = plan.methods.filter(method => !isExternalDeadline(method));
    return { ...plan, methods, session_complete: methods.length === 0 };
  }
  return plan;
}

export async function applyGameWindowPolicy(request, response, nowMs = Date.now()) {
  if (!response.ok || !(response.headers.get("content-type") || "").includes("application/json")) return response;
  let data;
  try { data = await response.clone().json(); }
  catch { return response; }
  if (!data?.plan) return response;
  const url = new URL(request.url);
  const mode = String(url.searchParams.get("planner_mode") || data.plan.selected_mode || "");
  data.plan = applyGameWindowPolicyToPlan(data.plan, mode, nowMs);
  data.time_sensitive_scope = "game_windows";
  return json(data, response.status);
}

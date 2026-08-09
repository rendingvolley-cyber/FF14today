import app from "./measurable-motive-wrapper.js";

const AMETRINE_KEY = "gather:min81:collectable:rarefied-raw-ametrine";
const EORZEA_REAL_MS_PER_HOUR = 175 * 1000;
const AMETRINE_WINDOW_PERIOD_MS = 12 * EORZEA_REAL_MS_PER_HOUR;
const AMETRINE_WINDOW_LENGTH_MS = 2 * EORZEA_REAL_MS_PER_HOUR;
const AMETRINE_EXP_1000 = 1_110_780;
const EXP_TO_NEXT = {
  80: 5_992_000,
  81: 6_171_000,
  82: 6_942_000,
  83: 7_205_000,
  84: 7_948_000,
  85: 8_287_000,
  86: 9_231_000,
  87: 9_529_000,
  88: 10_459_000,
  89: 10_838_000,
  90: 13_278_000
};

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

export function ametrineWindow(nowMs = Date.now()) {
  const cycle = Math.floor(nowMs / AMETRINE_WINDOW_PERIOD_MS);
  const cycleStart = cycle * AMETRINE_WINDOW_PERIOD_MS;
  const cycleEnd = cycleStart + AMETRINE_WINDOW_LENGTH_MS;
  const open = nowMs >= cycleStart && nowMs < cycleEnd;
  const startMs = open ? cycleStart : (cycle + 1) * AMETRINE_WINDOW_PERIOD_MS;
  const endMs = startMs + AMETRINE_WINDOW_LENGTH_MS;
  const waitMinutes = open ? 0 : Math.max(1, Math.ceil((startMs - nowMs) / 60_000));
  return {
    open,
    startMs,
    endMs,
    waitMinutes,
    nextStartMs: startMs + AMETRINE_WINDOW_PERIOD_MS
  };
}

function jstTime(ms) {
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(new Date(ms));
}

function levelExpPercent(level) {
  const needed = EXP_TO_NEXT[Number(level)];
  if (!needed) return null;
  return Math.round((AMETRINE_EXP_1000 / needed) * 1000) / 10;
}

function enrichAmetrine(method, nowMs) {
  const window = ametrineWindow(nowMs);
  const start = jstTime(window.startMs);
  const end = jstTime(window.endMs);
  const nextStart = jstTime(window.nextStartMs);
  const expPercent = levelExpPercent(method.job_level);
  const expText = expPercent == null
    ? "収集価値1000で経験値1,110,780＋紫貨22"
    : `収集価値1000で経験値1,110,780＋紫貨22。Lv${method.job_level}の1レベル分の約${expPercent}%`;

  if (window.open) {
    return {
      ...method,
      badge: "今が採集窓",
      title: "「収集用のアメトリン原石」を収集価値1000目標で採る",
      minutes: 12,
      reason: `いま採集可能（JST ${start}〜${end} / ET 00:00-02:00 または12:00-14:00）。${expText}。窓が開いている今は、待ち時間ゼロで高い経験値と紫貨を同時回収できるため優先します。`,
      condition: `目的：時間限定ノードを待たずに回収する。この窓を逃しても次の開始はJST ${nextStart}なので、希少性だけを誇張しません。`,
      steps: [
        `${method.job_name || "採掘師"}（Lv${method.job_level || 81}）へジョブチェンジ`,
        "ラヴィリンソス「アルケイオン保管院」へテレポ",
        "プシケ送風塔（X:32.5 Y:21.2）へ移動",
        "時間限定の採掘ノードで「収集用のアメトリン原石」を収集価値1000目標で採集",
        "収集品取引窓口へ納品して「✓ 完了！」"
      ],
      window_priority: 100,
      window_wait_minutes: 0,
      progress_metric: expPercent == null ? "EXP 1,110,780 / 紫貨22" : `1回でLv${method.job_level}バー約${expPercent}%相当`
    };
  }

  const totalMinutes = window.waitMinutes + 10;
  const longWait = window.waitMinutes > 15;
  return {
    ...method,
    badge: longWait ? `次窓 ${start}・今は待たない` : `次窓まで約${window.waitMinutes}分`,
    title: "次の「収集用のアメトリン原石」採集窓を狙う",
    minutes: totalMinutes,
    reason: `次の採集窓はJST ${start}〜${end}（あと約${window.waitMinutes}分）。${expText}。${longWait ? "ただし今から待機するのは時間効率が悪いので、常設候補を先にしてこの候補の順位を下げます。" : "窓が近いため、今から移動準備を始めれば待ち時間を小さくできます。"}`,
    condition: `目的：時間窓を正確な時刻で管理する。今回を逃しても次の開始はJST ${nextStart}で、窓は約35分周期。`,
    steps: longWait
      ? [
          `今は待機しない。次の窓はJST ${start}〜${end}`, 
          `窓開始の約10分前までは、#1の常設採集候補を進める`,
          `${method.job_name || "採掘師"}へジョブチェンジしてラヴィリンソス「アルケイオン保管院」へテレポ`,
          "プシケ送風塔（X:32.5 Y:21.2）へ移動",
          "窓が開いたら「収集用のアメトリン原石」を収集価値1000目標で採集して納品"
        ]
      : [
          `${method.job_name || "採掘師"}（Lv${method.job_level || 81}）へジョブチェンジ`,
          "ラヴィリンソス「アルケイオン保管院」へテレポ",
          "プシケ送風塔（X:32.5 Y:21.2）へ移動",
          `JST ${start}の窓開始を待ち、収集価値1000目標で採集`,
          "収集品取引窓口へ納品して「✓ 完了！」"
        ],
    window_priority: longWait ? 5 : 90,
    window_wait_minutes: window.waitMinutes,
    progress_metric: expPercent == null ? "EXP 1,110,780 / 紫貨22" : `1回でLv${method.job_level}バー約${expPercent}%相当`
  };
}

function updatePlan(plan, nowMs = Date.now()) {
  if (!plan || plan.session_complete || plan.selected_mode !== "gather" || !Array.isArray(plan.methods)) return plan;
  const available = Number(plan.remaining_minutes || 0);
  let methods = plan.methods.map((method, index) => {
    if (method.task_key === AMETRINE_KEY) return enrichAmetrine(method, nowMs);
    return { ...method, window_priority: 50 - index };
  });

  methods = methods
    .filter(method => !available || Number(method.minutes || 0) <= available + 5)
    .sort((a, b) => Number(b.window_priority || 0) - Number(a.window_priority || 0))
    .slice(0, 3)
    .map((method, index) => ({ ...method, rank: index + 1 }));

  const recommended = methods[0] || null;
  return {
    ...plan,
    planner_kind: "gather-window-v1.5.1",
    notice: recommended?.task_key === AMETRINE_KEY
      ? "採集は、報酬量だけでなく実時間の待ち時間まで含めて順位を決めています。"
      : "時間限定ノードの待ち時間が長いので、今すぐ進められる常設採集を先にしています。",
    methods,
    now: recommended ? {
      task_key: recommended.task_key,
      daily_key: recommended.daily_key,
      title: recommended.title,
      minutes: recommended.minutes,
      reason: recommended.reason,
      condition: recommended.condition,
      steps: recommended.steps,
      repeat_count: recommended.repeat_count || 0
    } : null,
    next: methods[1] ? { title: methods[1].title, minutes: methods[1].minutes, reason: methods[1].reason } : null,
    fallback: methods[2] ? { title: methods[2].title, minutes: methods[2].minutes, reason: methods[2].reason } : plan.fallback
  };
}

async function rewritePlanResponse(response, nowMs = Date.now()) {
  if (!response.ok || !(response.headers.get("content-type") || "").includes("application/json")) return response;
  let data;
  try { data = await response.clone().json(); }
  catch { return response; }
  if (data?.plan) data.plan = updatePlan(data.plan, nowMs);
  return json(data, response.status);
}

export { updatePlan };

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const response = await app.fetch(request, env);
    if ((url.pathname === "/api/plan" && request.method === "POST") ||
        (url.pathname === "/api/state" && request.method === "GET")) {
      return rewritePlanResponse(response);
    }
    if (url.pathname === "/api/health" && request.method === "GET" && response.ok) {
      let data;
      try { data = await response.clone().json(); }
      catch { return response; }
      return json({ ...data, version: "1.5.1", gather_window_ux: true }, response.status);
    }
    return response;
  }
};

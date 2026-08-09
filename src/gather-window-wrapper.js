import app from "./measurable-motive-wrapper.js";

const AMETRINE_KEY = "gather:min81:collectable:rarefied-raw-ametrine";
const DURIUM_KEY = "gather:min81:collectable:rarefied-high-durium-ore";
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
  return {
    open,
    startMs,
    endMs,
    waitMinutes: open ? 0 : Math.max(1, Math.ceil((startMs - nowMs) / 60_000)),
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

function rewardText(level) {
  const pct = levelExpPercent(level);
  return pct == null
    ? "収集価値1000で EXP 1,110,780＋ギャザラースクリップ紫貨22"
    : `収集価値1000で EXP 1,110,780＋紫貨22（Lv${level}→次Lv必要EXPの約${pct}%）`;
}

function localizeRegularMethod(method) {
  if (method?.task_key !== DURIUM_KEY) return method;
  return {
    ...method,
    title: "サベネア島で「収集用の輝翠銀鉱」を1回採って納品する",
    reason: "いつでも採れるLv81収集品。時間限定ノードを待つ必要がなく、今すぐ経験値とギャザラースクリップ紫貨を進められるため、時限候補がプレイ枠に入らない時の通常候補にします。",
    condition: "目的：待ち時間なしで採集経験値と紫貨を確実に積む。",
    steps: [
      `${method.job_name || "採掘師"}（Lv${method.job_level || 81}）へジョブチェンジ`,
      "サベネア島「グレートワーク」へテレポ",
      "Lv85採掘ポイント（X:17.2 Y:19.2付近）へ移動",
      "「収集用の輝翠銀鉱」を収集価値1000目標で1回採集",
      "収集品取引窓口へ納品して「✓ 完了！」"
    ]
  };
}

function checklistItem(key, title, detail, timing = null, important = false) {
  return { key, title, detail, timing, important };
}

function buildTimedChecklist(methods, availableMinutes, nowMs) {
  const window = ametrineWindow(nowMs);
  const start = jstTime(window.startMs);
  const end = jstTime(window.endMs);
  const nextStart = jstTime(window.nextStartMs);
  const ametrine = methods.find(method => method.task_key === AMETRINE_KEY);
  const regular = methods.find(method => method.task_key === DURIUM_KEY);
  if (!ametrine) return null;

  const level = ametrine.job_level || 81;
  const reward = rewardText(level);
  const windowFitsSession = window.open || (window.waitMinutes + 10 <= availableMinutes + 5);
  if (!windowFitsSession) return null;

  const items = [];
  if (window.open) {
    items.push(checklistItem(
      "gather:ametrine:window",
      "今の窓で「収集用のアメトリン原石」を1回採って納品",
      `${reward}。ラヴィリンソス・プシケ送風塔（X:32.5 Y:21.2）。`,
      `JST ${start}〜${end}`,
      true
    ));
    if (regular && availableMinutes >= 30) {
      items.push(checklistItem(
        "gather:durium:after",
        "残り時間で「収集用の輝翠銀鉱」を1回採って納品",
        "サベネア島・グレートワーク付近。待ち時間なしで経験値と紫貨を追加回収。",
        "アメトリンのあと"
      ));
    }
  } else {
    if (window.waitMinutes > 15 && regular) {
      items.push(checklistItem(
        "gather:durium:before",
        "まず「収集用の輝翠銀鉱」を1回採って納品",
        "時限ノードを待つだけにしない。サベネア島・グレートワーク付近で先に経験値と紫貨を回収。",
        "今から"
      ));
    }
    items.push(checklistItem(
      "gather:ametrine:next-window",
      "「収集用のアメトリン原石」を1回採って納品",
      `${reward}。ラヴィリンソス・プシケ送風塔（X:32.5 Y:21.2）。`,
      `JST ${start}〜${end}`,
      true
    ));
  }

  return {
    title: "このプレイ枠の採集タスク",
    subtitle: window.open
      ? "時限ノードが今開いているので、先に回収します。"
      : `次の時限ノードが約${window.waitMinutes}分後に入るので、待ち時間を含めてタスク化しました。`,
    items,
    next_window_note: `今回を逃した場合、次の開始はJST ${nextStart}。`
  };
}

export function updatePlan(plan, nowMs = Date.now()) {
  if (!plan || plan.session_complete || plan.selected_mode !== "gather" || !Array.isArray(plan.methods)) return plan;
  const available = Math.max(0, Number(plan.remaining_minutes || 0));
  const methods = plan.methods.map(localizeRegularMethod);
  const checklist = buildTimedChecklist(methods, available, nowMs);

  if (!checklist) {
    const ordinary = methods
      .filter(method => method.task_key !== AMETRINE_KEY)
      .slice(0, 3)
      .map((method, index) => ({ ...method, rank: index + 1 }));
    const recommended = ordinary[0] || null;
    return {
      ...plan,
      planner_kind: "gather-efficient-v1.5.1",
      notice: "このプレイ枠に時限採集が入らないので、今すぐ進められる効率のいい採集候補を出しています。",
      gather_checklist: null,
      methods: ordinary,
      now: recommended ? { ...recommended } : null,
      next: ordinary[1] ? { title: ordinary[1].title, minutes: ordinary[1].minutes, reason: ordinary[1].reason } : null,
      fallback: ordinary[2] ? { title: ordinary[2].title, minutes: ordinary[2].minutes, reason: ordinary[2].reason } : plan.fallback
    };
  }

  return {
    ...plan,
    planner_kind: "gather-checklist-v1.5.1",
    notice: "時限採集がプレイ時間内にあるので、#1/#2ではなくチェック式の採集タスクにしました。",
    gather_checklist: checklist,
    methods,
    now: null,
    next: null
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
      return json({ ...data, version: "1.5.1", gather_checklist_planner: true }, response.status);
    }
    return response;
  }
};

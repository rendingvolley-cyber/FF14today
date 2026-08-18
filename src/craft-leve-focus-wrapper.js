import app from "./category-job-focus-wrapper.js";

// Grounded ARM leve catalog for Endwalker 80-89 and Dawntrail 90-99.
// EXP and delivery requirements are stable catalog data; market/recipe costs stay live.
const ARMORER_LEVES = [
  { level: 80, key: "armguards-maiming", item: "ハイダリウム・スレイヤーアームガード", quantity: 1, exp: 935000, location: "オールド・シャーレアン" },
  { level: 80, key: "high-durium-nugget", item: "ハイダリウムナゲット", quantity: 3, exp: 724620, location: "オールド・シャーレアン" },
  { level: 82, key: "gauntlets-fending", item: "ハイダリウム・ディフェンダーガントレット", quantity: 1, exp: 1051810, location: "オールド・シャーレアン" },
  { level: 82, key: "armor-fending", item: "ハイダリウム・ディフェンダーアーマー", quantity: 1, exp: 1582910, location: "オールド・シャーレアン" },
  { level: 84, key: "bismuth-ingot", item: "ビスマスインゴット", quantity: 3, exp: 933280, location: "オールド・シャーレアン" },
  { level: 84, key: "bismuth-alembic", item: "ビスマス・アレンビック", quantity: 1, exp: 1255600, location: "オールド・シャーレアン" },
  { level: 86, key: "falling-dragon-helm", item: "マンガン・ディセンドドラゴンヘルム", quantity: 1, exp: 1503270, location: "オールド・シャーレアン" },
  { level: 86, key: "chocobo-frypan", item: "マンガン・チョコボフライパン", quantity: 1, exp: 1443780, location: "オールド・シャーレアン" },
  { level: 88, key: "casting-gloves", item: "コンドライト・キャスターグローブ", quantity: 1, exp: 1703250, location: "オールド・シャーレアン" },
  { level: 88, key: "maiming-top", item: "コンドライト・スレイヤートップス", quantity: 1, exp: 2257300, location: "オールド・シャーレアン" },

  // Dawntrail / Tuliyollal leves. Level 91 uses the Lv90 band, 93 uses Lv92, etc.
  { level: 90, key: "mountain-chromite-ingot", item: "オルコクロマイトインゴット", quantity: 3, exp: 1440660, location: "トライヨラ" },
  { level: 90, key: "mountain-chromite-tower-shield", item: "オルコクロマイト・タワーシールド", quantity: 1, exp: 1440660, location: "トライヨラ" },
  { level: 92, key: "ruthenium-vambraces-maiming", item: "ルテニウム・スレイヤーヴァンブレイス", quantity: 1, exp: 2148720, location: "トライヨラ" },
  { level: 92, key: "ruthenium-sabatons-fending", item: "ルテニウム・ディフェンダーサバトン", quantity: 1, exp: 2148720, location: "トライヨラ" },
  { level: 94, key: "cobalt-tungsten-ingot", item: "コバルトタングステンインゴット", quantity: 3, exp: 1902430, location: "トライヨラ" },
  { level: 94, key: "cobalt-tungsten-alembic", item: "コバルトタングステン・アレンビック", quantity: 1, exp: 2454760, location: "トライヨラ" },
  { level: 96, key: "gold-titanium-caster-helm", item: "ゴールドチタン・キャスターヘルム", quantity: 1, exp: 3059520, location: "トライヨラ" },
  { level: 96, key: "gold-titanium-fending-spike-armor", item: "ゴールドチタン・ディフェンダースパイクアーマー", quantity: 1, exp: 4554260, location: "トライヨラ" },
  { level: 98, key: "ra-kaznar-scouting-gloves", item: "カザナル・スカウトグローブ", quantity: 1, exp: 3459540, location: "トライヨラ" },
  { level: 98, key: "ra-kaznar-maiming-greaves", item: "カザナル・スレイヤーグリーヴ", quantity: 1, exp: 3459540, location: "トライヨラ" }
];

function normalizeCode(value) {
  return String(value || "").trim().toUpperCase();
}

function formatNumber(value) {
  return Math.max(0, Math.round(Number(value) || 0)).toLocaleString("ja-JP");
}

function focusedJob(data) {
  const focus = data?.plan?.focus_job;
  if (focus?.code) return focus;
  const methods = Array.isArray(data?.plan?.methods) ? data.plan.methods : [];
  const row = methods.find(method => method?.job_code);
  if (!row) return null;
  return { code: row.job_code, name: row.job_name, level: row.job_level, role: row.job_role };
}

function highestEligibleBand(level) {
  const n = Math.floor(Number(level));
  if (!Number.isFinite(n) || n < 80 || n > 99) return null;
  return [98, 96, 94, 92, 90, 88, 86, 84, 82, 80].find(candidate => candidate <= n) ?? null;
}

export function armorerLeveMethods(job, availableMinutes = 60) {
  if (normalizeCode(job?.code) !== "ARM") return [];
  const band = highestEligibleBand(job?.level);
  if (band == null) return [];
  const minutesBudget = Math.max(5, Number(availableMinutes) || 60);
  return ARMORER_LEVES
    .filter(row => row.level === band)
    .map(row => ({
      task_key: `craft:arm${row.level}:leve:${row.key}`,
      badge: `リーヴ EXP ${formatNumber(row.exp)}`,
      title: `甲冑師リーヴ「${row.item}」${row.quantity}個納品`,
      minutes: Math.min(15, minutesBudget),
      reason: `甲冑師Lv${job.level}向け。基本報酬 EXP ${formatNumber(row.exp)}。完成品購入と原材料からの製作費はChocobo相場で比較します。`,
      condition: `リーヴ受注権を1消費。${row.location}で受注・納品。友好部族はログイン直後ルーチン側で扱うため、この候補には含めません。`,
      steps: [
        `甲冑師（Lv${job.level}）へジョブチェンジ`,
        `${row.location}で対象リーヴを受注`,
        `${row.item}を${row.quantity}個用意`,
        "納品して報酬を受け取る",
        "終わったら「✓ 完了！」"
      ],
      job_code: "ARM",
      job_name: job?.name || job?.name_ja || "甲冑師",
      job_level: Number(job.level),
      job_role: job?.role || "crafter",
      repeat_count: 0,
      leve_level: row.level,
      leve_allowance_cost: 1,
      leve_reward_exp: row.exp,
      leve_reward_gil: null,
      leve_location: row.location,
      delivery_item_name: row.item,
      delivery_quantity: row.quantity
    }));
}

function isSocietyFallback(method) {
  return /:society:/.test(String(method?.task_key || "")) || /友好部族/.test(String(method?.badge || ""));
}

export function replaceCraftSocietyFallback(data, { availableMinutes = 60 } = {}) {
  if (!data?.plan || String(data.plan.selected_mode || "") !== "craft") return data;
  const methods = Array.isArray(data.plan.methods) ? data.plan.methods : [];
  if (!methods.length || !methods.every(isSocietyFallback)) return data;

  const job = focusedJob(data);
  const replacement = armorerLeveMethods(job, availableMinutes);
  data.plan = {
    ...data.plan,
    methods: replacement,
    now: replacement[0] || null,
    next: replacement[1] || null,
    session_complete: replacement.length === 0,
    planner_kind: replacement.length ? "craft-leve-procurement-v1" : "craft-no-society-fallback-v1",
    notice: replacement.length
      ? "友好部族はログイン直後ルーチンに任せ、生産タブでは適正レベルのリーヴを表示します。複数選択すると必要素材と費用を合算できます。"
      : "友好部族はログイン直後ルーチン側で扱うため、生産タブの通常候補から除外しました。このジョブ帯のリーヴ候補は順次追加します。"
  };
  return data;
}

async function rewriteResponse(response, options = {}) {
  if (!response.ok || !(response.headers.get("content-type") || "").includes("application/json")) return response;
  let data;
  try { data = await response.clone().json(); }
  catch { return response; }
  const rewritten = replaceCraftSocietyFallback(data, options);
  return new Response(JSON.stringify(rewritten, null, 2), {
    status: response.status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff"
    }
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/api/state" && request.method === "GET") {
      const response = await app.fetch(request, env);
      return rewriteResponse(response, {
        availableMinutes: Number(url.searchParams.get("available_minutes")) || undefined
      });
    }
    if (url.pathname === "/api/plan" && request.method === "POST") {
      let payload = {};
      try { payload = await request.clone().json(); } catch {}
      const response = await app.fetch(request, env);
      return rewriteResponse(response, { availableMinutes: payload.available_minutes });
    }
    return app.fetch(request, env);
  }
};

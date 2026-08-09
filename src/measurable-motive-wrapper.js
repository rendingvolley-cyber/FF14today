import app from "./context-history-wrapper.js";
import { getLodestoneAchievementState } from "./lodestone-achievements.js";

const OWNER_LODESTONE_ID = "3091607";
const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash";
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
const ACHIEVEMENT_CONTEXT_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;

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

function normalizeText(value, max = 360) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

function normalizeKey(value) {
  return normalizeText(value, 500).normalize("NFKC").toLocaleLowerCase("ja-JP");
}

function nullableInt(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isInteger(n) && n >= 0 ? n : null;
}

function clampConfidence(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0;
}

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, Math.min(i + chunkSize, bytes.length)));
  }
  return btoa(binary);
}

async function sha256Hex(value) {
  const bytes = typeof value === "string" ? new TextEncoder().encode(value) : value;
  const buffer = bytes instanceof ArrayBuffer
    ? bytes
    : bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, "0")).join("");
}

async function profileHashFromRequest(request) {
  const token = request.headers.get("x-profile-token") || "";
  if (!/^[A-Za-z0-9_-]{43,128}$/.test(token)) return null;
  return sha256Hex(token);
}

function achievementSchema() {
  return {
    type: "object",
    additionalProperties: false,
    properties: {
      recognized: { type: "boolean" },
      confidence: { type: "number", minimum: 0, maximum: 1 },
      entries: {
        type: "array",
        maxItems: 30,
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            name: { type: "string" },
            current: { type: ["integer", "null"] },
            target: { type: ["integer", "null"] },
            objective: { type: ["string", "null"] },
            reward_title: { type: ["string", "null"] },
            reward_text: { type: ["string", "null"] },
            category: { type: ["string", "null"] },
            confidence: { type: "number", minimum: 0, maximum: 1 }
          },
          required: ["name", "current", "target", "objective", "reward_title", "reward_text", "category", "confidence"]
        }
      }
    },
    required: ["recognized", "confidence", "entries"]
  };
}

function sanitizeAchievementAnalysis(parsed, model) {
  const entries = (Array.isArray(parsed?.entries) ? parsed.entries : [])
    .slice(0, 30)
    .map(entry => ({
      name: normalizeText(entry?.name, 180),
      current: nullableInt(entry?.current),
      target: nullableInt(entry?.target),
      objective: entry?.objective == null ? null : normalizeText(entry.objective, 360),
      reward_title: entry?.reward_title == null ? null : normalizeText(entry.reward_title, 120),
      reward_text: entry?.reward_text == null ? null : normalizeText(entry.reward_text, 180),
      category: entry?.category == null ? null : normalizeText(entry.category, 120),
      confidence: clampConfidence(entry?.confidence)
    }))
    .filter(entry => entry.name && entry.confidence >= 0.55);

  const recognized = Boolean(parsed?.recognized) && entries.length > 0;
  return {
    page_type: recognized ? "achievement_progress" : "unknown",
    confidence: clampConfidence(parsed?.confidence),
    model,
    achievement_entries: entries,
    journal_entries: [],
    crafter_stats: null,
    gatherer_stats: null
  };
}

async function analyzeAchievementProgressImage(file, bytes, env) {
  if (!env.GEMINI_API_KEY) return null;
  const model = env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL;
  const prompt = [
    "FINAL FANTASY XIV日本語クライアントのスクリーンショットが、ゲーム内アチーブメント進捗画面かだけを判定してください。",
    "アチーブメント画面でない場合は recognized=false、entries=[] を返してください。",
    "画面に見えている事実だけを抽出し、推測や攻略知識で補完しないでください。",
    "各行について name=アチーブメント名、current/target=7/10のように途中進捗が明示されている場合だけ数値を入れます。見えなければnullです。",
    "objective=条件説明、reward_title=報酬称号、reward_text=その他の報酬表示、category=画面上のカテゴリ。見えない項目はnullです。",
    "途中進捗の current/target は特に重要です。画像にない数字を絶対に作らないでください。"
  ].join("\n");

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-goog-api-key": env.GEMINI_API_KEY
      },
      body: JSON.stringify({
        contents: [{
          role: "user",
          parts: [
            { text: prompt },
            { inline_data: { mime_type: file.type, data: arrayBufferToBase64(bytes) } }
          ]
        }],
        generationConfig: {
          temperature: 0.05,
          responseMimeType: "application/json",
          responseJsonSchema: achievementSchema()
        }
      })
    }
  );
  const data = await response.json();
  if (!response.ok) return null;
  const text = (data?.candidates?.[0]?.content?.parts || [])
    .map(part => typeof part.text === "string" ? part.text : "")
    .join("")
    .trim();
  if (!text) return null;
  let parsed;
  try { parsed = JSON.parse(text); }
  catch { return null; }
  return sanitizeAchievementAnalysis(parsed, model);
}

async function ensureHistorySchema(env) {
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS decision_context_history (
      snapshot_key TEXT PRIMARY KEY,
      profile_hash TEXT NOT NULL,
      context_type TEXT NOT NULL,
      subject_key TEXT NOT NULL DEFAULT '',
      payload_json TEXT NOT NULL,
      confidence REAL NOT NULL,
      observed_at TEXT NOT NULL,
      image_sha256 TEXT,
      source TEXT NOT NULL DEFAULT 'clipboard_image'
    )
  `).run();
}

async function cachedAchievementAnalysis(env, profileHash, imageSha) {
  await ensureHistorySchema(env);
  const row = await env.DB.prepare(`
    SELECT payload_json
    FROM decision_context_history
    WHERE profile_hash=? AND context_type='achievement_progress' AND image_sha256=?
    ORDER BY observed_at DESC
    LIMIT 1
  `).bind(profileHash, imageSha).first();
  if (!row?.payload_json) return null;
  try { return JSON.parse(row.payload_json); }
  catch { return null; }
}

async function storeAchievementAnalysis(env, profileHash, imageSha, analysis) {
  if (!profileHash || !analysis || analysis.page_type !== "achievement_progress" || analysis.confidence < 0.6) return false;
  const observedAt = new Date().toISOString();
  const payload = {
    page_type: "achievement_progress",
    achievement_entries: analysis.achievement_entries,
    journal_entries: [],
    crafter_stats: null,
    gatherer_stats: null,
    model: analysis.model
  };
  await env.DB.prepare(`
    INSERT INTO decision_context (profile_hash, context_type, payload_json, confidence, observed_at, source)
    VALUES (?, 'achievement_progress', ?, ?, ?, 'clipboard_image')
    ON CONFLICT(profile_hash, context_type) DO UPDATE SET
      payload_json=excluded.payload_json,
      confidence=excluded.confidence,
      observed_at=excluded.observed_at,
      source=excluded.source
  `).bind(profileHash, JSON.stringify(payload), analysis.confidence, observedAt).run();
  await ensureHistorySchema(env);
  const snapshotKey = `${profileHash}:${imageSha}:achievement_progress`;
  await env.DB.prepare(`
    INSERT OR IGNORE INTO decision_context_history (
      snapshot_key, profile_hash, context_type, subject_key, payload_json,
      confidence, observed_at, image_sha256, source
    ) VALUES (?, ?, 'achievement_progress', 'achievement_progress', ?, ?, ?, ?, 'clipboard_image')
  `).bind(
    snapshotKey,
    profileHash,
    JSON.stringify(analysis),
    analysis.confidence,
    observedAt,
    imageSha
  ).run();
  return true;
}

async function fallbackAchievementImage(request, response, env) {
  if (!response.ok || !(response.headers.get("content-type") || "").includes("application/json")) return response;
  let data;
  try { data = await response.clone().json(); }
  catch { return response; }
  if (data?.analysis?.page_type !== "unknown") return response;

  const profileHash = await profileHashFromRequest(request);
  if (!profileHash) return response;
  let form;
  try { form = await request.formData(); }
  catch { return response; }
  const file = form.get("image");
  if (!(file instanceof File) || !ALLOWED_IMAGE_TYPES.has(file.type) || file.size <= 0 || file.size > MAX_IMAGE_BYTES) return response;
  const bytes = await file.arrayBuffer();
  const imageSha = await sha256Hex(bytes);
  const cached = await cachedAchievementAnalysis(env, profileHash, imageSha);
  if (cached?.page_type === "achievement_progress") {
    await storeAchievementAnalysis(env, profileHash, imageSha, cached);
    return json({
      ...data,
      duplicate: true,
      analysis: cached,
      context_saved: true,
      context_history_saved: true,
      persistence: "history"
    }, response.status);
  }

  const analysis = await analyzeAchievementProgressImage(file, bytes, env);
  if (!analysis || analysis.page_type !== "achievement_progress") return response;
  const saved = await storeAchievementAnalysis(env, profileHash, imageSha, analysis);
  return json({
    ...data,
    duplicate: false,
    analysis,
    context_saved: saved,
    context_history_saved: saved,
    persistence: "history"
  }, response.status);
}

function achievementText(entry) {
  return normalizeKey([
    entry?.name,
    entry?.objective,
    entry?.category,
    entry?.reward_title,
    entry?.reward_text
  ].filter(Boolean).join(" "));
}

function validProgress(entry) {
  const current = Number(entry?.current);
  const target = Number(entry?.target);
  return Number.isInteger(current) && current >= 0 && Number.isInteger(target) && target > 0 && current < target;
}

function progressSummary(entry) {
  if (!validProgress(entry)) return null;
  const current = Number(entry.current);
  const target = Number(entry.target);
  const after = Math.min(target, current + 1);
  return {
    current,
    target,
    beforeRemaining: target - current,
    after,
    afterRemaining: Math.max(0, target - after),
    percent: Math.round((current / target) * 100)
  };
}

function findProgressEntry(entries, kind) {
  const list = Array.isArray(entries) ? entries : [];
  const scored = list.map(entry => {
    const text = achievementText(entry);
    let score = 0;
    if (kind === "gate") {
      if (text.includes("g.a.t.e") || text.includes("gate")) score += 6;
      if (text.includes("フンガー") || text.includes("ジャンピング") || text.includes("エアフォース") || text.includes("斬魔")) score += 5;
      if (text.includes("ゴールドソーサー")) score += 2;
    }
    if (kind === "ocean") {
      if (text.includes("オーシャンフィッシング")) score += 8;
      if (text.includes("オーシャンフィッシャー") || text.includes("世界を釣る者")) score += 6;
    }
    if (validProgress(entry)) score += 5;
    score += Number(entry?.confidence || 0);
    return { entry, score };
  }).filter(item => item.score > 0).sort((a, b) => b.score - a.score);
  return scored[0]?.entry || null;
}

function gateTargetLabel(entry) {
  const text = achievementText(entry);
  if (text.includes("フンガー")) return "G.A.T.E.「暴風！ はないきフンガー」";
  if (text.includes("エアフォース")) return "G.A.T.E.「出撃！ エアフォースパイロット」";
  if (text.includes("ジャンピング")) return "G.A.T.E.「挑戦！ ジャンピングアスレチック」";
  if (text.includes("斬魔")) return "G.A.T.E.「一閃！ 斬魔・デ・三昧」";
  return "対象のG.A.T.E.";
}

function enrichGateWithProgress(method, entry) {
  const progress = progressSummary(entry);
  if (!progress) return { ...method, motive_score: 10, measurable_motive: false };
  const target = gateTargetLabel(entry);
  const titleReward = entry.reward_title ? ` 報酬称号は「${entry.reward_title}」。` : "";
  return {
    ...method,
    badge: `残り${progress.beforeRemaining}回・${entry.name}`,
    title: `${target}を1回成功させる`,
    reason: `貼り付けたアチーブメント進捗は「${entry.name}」${progress.current}/${progress.target}（${progress.percent}%）。今回1回成功すれば${progress.after}/${progress.target}になり、残り${progress.afterRemaining}回。${titleReward}`.trim(),
    condition: `目的：${entry.name}を具体的に1回進める。残り回数が見えているため、単なる息抜きではなく到達目標のある寄り道。`,
    steps: [
      "ゴールドソーサーへ移動",
      `イベント案内で${target}の開催を確認`,
      `対象なら1回参加して成功を狙う`,
      "対象でなければ別の候補へ切り替える",
      "進捗したら「✓ 完了！」"
    ],
    motive_score: 100,
    measurable_motive: true,
    progress_metric: `${progress.current}/${progress.target} → ${progress.after}/${progress.target}`
  };
}

function enrichOceanWithProgress(method, entry) {
  const progress = progressSummary(entry);
  if (!progress) return { ...method, motive_score: 35, measurable_motive: false };
  const titleReward = entry.reward_title ? ` 報酬称号は「${entry.reward_title}」。` : "";
  return {
    ...method,
    badge: `残り${progress.beforeRemaining}・${entry.name}`,
    reason: `貼り付けたアチーブメント進捗は「${entry.name}」${progress.current}/${progress.target}（${progress.percent}%）。1航海で条件を1回進められる種類なら、達成時は${progress.after}/${progress.target}、残り${progress.afterRemaining}。${titleReward} 漁師Lv50〜99はオーシャンフィッシングで経験値も獲得対象。`,
    condition: `目的：オーシャンフィッシングを、経験値だけでなく「${entry.name}」の進捗にも変える。経験値の1航海あたり%は未計測なので推測値は表示しない。`,
    motive_score: 95,
    measurable_motive: true,
    progress_metric: `${progress.current}/${progress.target} → 最大${progress.after}/${progress.target}`
  };
}

function completedNames(achievementState) {
  return new Set((achievementState?.history || []).map(item => normalizeKey(item?.name)));
}

function oceanBaseline(method, completedSet) {
  const level = Number(method?.job_level);
  const expText = level >= 50 && level <= 99
    ? `漁師Lv${level}は公式上、オーシャンフィッシングで経験値＋ギャザラースクリップ紫貨の報酬対象。`
    : "";
  const rank3 = normalizeKey("オーシャンフィッシャー：ランク3");
  const rank4 = normalizeKey("オーシャンフィッシャー：ランク4");
  if (!completedSet.has(rank3)) {
    return {
      ...method,
      badge: "未達称号・16,000点目標",
      title: `${method.job_name || "漁師"}でオーシャンフィッシング16,000点を狙う`,
      reason: `公開Lodestone上では「オーシャンフィッシャー：ランク3」が未達。公式条件は近海で1航海16,000点以上、報酬称号は「Ocean Fisher」。${expText}1航海あたりの経験値%は実測データ未蓄積なので、まだ数字を作らない。`,
      condition: "目的：1航海を『なんとなく釣る』ではなく、16,000点の称号条件＋レベリングの両取りにする。",
      motive_score: 75,
      measurable_motive: true,
      progress_metric: "1航海 16,000点目標"
    };
  }
  if (!completedSet.has(rank4)) {
    return {
      ...method,
      badge: "未達称号・20,000点目標",
      title: `${method.job_name || "漁師"}でオーシャンフィッシング20,000点を狙う`,
      reason: `公開Lodestone上では「オーシャンフィッシャー：ランク4」が未達。公式条件は近海で1航海20,000点以上、報酬称号は「Master of the Sea」。${expText}1航海あたりの経験値%は実測値を貯めてから出す。`,
      condition: "目的：1航海で称号条件20,000点を狙いながら、レベル100未満なら経験値も回収する。",
      motive_score: 70,
      measurable_motive: true,
      progress_metric: "1航海 20,000点目標"
    };
  }
  return {
    ...method,
    reason: `${expText || method.reason} ただし、称号進捗や1航海あたりの経験値期待値がまだ数値化できていないため、定量候補より優先度を下げます。`,
    motive_score: expText ? 35 : 5,
    measurable_motive: false
  };
}

function gateBaseline(method, completedSet) {
  const fungah = normalizeKey("フンガー！：ランク3");
  if (!completedSet.has(fungah)) {
    return {
      ...method,
      badge: "未達称号・途中回数は未取得",
      title: "G.A.T.E.「暴風！ はないきフンガー」を1回狙う",
      reason: "公開Lodestone上では「フンガー！：ランク3」が未達。公式条件は累計10回コンプリート、報酬称号は「the Fungah」。ただし公開Lodestoneでは途中の成功回数が取れないため、残り回数が分かるまでは#1候補にしません。アチーブメント進捗画面を貼ると残り回数を確定できます。",
      condition: "目的：称号へつながるG.A.T.E.だけを狙う。途中回数が不明な状態では、他の定量候補を優先する。",
      steps: [
        "ゴールドソーサーへ移動",
        "イベント案内で「暴風！ はないきフンガー」の開催を確認",
        "開催中なら1回成功を狙う",
        "開催していなければ別候補へ切り替える"
      ],
      motive_score: 25,
      measurable_motive: false
    };
  }
  return {
    ...method,
    reason: "称号や進捗への直結を現在確認できていないため、『息抜き』だけを理由に上位へは出しません。",
    motive_score: 0,
    measurable_motive: false
  };
}

export function applyMeasurableMotives(plan, achievementContext, achievementState) {
  if (!plan || plan.session_complete || plan.selected_mode !== "discover" || !Array.isArray(plan.methods)) return plan;
  const entries = achievementContext?.achievement_entries || [];
  const completedSet = completedNames(achievementState);
  let methods = plan.methods.map((method, index) => {
    let next = { ...method, motive_score: 10 - index, measurable_motive: false };
    if (method.task_key === "discover:gold-saucer-gate") {
      const progress = findProgressEntry(entries, "gate");
      next = progress ? enrichGateWithProgress(method, progress) : gateBaseline(method, completedSet);
    }
    if (method.task_key === "discover:ocean-fishing") {
      const progress = findProgressEntry(entries, "ocean");
      next = progress ? enrichOceanWithProgress(method, progress) : oceanBaseline(method, completedSet);
    }
    return next;
  });
  methods.sort((a, b) => (Number(b.motive_score || 0) - Number(a.motive_score || 0)) || (Number(a.rank || 99) - Number(b.rank || 99)));
  methods = methods.slice(0, 3).map((method, index) => ({ ...method, rank: index + 1 }));
  const recommended = methods[0] || null;
  return {
    ...plan,
    planner_kind: "measurable-motive-v1.5",
    notice: recommended?.measurable_motive
      ? "発見枠でも、称号・アチーブメント・経験値など『何がどれだけ進むか』を優先しています。"
      : "定量的な進捗を確認できる候補が少ないため、途中進捗のスクショを貼ると推薦精度が上がります。",
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

async function loadAchievementContext(env, request) {
  const profileHash = await profileHashFromRequest(request);
  if (!profileHash) return null;
  const row = await env.DB.prepare(`
    SELECT payload_json, confidence, observed_at
    FROM decision_context
    WHERE profile_hash=? AND context_type='achievement_progress'
    LIMIT 1
  `).bind(profileHash).first();
  if (!row?.payload_json) return null;
  const observed = new Date(row.observed_at).getTime();
  if (!Number.isFinite(observed) || Date.now() - observed > ACHIEVEMENT_CONTEXT_MAX_AGE_MS) return null;
  try {
    return {
      ...JSON.parse(row.payload_json),
      confidence: Number(row.confidence || 0),
      observed_at: row.observed_at
    };
  } catch {
    return null;
  }
}

async function rewritePlanWithMotives(request, response, env) {
  if (!response.ok || !(response.headers.get("content-type") || "").includes("application/json")) return response;
  let data;
  try { data = await response.clone().json(); }
  catch { return response; }
  if (!data?.plan || data.plan.selected_mode !== "discover") return response;
  const [context, achievementState] = await Promise.all([
    loadAchievementContext(env, request),
    getLodestoneAchievementState(env, OWNER_LODESTONE_ID)
  ]);
  data.plan = applyMeasurableMotives(data.plan, context, achievementState);
  return json(data, response.status);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/api/context/image" && request.method === "POST") {
      const delegated = request.clone();
      const response = await app.fetch(delegated, env);
      return fallbackAchievementImage(request, response, env);
    }
    if (url.pathname === "/api/plan" && request.method === "POST") {
      const response = await app.fetch(request.clone(), env);
      return rewritePlanWithMotives(request, response, env);
    }
    if (url.pathname === "/api/health") {
      const response = await app.fetch(request, env);
      if (!response.ok || !(response.headers.get("content-type") || "").includes("application/json")) return response;
      let data;
      try { data = await response.json(); }
      catch { return response; }
      return json({ ...data, version: "1.5.0", measurable_motives: true, achievement_progress_context: true });
    }
    return app.fetch(request, env);
  }
};

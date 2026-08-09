const APP_VERSION = "0.3.0";
const PARSER_VERSION = "lodestone-v0.3";
const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash";
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_SCREENSHOT_ANALYSES_PER_PROFILE_PER_DAY = 10;
const LODESTONE_CACHE_MS = 15 * 60 * 1000;

const ALLOWED_LODESTONE_HOSTS = new Set([
  "na.finalfantasyxiv.com",
  "eu.finalfantasyxiv.com",
  "jp.finalfantasyxiv.com",
  "fr.finalfantasyxiv.com",
  "de.finalfantasyxiv.com"
]);

const JOBS = [
  ["PLD", "Paladin", "ナイト", "tank"], ["WAR", "Warrior", "戦士", "tank"],
  ["DRK", "Dark Knight", "暗黒騎士", "tank"], ["GNB", "Gunbreaker", "ガンブレイカー", "tank"],
  ["WHM", "White Mage", "白魔道士", "healer"], ["SCH", "Scholar", "学者", "healer"],
  ["AST", "Astrologian", "占星術師", "healer"], ["SGE", "Sage", "賢者", "healer"],
  ["MNK", "Monk", "モンク", "melee"], ["DRG", "Dragoon", "竜騎士", "melee"],
  ["NIN", "Ninja", "忍者", "melee"], ["SAM", "Samurai", "侍", "melee"],
  ["RPR", "Reaper", "リーパー", "melee"], ["VPR", "Viper", "ヴァイパー", "melee"],
  ["BST", "Beastmaster", "魔獣使い", "limited"], ["BRD", "Bard", "吟遊詩人", "ranged"],
  ["MCH", "Machinist", "機工士", "ranged"], ["DNC", "Dancer", "踊り子", "ranged"],
  ["BLM", "Black Mage", "黒魔道士", "caster"], ["SMN", "Summoner", "召喚士", "caster"],
  ["RDM", "Red Mage", "赤魔道士", "caster"], ["PCT", "Pictomancer", "ピクトマンサー", "caster"],
  ["BLU", "Blue Mage", "青魔道士", "limited"], ["CRP", "Carpenter", "木工師", "crafter"],
  ["BSM", "Blacksmith", "鍛冶師", "crafter"], ["ARM", "Armorer", "甲冑師", "crafter"],
  ["GSM", "Goldsmith", "彫金師", "crafter"], ["LTW", "Leatherworker", "革細工師", "crafter"],
  ["WVR", "Weaver", "裁縫師", "crafter"], ["ALC", "Alchemist", "錬金術師", "crafter"],
  ["CUL", "Culinarian", "調理師", "crafter"], ["MIN", "Miner", "採掘師", "gatherer"],
  ["BTN", "Botanist", "園芸師", "gatherer"], ["FSH", "Fisher", "漁師", "gatherer"]
];

let privateSchemaReady = null;

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

function normalizeText(value) { return String(value ?? "").replace(/\s+/g, " ").trim(); }

function parseLodestoneId(value) {
  if (!value) return null;
  if (/^\d+$/.test(String(value))) return String(value);
  try {
    const url = new URL(value);
    const match = url.pathname.match(/\/lodestone\/character\/(\d+)\//);
    return match ? match[1] : null;
  } catch { return null; }
}

function parseSafeLodestoneUrl(value) {
  try {
    const url = new URL(String(value || "").trim());
    if (url.protocol !== "https:") return null;
    if (!ALLOWED_LODESTONE_HOSTS.has(url.hostname)) return null;
    const match = url.pathname.match(/^\/lodestone\/character\/(\d+)\//);
    if (!match) return null;
    return { lodestone_id: match[1], canonical: `${url.origin}/lodestone/character/${match[1]}/` };
  } catch { return null; }
}

function normalizeAchievementName(value) { return normalizeText(value).normalize("NFKC").toLocaleLowerCase("ja-JP"); }
function clampConfidence(value) { const n = Number(value); return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0; }
function nullableInt(value) { if (value === null || value === undefined || value === "") return null; const n = Number(value); return Number.isInteger(n) ? n : null; }
function nullableBool(value) { return typeof value === "boolean" ? value : null; }
function hexFromBuffer(buffer) { return [...new Uint8Array(buffer)].map(x => x.toString(16).padStart(2, "0")).join(""); }

async function sha256Hex(value) {
  const bytes = typeof value === "string" ? new TextEncoder().encode(value) : value;
  const buffer = bytes instanceof ArrayBuffer ? bytes : bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  return hexFromBuffer(await crypto.subtle.digest("SHA-256", buffer));
}

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += chunkSize) binary += String.fromCharCode(...bytes.subarray(i, Math.min(i + chunkSize, bytes.length)));
  return btoa(binary);
}

async function ensurePrivateSchema(env) {
  if (!privateSchemaReady) {
    const statements = [
      `CREATE TABLE IF NOT EXISTS anonymous_profiles (profile_hash TEXT PRIMARY KEY, created_at TEXT NOT NULL, last_seen_at TEXT NOT NULL)`,
      `CREATE TABLE IF NOT EXISTS profile_characters (profile_hash TEXT NOT NULL, lodestone_id TEXT NOT NULL, linked_at TEXT NOT NULL, last_seen_at TEXT NOT NULL, PRIMARY KEY (profile_hash, lodestone_id))`,
      `CREATE TABLE IF NOT EXISTS user_preferences_private (profile_hash TEXT NOT NULL, lodestone_id TEXT NOT NULL, available_minutes INTEGER NOT NULL DEFAULT 60, energy INTEGER NOT NULL DEFAULT 2, updated_at TEXT NOT NULL, PRIMARY KEY (profile_hash, lodestone_id))`,
      `CREATE TABLE IF NOT EXISTS daily_plans_private (profile_hash TEXT NOT NULL, lodestone_id TEXT NOT NULL, plan_date TEXT NOT NULL, generated_at TEXT NOT NULL, available_minutes INTEGER NOT NULL, energy INTEGER NOT NULL, planner_kind TEXT NOT NULL, plan_json TEXT NOT NULL, PRIMARY KEY (profile_hash, lodestone_id, plan_date))`,
      `CREATE TABLE IF NOT EXISTS progress_facts_private (profile_hash TEXT NOT NULL, lodestone_id TEXT NOT NULL, fact_key TEXT NOT NULL, fact_value TEXT NOT NULL, source TEXT NOT NULL, confidence REAL NOT NULL DEFAULT 1.0, observed_at TEXT NOT NULL, PRIMARY KEY (profile_hash, lodestone_id, fact_key))`,
      `CREATE TABLE IF NOT EXISTS screenshot_imports (import_id TEXT PRIMARY KEY, profile_hash TEXT NOT NULL, lodestone_id TEXT NOT NULL, filename TEXT, mime_type TEXT NOT NULL, image_sha256 TEXT NOT NULL, status TEXT NOT NULL, model_id TEXT NOT NULL, page_type TEXT, category TEXT, created_at TEXT NOT NULL, confirmed_at TEXT)`,
      `CREATE INDEX IF NOT EXISTS idx_screenshot_import_dedupe ON screenshot_imports(profile_hash, lodestone_id, image_sha256)`,
      `CREATE TABLE IF NOT EXISTS screenshot_candidates (candidate_id TEXT PRIMARY KEY, import_id TEXT NOT NULL, achievement_name TEXT NOT NULL, current_value INTEGER, target_value INTEGER, completed INTEGER, confidence REAL NOT NULL, visible_progress_text TEXT, decision TEXT NOT NULL DEFAULT 'pending')`,
      `CREATE INDEX IF NOT EXISTS idx_screenshot_candidates_import ON screenshot_candidates(import_id)`,
      `CREATE TABLE IF NOT EXISTS api_usage_daily (profile_hash TEXT NOT NULL, usage_date TEXT NOT NULL, screenshot_analyses INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (profile_hash, usage_date))`
    ];
    privateSchemaReady = env.DB.batch(statements.map(sql => env.DB.prepare(sql))).catch(error => { privateSchemaReady = null; throw error; });
  }
  return privateSchemaReady;
}

async function requireProfile(request, env) {
  await ensurePrivateSchema(env);
  const token = request.headers.get("x-profile-token") || "";
  if (!/^[A-Za-z0-9_-]{43,128}$/.test(token)) {
    const error = new Error("匿名プロフィールがありません。ページを再読み込みしてください。"); error.status = 401; throw error;
  }
  const profileHash = await sha256Hex(new TextEncoder().encode(token));
  const now = new Date().toISOString();
  await env.DB.prepare(`INSERT INTO anonymous_profiles (profile_hash, created_at, last_seen_at) VALUES (?, ?, ?) ON CONFLICT(profile_hash) DO UPDATE SET last_seen_at=excluded.last_seen_at`).bind(profileHash, now, now).run();
  return profileHash;
}

async function requireAiAccess(request, env) {
  if (!env.GEMINI_API_KEY) { const error = new Error("Gemini APIキーがCloudflare Secretに未設定です。"); error.status = 503; throw error; }
  if (!env.AI_ACCESS_CODE) { const error = new Error("AI_ACCESS_CODEがCloudflare Secretに未設定です。"); error.status = 503; throw error; }
  const provided = request.headers.get("x-ai-access-code") || "";
  const [providedHash, expectedHash] = await Promise.all([
    sha256Hex(new TextEncoder().encode(provided)), sha256Hex(new TextEncoder().encode(env.AI_ACCESS_CODE))
  ]);
  if (!provided || providedHash !== expectedHash) { const error = new Error("AIアクセスコードが違います。"); error.status = 403; throw error; }
}

async function linkProfileCharacter(env, profileHash, lodestoneId) {
  const now = new Date().toISOString();
  await env.DB.prepare(`INSERT INTO profile_characters (profile_hash, lodestone_id, linked_at, last_seen_at) VALUES (?, ?, ?, ?) ON CONFLICT(profile_hash, lodestone_id) DO UPDATE SET last_seen_at=excluded.last_seen_at`).bind(profileHash, lodestoneId, now, now).run();
}

async function isProfileCharacterLinked(env, profileHash, lodestoneId) {
  const row = await env.DB.prepare(`SELECT 1 AS ok FROM profile_characters WHERE profile_hash=? AND lodestone_id=? LIMIT 1`).bind(profileHash, lodestoneId).first();
  return Boolean(row);
}

async function collectSelectorText(response, selector) {
  const values = []; let current = null;
  class Handler { element() { current = []; values.push(current); } text(text) { if (current) current.push(text.text); } }
  await new HTMLRewriter().on(selector, new Handler()).transform(response).arrayBuffer();
  return values.map(parts => normalizeText(parts.join("")));
}

async function fetchLodestone(rawUrl) {
  const safe = parseSafeLodestoneUrl(rawUrl);
  if (!safe) throw new Error("許可されたLodestoneキャラクターURLではありません。");
  const canonical = safe.canonical;
  const classJobUrl = `${canonical}class_job/`;
  const headers = { "accept-language": "en-US,en;q=0.9", "user-agent": `FF14-Today/${APP_VERSION} personal-progress-sync` };
  const [profileResponse, jobResponse] = await Promise.all([fetch(canonical, { headers }), fetch(classJobUrl, { headers })]);
  if (!profileResponse.ok) throw new Error(`Lodestone profile HTTP ${profileResponse.status}`);
  if (!jobResponse.ok) throw new Error(`Lodestone class/job HTTP ${jobResponse.status}`);
  const [names, worlds, levels] = await Promise.all([
    collectSelectorText(profileResponse.clone(), ".frame__chara__name"),
    collectSelectorText(profileResponse.clone(), ".frame__chara__world"),
    collectSelectorText(jobResponse.clone(), ".character__job__level")
  ]);
  const name = normalizeText(names[0]); const worldRaw = normalizeText(worlds[0]);
  if (!name || !worldRaw) throw new Error("Lodestone profile parser failed: name/world not found.");
  if (levels.length < JOBS.length) throw new Error(`Lodestone job parser failed: expected >= ${JOBS.length} levels, got ${levels.length}.`);
  const worldMatch = worldRaw.match(/^(.+?)\s*\[([^\]]+)\]/);
  const world = worldMatch ? normalizeText(worldMatch[1]) : worldRaw;
  const dataCenter = worldMatch ? normalizeText(worldMatch[2]) : null;
  const jobs = JOBS.map((meta, index) => {
    const raw = normalizeText(levels[index]); const level = raw === "-" ? null : Number.parseInt(raw, 10);
    return { code: meta[0], name_en: meta[1], name_ja: meta[2], role: meta[3], level: Number.isFinite(level) ? level : null };
  });
  return { lodestone_id: safe.lodestone_id, lodestone_url: canonical, name, world, data_center: dataCenter, jobs, bozja_rank: null, synced_at: new Date().toISOString(), parser_version: PARSER_VERSION };
}

async function saveCharacter(env, state) {
  await env.DB.prepare(`INSERT INTO character_state (lodestone_id, lodestone_url, name, world, data_center, jobs_json, bozja_rank, synced_at, parser_version) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(lodestone_id) DO UPDATE SET lodestone_url=excluded.lodestone_url, name=excluded.name, world=excluded.world, data_center=excluded.data_center, jobs_json=excluded.jobs_json, bozja_rank=excluded.bozja_rank, synced_at=excluded.synced_at, parser_version=excluded.parser_version`).bind(state.lodestone_id, state.lodestone_url, state.name, state.world, state.data_center, JSON.stringify(state.jobs), state.bozja_rank, state.synced_at, state.parser_version).run();
}

async function getCharacter(env, lodestoneId) {
  if (!lodestoneId) return null;
  const row = await env.DB.prepare(`SELECT * FROM character_state WHERE lodestone_id=? LIMIT 1`).bind(lodestoneId).first();
  if (!row) return null;
  return { lodestone_id: row.lodestone_id, lodestone_url: row.lodestone_url, name: row.name, world: row.world, data_center: row.data_center, jobs: JSON.parse(row.jobs_json), bozja_rank: row.bozja_rank, synced_at: row.synced_at, parser_version: row.parser_version };
}

function isFreshCharacter(character) {
  if (!character?.synced_at) return false;
  const age = Date.now() - new Date(character.synced_at).getTime();
  return Number.isFinite(age) && age >= 0 && age < LODESTONE_CACHE_MS;
}

function buildRulePlan(character, availableMinutes, energy) {
  const eligible = character.jobs.filter(j => j.level !== null && j.level < 100 && j.role !== "limited").sort((a, b) => (b.level - a.level) || a.code.localeCompare(b.code));
  const primary = eligible[0] ?? character.jobs.find(j => j.code === "WAR"); const secondary = eligible[1] ?? null;
  let mainMinutes = Math.min(availableMinutes, energy <= 1 ? 15 : energy === 2 ? 25 : 35); if (availableMinutes <= 15) mainMinutes = availableMinutes;
  const reason = primary?.level < 100 ? `現在Lv${primary.level}。Lodestoneで確認できる未カンストJobから暫定選択。` : "戦闘用のカンストJobを使って、未整理の進捗確認を優先。";
  return {
    planner_kind: "rule-v0.3",
    notice: "暫定ルールベース。実績SSは進捗DBへ取込可能。具体的な実績攻略・Big Fish・期限情報・Gemini Plannerは次段階。",
    now: {
      title: primary?.level < 100 ? `${primary.name_ja}を${mainMinutes}分だけ進める` : "進捗情報を1件追加する",
      minutes: mainMinutes, reason,
      steps: primary?.level < 100 ? [`${primary.name_ja}（Lv${primary.level}）へ変更`, `${mainMinutes}分だけレベル上げを進める`, "時間になったら途中でも終了"] : ["下の「精度UP」カードに表示された実績ページを開く", "スクリーンショットを1枚取り込む"]
    },
    next: secondary && availableMinutes >= 45 ? { title: `${secondary.name_ja}は余力がある時だけ`, minutes: Math.min(20, Math.max(10, availableMinutes - mainMinutes)), reason: `Lv${secondary.level}。今日はメイン完了後のみ。` } : null,
    fallback: { title: "Lodestone同期だけして終了", minutes: 2, reason: "気力がない日は情報更新だけでも次回の判断材料になる。" },
    skip_today: ["全ジョブ一覧を眺めて次を自分で決める", "実績一覧を最初から全部確認する", "複数カテゴリを同時に始める"]
  };
}

function buildEvidenceRequest(count) {
  if (count === 0) return { kind: "achievement_screenshot", title: "実績 → バトル", reason: "まず戦闘系の進捗を1ページだけ把握したいです。", instructions: ["FF14で「実績」画面を開く", "「バトル」カテゴリを表示する", "実績名と進捗数字が読める状態で1枚撮る", "1枚に収まらなければ、次のSSは2〜3行重ねて撮る"] };
  if (count < 15) return { kind: "achievement_screenshot", title: "実績 → 製作・採集", reason: "戦闘以外の長期進捗も少し把握すると、日替わり提案が偏りにくくなります。", instructions: ["FF14で「実績」画面を開く", "「製作・採集」カテゴリを表示する", "実績名と進捗数字が読める状態で1枚撮る"] };
  return { kind: "achievement_screenshot", title: "実績 → 探索", reason: "次は探索系を少し埋めると、短時間タスクの候補を増やせます。", instructions: ["FF14で「実績」画面を開く", "「探索」カテゴリを表示する", "実績名と進捗数字が読める状態で1枚撮る"] };
}

async function getProgressSummary(env, profileHash, lodestoneId) {
  const row = await env.DB.prepare(`SELECT COUNT(*) AS count FROM progress_facts_private WHERE profile_hash=? AND lodestone_id=? AND fact_key LIKE 'achievement:%'`).bind(profileHash, lodestoneId).first();
  const count = Number(row?.count || 0);
  return { achievement_facts: count, evidence_request: buildEvidenceRequest(count) };
}

async function apiState(request, env) {
  const profileHash = await requireProfile(request, env);
  const url = new URL(request.url); const lodestoneId = parseLodestoneId(url.searchParams.get("lodestone_id"));
  if (!lodestoneId) return json({ character: null, preferences: { available_minutes: 60, energy: 2 }, plan: null, progress_summary: null });
  const [character, prefs, progressSummary] = await Promise.all([
    getCharacter(env, lodestoneId),
    env.DB.prepare(`SELECT available_minutes, energy, updated_at FROM user_preferences_private WHERE profile_hash=? AND lodestone_id=?`).bind(profileHash, lodestoneId).first(),
    getProgressSummary(env, profileHash, lodestoneId)
  ]);
  const today = new Date().toISOString().slice(0, 10);
  const planRow = await env.DB.prepare(`SELECT * FROM daily_plans_private WHERE profile_hash=? AND lodestone_id=? AND plan_date=?`).bind(profileHash, lodestoneId, today).first();
  return json({ character, preferences: prefs ?? { available_minutes: 60, energy: 2 }, plan: planRow ? JSON.parse(planRow.plan_json) : null, progress_summary: progressSummary });
}

async function apiSync(request, env) {
  const profileHash = await requireProfile(request, env); let payload = {}; try { payload = await request.json(); } catch {}
  const safe = parseSafeLodestoneUrl(payload.lodestone_url);
  if (!safe) return json({ error: "FF14公式LodestoneのキャラクターページURLを入力してください。" }, 400);
  try {
    let state = await getCharacter(env, safe.lodestone_id); let cached = false;
    if (state && isFreshCharacter(state)) cached = true; else { state = await fetchLodestone(safe.canonical); await saveCharacter(env, state); }
    await linkProfileCharacter(env, profileHash, state.lodestone_id);
    const progressSummary = await getProgressSummary(env, profileHash, state.lodestone_id);
    return json({ ok: true, cached, character: state, progress_summary: progressSummary });
  } catch (error) { return json({ ok: false, error: error instanceof Error ? error.message : String(error), parser_version: PARSER_VERSION }, 502); }
}

async function apiPlan(request, env) {
  const profileHash = await requireProfile(request, env); let payload = {}; try { payload = await request.json(); } catch {}
  const lodestoneId = parseLodestoneId(payload.lodestone_id);
  if (!lodestoneId) return json({ error: "先にLodestone URLを同期してください。" }, 409);
  if (!(await isProfileCharacterLinked(env, profileHash, lodestoneId))) return json({ error: "このブラウザではまだこのキャラクターを同期していません。" }, 403);
  const character = await getCharacter(env, lodestoneId); if (!character) return json({ error: "Lodestoneを再同期してください。" }, 409);
  const availableMinutes = Math.max(15, Math.min(240, Number(payload.available_minutes) || 60)); const energy = Math.max(1, Math.min(5, Number(payload.energy) || 2)); const now = new Date().toISOString();
  await env.DB.prepare(`INSERT INTO user_preferences_private (profile_hash, lodestone_id, available_minutes, energy, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(profile_hash, lodestone_id) DO UPDATE SET available_minutes=excluded.available_minutes, energy=excluded.energy, updated_at=excluded.updated_at`).bind(profileHash, lodestoneId, availableMinutes, energy, now).run();
  const plan = buildRulePlan(character, availableMinutes, energy); const today = now.slice(0, 10);
  await env.DB.prepare(`INSERT INTO daily_plans_private (profile_hash, lodestone_id, plan_date, generated_at, available_minutes, energy, planner_kind, plan_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(profile_hash, lodestone_id, plan_date) DO UPDATE SET generated_at=excluded.generated_at, available_minutes=excluded.available_minutes, energy=excluded.energy, planner_kind=excluded.planner_kind, plan_json=excluded.plan_json`).bind(profileHash, lodestoneId, today, now, availableMinutes, energy, plan.planner_kind, JSON.stringify(plan)).run();
  return json({ ok: true, plan });
}

async function getDailyScreenshotUsage(env, profileHash) {
  const day = new Date().toISOString().slice(0, 10);
  const row = await env.DB.prepare(`SELECT screenshot_analyses FROM api_usage_daily WHERE profile_hash=? AND usage_date=?`).bind(profileHash, day).first();
  return { day, count: Number(row?.screenshot_analyses || 0) };
}

async function incrementDailyScreenshotUsage(env, profileHash, day) {
  await env.DB.prepare(`INSERT INTO api_usage_daily (profile_hash, usage_date, screenshot_analyses) VALUES (?, ?, 1) ON CONFLICT(profile_hash, usage_date) DO UPDATE SET screenshot_analyses=screenshot_analyses+1`).bind(profileHash, day).run();
}

function achievementSchema() {
  return { type: "object", additionalProperties: false, properties: {
    page_type: { type: "string", enum: ["achievement_list", "achievement_detail", "unknown"] }, category: { type: ["string", "null"] },
    entries: { type: "array", maxItems: 50, items: { type: "object", additionalProperties: false, properties: {
      name: { type: "string" }, current: { type: ["integer", "null"] }, target: { type: ["integer", "null"] }, completed: { type: ["boolean", "null"] }, confidence: { type: "number", minimum: 0, maximum: 1 }, visible_progress_text: { type: ["string", "null"] }
    }, required: ["name", "current", "target", "completed", "confidence", "visible_progress_text"] } }
  }, required: ["page_type", "category", "entries"] };
}

async function analyzeAchievementScreenshotWithGemini(env, file) {
  const model = env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL; const bytes = await file.arrayBuffer();
  const prompt = [
    "FINAL FANTASY XIVのゲーム内『実績』画面スクリーンショットから、見えている情報だけを抽出してください。",
    "推測は禁止です。画面外・読めない文字・隠れた進捗を補完しないでください。",
    "実績名は画面に見える表記をそのまま転記してください。",
    "current/target は 47/50 のように数値が明示されている場合だけ入れ、それ以外は null。",
    "completed は達成済みであることが明確な場合 true、未達が明確な場合 false、不明なら null。",
    "confidence はその行の読み取り全体への確信度を0〜1で返してください。",
    "一覧に見える実績を上から順に抽出してください。UI見出しや説明文を実績として混ぜないでください。"
  ].join("\n");
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: "POST", headers: { "content-type": "application/json", "x-goog-api-key": env.GEMINI_API_KEY },
    body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: prompt }, { inline_data: { mime_type: file.type, data: arrayBufferToBase64(bytes) } }] }], generationConfig: { temperature: 0.1, responseMimeType: "application/json", responseJsonSchema: achievementSchema() } })
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data?.error?.message || `Gemini HTTP ${response.status}`);
  const text = (data?.candidates?.[0]?.content?.parts || []).map(part => typeof part.text === "string" ? part.text : "").join("").trim();
  if (!text) throw new Error("Geminiから解析JSONが返りませんでした。");
  let parsed; try { parsed = JSON.parse(text); } catch { throw new Error("Geminiの解析結果JSONを読み取れませんでした。"); }
  const entries = Array.isArray(parsed.entries) ? parsed.entries.slice(0, 50) : [];
  return {
    model,
    page_type: ["achievement_list", "achievement_detail", "unknown"].includes(parsed.page_type) ? parsed.page_type : "unknown",
    category: parsed.category ? normalizeText(parsed.category).slice(0, 120) : null,
    entries: entries.map(entry => ({
      name: normalizeText(entry.name).slice(0, 200), current: nullableInt(entry.current), target: nullableInt(entry.target), completed: nullableBool(entry.completed), confidence: clampConfidence(entry.confidence), visible_progress_text: entry.visible_progress_text ? normalizeText(entry.visible_progress_text).slice(0, 120) : null
    })).filter(entry => entry.name.length > 0)
  };
}

async function getImportCandidates(env, importId) {
  const result = await env.DB.prepare(`SELECT candidate_id, achievement_name, current_value, target_value, completed, confidence, visible_progress_text, decision FROM screenshot_candidates WHERE import_id=? ORDER BY rowid ASC`).bind(importId).all();
  return (result.results || []).map(row => ({ candidate_id: row.candidate_id, achievement_name: row.achievement_name, current_value: row.current_value === null ? null : Number(row.current_value), target_value: row.target_value === null ? null : Number(row.target_value), completed: row.completed === null ? null : Boolean(row.completed), confidence: Number(row.confidence), visible_progress_text: row.visible_progress_text, decision: row.decision }));
}

async function apiAchievementAnalyze(request, env) {
  const profileHash = await requireProfile(request, env); await requireAiAccess(request, env);
  const usage = await getDailyScreenshotUsage(env, profileHash);
  if (usage.count >= MAX_SCREENSHOT_ANALYSES_PER_PROFILE_PER_DAY) return json({ error: `今日のSS解析上限（${MAX_SCREENSHOT_ANALYSES_PER_PROFILE_PER_DAY}回）に達しました。` }, 429);
  let form; try { form = await request.formData(); } catch { return json({ error: "画像アップロードを読み取れませんでした。" }, 400); }
  const lodestoneId = parseLodestoneId(form.get("lodestone_id")); const file = form.get("image");
  if (!lodestoneId) return json({ error: "キャラクターを読み込んでからSSを追加してください。" }, 400);
  if (!(await isProfileCharacterLinked(env, profileHash, lodestoneId))) return json({ error: "このブラウザではまだこのキャラクターを同期していません。" }, 403);
  if (!(file instanceof File)) return json({ error: "画像ファイルを選んでください。" }, 400);
  if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) return json({ error: "PNG / JPEG / WebP のSSだけ使えます。" }, 415);
  if (file.size <= 0 || file.size > MAX_IMAGE_BYTES) return json({ error: "SSは8MB以下にしてください。" }, 413);
  const bytes = await file.arrayBuffer(); const imageSha = await sha256Hex(bytes);
  const duplicate = await env.DB.prepare(`SELECT import_id, status, model_id, page_type, category FROM screenshot_imports WHERE profile_hash=? AND lodestone_id=? AND image_sha256=? ORDER BY created_at DESC LIMIT 1`).bind(profileHash, lodestoneId, imageSha).first();
  if (duplicate) {
    const candidates = await getImportCandidates(env, duplicate.import_id);
    return json({ ok: true, duplicate: true, import_id: duplicate.import_id, status: duplicate.status, model_id: duplicate.model_id, page_type: duplicate.page_type, category: duplicate.category, candidates });
  }
  const analysisFile = new File([bytes], file.name || "achievement.png", { type: file.type });
  let analysis; try { analysis = await analyzeAchievementScreenshotWithGemini(env, analysisFile); } finally { await incrementDailyScreenshotUsage(env, profileHash, usage.day); }
  const importId = crypto.randomUUID(); const now = new Date().toISOString();
  await env.DB.prepare(`INSERT INTO screenshot_imports (import_id, profile_hash, lodestone_id, filename, mime_type, image_sha256, status, model_id, page_type, category, created_at, confirmed_at) VALUES (?, ?, ?, ?, ?, ?, 'analyzed', ?, ?, ?, ?, NULL)`).bind(importId, profileHash, lodestoneId, (file.name || "achievement.png").slice(0, 240), file.type, imageSha, analysis.model, analysis.page_type, analysis.category, now).run();
  for (const entry of analysis.entries) {
    await env.DB.prepare(`INSERT INTO screenshot_candidates (candidate_id, import_id, achievement_name, current_value, target_value, completed, confidence, visible_progress_text, decision) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending')`).bind(crypto.randomUUID(), importId, entry.name, entry.current, entry.target, entry.completed === null ? null : (entry.completed ? 1 : 0), entry.confidence, entry.visible_progress_text).run();
  }
  const candidates = await getImportCandidates(env, importId);
  return json({ ok: true, duplicate: false, import_id: importId, status: "analyzed", model_id: analysis.model, page_type: analysis.page_type, category: analysis.category, image_saved: false, candidates });
}

async function apiAchievementConfirm(request, env) {
  const profileHash = await requireProfile(request, env); let payload = {}; try { payload = await request.json(); } catch {}
  const importId = normalizeText(payload.import_id); const acceptedIds = new Set(Array.isArray(payload.accepted_candidate_ids) ? payload.accepted_candidate_ids.map(x => String(x)) : []);
  if (!importId) return json({ error: "import_idがありません。" }, 400);
  const importRow = await env.DB.prepare(`SELECT import_id, profile_hash, lodestone_id, status FROM screenshot_imports WHERE import_id=? LIMIT 1`).bind(importId).first();
  if (!importRow || importRow.profile_hash !== profileHash) return json({ error: "このSS解析結果にはアクセスできません。" }, 404);
  if (!(await isProfileCharacterLinked(env, profileHash, importRow.lodestone_id))) return json({ error: "キャラクター紐付けを確認できません。" }, 403);
  const candidates = await getImportCandidates(env, importId); const now = new Date().toISOString(); let acceptedCount = 0; let rejectedCount = 0;
  for (const candidate of candidates) {
    const accepted = acceptedIds.has(candidate.candidate_id);
    await env.DB.prepare(`UPDATE screenshot_candidates SET decision=? WHERE candidate_id=? AND import_id=?`).bind(accepted ? "accepted" : "rejected", candidate.candidate_id, importId).run();
    if (!accepted) { rejectedCount += 1; continue; }
    const nameHash = await sha256Hex(new TextEncoder().encode(normalizeAchievementName(candidate.achievement_name))); const factKey = `achievement:${nameHash}`;
    const factValue = JSON.stringify({ name: candidate.achievement_name, current: candidate.current_value, target: candidate.target_value, completed: candidate.completed, visible_progress_text: candidate.visible_progress_text });
    await env.DB.prepare(`INSERT INTO progress_facts_private (profile_hash, lodestone_id, fact_key, fact_value, source, confidence, observed_at) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(profile_hash, lodestone_id, fact_key) DO UPDATE SET fact_value=excluded.fact_value, source=excluded.source, confidence=excluded.confidence, observed_at=excluded.observed_at`).bind(profileHash, importRow.lodestone_id, factKey, factValue, `screenshot:${importId}`, candidate.confidence, now).run();
    acceptedCount += 1;
  }
  await env.DB.prepare(`UPDATE screenshot_imports SET status='confirmed', confirmed_at=? WHERE import_id=? AND profile_hash=?`).bind(now, importId, profileHash).run();
  const progressSummary = await getProgressSummary(env, profileHash, importRow.lodestone_id);
  return json({ ok: true, import_id: importId, accepted_count: acceptedCount, rejected_count: rejectedCount, progress_summary: progressSummary });
}

async function handleApi(request, env) {
  const url = new URL(request.url);
  if (url.pathname === "/api/health") {
    await ensurePrivateSchema(env);
    return json({ ok: true, service: "ff14-today", version: APP_VERSION, parser_version: PARSER_VERSION, d1: Boolean(env.DB), multi_profile: true, screenshot_import: true, gemini_model: env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL, gemini_secret_configured: Boolean(env.GEMINI_API_KEY), ai_access_code_configured: Boolean(env.AI_ACCESS_CODE) });
  }
  if (url.pathname === "/api/state" && request.method === "GET") return apiState(request, env);
  if (url.pathname === "/api/sync" && request.method === "POST") return apiSync(request, env);
  if (url.pathname === "/api/plan" && request.method === "POST") return apiPlan(request, env);
  if (url.pathname === "/api/achievement-import/analyze" && request.method === "POST") return apiAchievementAnalyze(request, env);
  if (url.pathname === "/api/achievement-import/confirm" && request.method === "POST") return apiAchievementConfirm(request, env);
  return json({ error: "Not found" }, 404);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) {
      try { return await handleApi(request, env); }
      catch (error) {
        const status = Number(error?.status) || 500;
        return json({ error: status >= 500 ? "Server error" : (error?.message || "Request failed"), detail: status >= 500 ? (error?.message || String(error)) : undefined }, status);
      }
    }
    return env.ASSETS.fetch(request);
  }
};

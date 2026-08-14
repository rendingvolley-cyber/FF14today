// Live recovery for Today Task Board + TIME SENSITIVE.
// Big-fish data/algorithms are derived from the MIT-licensed FFX|V Fish Tracker
// (icykoneko/ff14-fish-tracker-app). The generated data file is fetched at runtime.
import { applyCombatJobFocus } from "./combat-job-focus.js";
import { applyCategoryJobFocus } from "./category-job-focus.js";
import { makeConcretePlan } from "./concrete-plan.js";

const OWNER_LODESTONE_ID = "3091607";
const FISH_DATA_URL = "https://raw.githubusercontent.com/icykoneko/ff14-fish-tracker-app/master/js/app/data.js";
const FISH_CACHE_MS = 6 * 60 * 60 * 1000;
const LODESTONE_CACHE_MS = 30 * 60 * 1000;
const EARTH_TO_EORZEA = 3600 / 175;
const EORZEA_TO_EARTH = 1 / EARTH_TO_EORZEA;
const ET_HOUR_MS = 60 * 60 * 1000;
const ET_DAY_MS = 24 * ET_HOUR_MS;
const ET_WEATHER_MS = 8 * ET_HOUR_MS;

let fishCache = { loadedAt: 0, data: null, error: null };
let lodestoneCache = { loadedAt: 0, rows: [], error: null };

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

function code(value) { return String(value || "").trim().toUpperCase(); }
function level(value) { const n = Number(value); return Number.isFinite(n) ? n : 0; }

function basePlan(mode, minutes = 60) {
  return {
    selected_mode: mode,
    planner_kind: "task-board-live-catalog-v1",
    session_complete: false,
    remaining_minutes: Math.max(5, Number(minutes) || 60),
    completed_daily: {}, focus_job: null, methods: [], now: null, next: null,
    fallback: { title: "今日はここで終了", minutes: 0 }
  };
}

export function parseFishTrackerData(source) {
  const text = String(source || "");
  const marker = "const DATA =";
  const start = text.indexOf(marker);
  if (start < 0) throw new Error("fish_data_marker_missing");
  let body = text.slice(start + marker.length).trim();
  if (body.endsWith(";")) body = body.slice(0, -1).trim();
  const parsed = JSON.parse(body);
  if (!parsed?.FISH || !parsed?.ITEMS || !parsed?.FISHING_SPOTS || !parsed?.WEATHER_RATES) {
    throw new Error("fish_data_shape_invalid");
  }
  return parsed;
}

async function loadFishData(nowMs = Date.now()) {
  if (fishCache.data && nowMs - fishCache.loadedAt < FISH_CACHE_MS) return fishCache;
  try {
    const response = await fetch(FISH_DATA_URL, { headers: { "user-agent": "FF14today/1.0" } });
    if (!response.ok) throw new Error(`fish_source_http_${response.status}`);
    fishCache = { loadedAt: nowMs, data: parseFishTrackerData(await response.text()), error: null };
  } catch (error) {
    fishCache = { loadedAt: nowMs, data: fishCache.data, error: String(error?.message || error || "fish_source_failed") };
  }
  return fishCache;
}

export function calculateForecastTarget(earthMs) {
  const unixTime = Math.trunc(Number(earthMs) / 1000);
  const bell = unixTime / 175;
  const inc = (bell + 8 - (bell % 8)) % 24;
  const totalDays = (Math.trunc(unixTime / 4200) >>> 0);
  const calcBase = totalDays * 100 + inc;
  const step1 = (((calcBase << 11) ^ calcBase) >>> 0);
  const step2 = (((step1 >>> 8) ^ step1) >>> 0);
  return step2 % 100;
}

function weatherId(data, territoryId, earthMs) {
  const rates = data?.WEATHER_RATES?.[territoryId]?.weather_rates || [];
  const target = calculateForecastTarget(earthMs);
  for (const row of rates) if (target < Number(row?.[1])) return Number(row?.[0]);
  return 0;
}

function localName(row, fallback = "") {
  return String(row?.name_ja || row?.name_en || row?.name || fallback || "").trim();
}
function setHas(rows, value) { return Array.isArray(rows) && rows.map(Number).includes(Number(value)); }
function setSize(value) { return Array.isArray(value) ? value.length : (value && typeof value === "object" ? Object.keys(value).length : 0); }
function fishRequiredLevel(fish) {
  const patch = Math.floor(Number(fish?.patch) || 2);
  return patch >= 7 ? 100 : patch === 6 ? 90 : patch === 5 ? 80 : patch === 4 ? 70 : patch === 3 ? 60 : 50;
}
function etToEarth(etMs) { return Math.ceil(Number(etMs) * EORZEA_TO_EARTH); }
function earthToEt(earthMs) { return Number(earthMs) * EARTH_TO_EORZEA; }
function intersect(aStart, aEnd, bStart, bEnd) {
  const start = Math.max(aStart, bStart), end = Math.min(aEnd, bEnd);
  return end > start ? { start, end } : null;
}
function etClock(etMs) {
  const day = ((Number(etMs) % ET_DAY_MS) + ET_DAY_MS) % ET_DAY_MS;
  const totalMinutes = Math.floor(day / 60000);
  return `${String(Math.floor(totalMinutes / 60)).padStart(2, "0")}:${String(totalMinutes % 60).padStart(2, "0")}`;
}
function fishRange(fish, dayStartEt) {
  const startHour = Number(fish?.startHour), endHour = Number(fish?.endHour);
  if (!Number.isFinite(startHour) || !Number.isFinite(endHour)) return null;
  return {
    start: dayStartEt + startHour * ET_HOUR_MS,
    end: dayStartEt + (endHour > startHour ? endHour : endHour + 24) * ET_HOUR_MS
  };
}

export function nextFishWindow(data, fish, nowMs = Date.now(), horizonHours = 24) {
  const spot = data?.FISHING_SPOTS?.[fish?.location];
  const territoryId = Number(spot?.territory_id || 0);
  if (!territoryId || !data?.WEATHER_RATES?.[territoryId]) return null;
  const nowEt = earthToEt(nowMs);
  const horizonEarth = nowMs + Math.max(1, horizonHours) * 3600000;
  const horizonEt = earthToEt(horizonEarth);
  const requiredCurrent = Array.isArray(fish.weatherSet) ? fish.weatherSet : [];
  const requiredPrevious = Array.isArray(fish.previousWeatherSet) ? fish.previousWeatherSet : [];
  for (let periodStart = Math.floor(nowEt / ET_WEATHER_MS) * ET_WEATHER_MS; periodStart <= horizonEt; periodStart += ET_WEATHER_MS) {
    const currentWeather = weatherId(data, territoryId, etToEarth(periodStart));
    const previousWeather = weatherId(data, territoryId, etToEarth(periodStart - ET_WEATHER_MS));
    if (requiredCurrent.length && !setHas(requiredCurrent, currentWeather)) continue;
    if (requiredPrevious.length && !setHas(requiredPrevious, previousWeather)) continue;
    const periodEnd = periodStart + ET_WEATHER_MS;
    const dayStart = Math.floor(periodStart / ET_DAY_MS) * ET_DAY_MS;
    for (const candidateDay of [dayStart - ET_DAY_MS, dayStart, dayStart + ET_DAY_MS]) {
      const range = fishRange(fish, candidateDay);
      if (!range) continue;
      const overlap = intersect(periodStart, periodEnd, range.start, range.end);
      if (!overlap) continue;
      const startAt = Math.max(nowMs, etToEarth(overlap.start));
      const endAt = etToEarth(overlap.end);
      if (endAt <= nowMs || startAt > horizonEarth) continue;
      return { start_at_ms: startAt, end_at_ms: endAt, et_start: etClock(overlap.start), et_end: etClock(overlap.end), weather_id: currentWeather, previous_weather_id: previousWeather };
    }
  }
  return null;
}

function baitNames(data, path) {
  return (Array.isArray(path) ? path : []).map(entry => {
    const id = Array.isArray(entry) ? entry[0] : entry;
    return localName(data?.ITEMS?.[id], String(id || ""));
  }).filter(Boolean).slice(0, 4);
}

export function buildBigFishRows(data, fisherLevel, nowMs = Date.now(), limit = 3) {
  const fisherLv = Number(fisherLevel) || 0;
  if (!data || fisherLv <= 0) return [];
  const rows = [];
  for (const fish of Object.values(data.FISH || {})) {
    if (fish?.bigFish !== true || fish?.dataMissing === true || fish?.gig != null) continue;
    if (setSize(fish?.predators) > 0) continue; // fail-soft: intuition chains need exact prerequisite overlap
    if (fisherLv < fishRequiredLevel(fish)) continue;
    const window = nextFishWindow(data, fish, nowMs, 24);
    if (!window) continue;
    const spot = data.FISHING_SPOTS?.[fish.location];
    const territoryId = Number(spot?.territory_id || 0);
    const zoneId = data.WEATHER_RATES?.[territoryId]?.zone_id;
    rows.push({
      id: Number(fish._id),
      name: localName(data.ITEMS?.[fish._id], `Fish ${fish._id}`),
      start_at_ms: window.start_at_ms, end_at_ms: window.end_at_ms,
      et_start: window.et_start, et_end: window.et_end,
      zone: localName(data.ZONES?.[zoneId]), location: localName(spot),
      weather: localName(data.WEATHER_TYPES?.[window.weather_id]),
      previous_weather: fish.previousWeatherSet?.length ? localName(data.WEATHER_TYPES?.[window.previous_weather_id]) : "",
      bait: baitNames(data, fish.bestCatchPath), hookset: String(fish.hookset || ""), tug: String(fish.tug || ""),
      folklore_required: fish.folklore != null && fish.folklore !== false,
      source: "FFX|V Fish Tracker"
    });
  }
  return rows.sort((a, b) => (a.start_at_ms - b.start_at_ms) || ((a.end_at_ms - a.start_at_ms) - (b.end_at_ms - b.start_at_ms))).slice(0, Math.max(1, limit));
}

function jstParts(nowMs = Date.now()) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(nowMs));
  const get = type => Number(parts.find(part => part.type === type)?.value || 0);
  return { year: get("year"), month: get("month"), day: get("day") };
}
function ymd(date) { return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`; }
export function nextWeeklyResetMs(nowMs = Date.now()) {
  const { year, month, day } = jstParts(nowMs);
  const base = new Date(Date.UTC(year, month - 1, day));
  const add = (2 - base.getUTCDay() + 7) % 7;
  let date = new Date(Date.UTC(year, month - 1, day + add));
  let candidate = Date.parse(`${ymd(date)}T17:00:00+09:00`);
  if (candidate <= nowMs) {
    date = new Date(Date.UTC(year, month - 1, day + add + 7));
    candidate = Date.parse(`${ymd(date)}T17:00:00+09:00`);
  }
  return candidate;
}

function decodeHtml(text) {
  return String(text || "").replace(/<script\b[\s\S]*?<\/script>/gi, " ").replace(/<style\b[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, "\"").replace(/&#39;|&apos;/g, "'").replace(/\s+/g, " ").trim();
}
function titleFromHtml(html) {
  const match = String(html || "").match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return decodeHtml(match?.[1] || "").replace(/\s*[|｜]\s*FINAL FANTASY XIV.*$/i, "").trim();
}
function currentOrNextYear(month, nowMs) {
  const now = jstParts(nowMs);
  return month + 2 < now.month ? now.year + 1 : now.year;
}
export function extractJapaneseDeadline(text, nowMs = Date.now()) {
  const source = String(text || ""), maxFuture = nowMs + 120 * 86400000, candidates = [];
  const sameDayRange = /(?:(\d{4})年)?\s*(\d{1,2})月\s*(\d{1,2})日[^。\n]{0,80}?(\d{1,2}):(\d{2})[^。\n]{0,30}?(?:～|〜|より|から)[^。\n]{0,30}?(\d{1,2}):(\d{2})[^。\n]{0,12}?まで/g;
  for (const m of source.matchAll(sameDayRange)) {
    const month = Number(m[2]), year = Number(m[1]) || currentOrNextYear(month, nowMs);
    const end = Date.parse(`${year}-${String(month).padStart(2, "0")}-${String(m[3]).padStart(2, "0")}T${String(m[6]).padStart(2, "0")}:${m[7]}:00+09:00`);
    if (end > nowMs && end < maxFuture) candidates.push(end);
  }
  const explicitUntil = /(?:(\d{4})年)?\s*(\d{1,2})月\s*(\d{1,2})日[^。\n]{0,40}?(\d{1,2}):(\d{2})(?:頃)?\s*まで/g;
  for (const m of source.matchAll(explicitUntil)) {
    const month = Number(m[2]), year = Number(m[1]) || currentOrNextYear(month, nowMs);
    const end = Date.parse(`${year}-${String(month).padStart(2, "0")}-${String(m[3]).padStart(2, "0")}T${String(m[4]).padStart(2, "0")}:${m[5]}:00+09:00`);
    if (end > nowMs && end < maxFuture) candidates.push(end);
  }
  return candidates.length ? Math.min(...candidates) : null;
}

async function loadLodestoneDeadlines(nowMs = Date.now()) {
  if (nowMs - lodestoneCache.loadedAt < LODESTONE_CACHE_MS) return lodestoneCache;
  try {
    const indexes = await Promise.all([fetch("https://jp.finalfantasyxiv.com/lodestone/news/"), fetch("https://jp.finalfantasyxiv.com/lodestone/topics/")]);
    const html = (await Promise.all(indexes.filter(r => r.ok).map(r => r.text()))).join("\n");
    const links = [], seen = new Set();
    const re = /href=["']([^"']*\/lodestone\/(?:news|topics)\/detail\/[0-9a-f]+\/?)["']/gi;
    for (const match of html.matchAll(re)) {
      const href = new URL(match[1], "https://jp.finalfantasyxiv.com").toString();
      if (seen.has(href)) continue;
      seen.add(href); links.push(href);
      if (links.length >= 10) break;
    }
    const pages = await Promise.allSettled(links.map(async href => {
      const response = await fetch(href);
      if (!response.ok) return null;
      const body = await response.text();
      const deadlineAt = extractJapaneseDeadline(decodeHtml(body), nowMs);
      if (!deadlineAt) return null;
      return { key: `lodestone:${href.split("/").filter(Boolean).pop()}`, title: titleFromHtml(body) || "Lodestone期限情報", deadline_at_ms: deadlineAt, detail: "公式Lodestone掲載の終了・メンテナンス時刻", source: "Lodestone" };
    }));
    const rows = pages.filter(row => row.status === "fulfilled" && row.value).map(row => row.value).sort((a, b) => a.deadline_at_ms - b.deadline_at_ms).slice(0, 5);
    lodestoneCache = { loadedAt: nowMs, rows, error: null };
  } catch (error) {
    lodestoneCache = { loadedAt: nowMs, rows: lodestoneCache.rows || [], error: String(error?.message || error || "lodestone_failed") };
  }
  return lodestoneCache;
}

async function ownerCharacter(env) {
  const row = await env.DB.prepare(`SELECT lodestone_id, lodestone_url, name, world, data_center, jobs_json, bozja_rank, synced_at, parser_version FROM character_state WHERE lodestone_id=? LIMIT 1`).bind(OWNER_LODESTONE_ID).first();
  if (!row) return null;
  let jobs = []; try { jobs = JSON.parse(row.jobs_json || "[]"); } catch {}
  return { ...row, jobs, bozja_rank: Number(row.bozja_rank || 0) };
}
function japanDateKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const get = type => parts.find(part => part.type === type)?.value || "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}
async function completionCounts(env) {
  try {
    const result = await env.DB.prepare(`SELECT task_key, COUNT(*) AS completion_count FROM activity_history WHERE lodestone_id=? AND activity_date=? GROUP BY task_key LIMIT 100`).bind(OWNER_LODESTONE_ID, japanDateKey()).all();
    return Object.fromEntries((result.results || []).map(row => [String(row.task_key || ""), Number(row.completion_count || 0)]));
  } catch { return {}; }
}
function highestJob(character, predicate) {
  return (character?.jobs || []).filter(job => job?.level != null && predicate(job)).sort((a, b) => level(b.level) - level(a.level))[0] || null;
}
function defaultCombat(character) { return highestJob(character, job => ["tank", "healer", "melee", "ranged", "caster"].includes(job.role) && level(job.level) >= 70 && level(job.level) < 100); }
function defaultCraft(character) { return highestJob(character, job => job.role === "crafter" && level(job.level) > 0 && level(job.level) < 100); }
function defaultGather(character) { return highestJob(character, job => job.role === "gatherer" && ["MIN", "BTN"].includes(code(job.code)) && level(job.level) > 0 && level(job.level) < 100); }

function fishingRoutine(character) {
  const fisher = (character?.jobs || []).find(job => code(job?.code) === "FSH" && level(job.level) > 0);
  if (!fisher) return [];
  return [{
    task_key: "fishing:log-three", daily_key: null, badge: "通常釣り",
    title: `${fisher.name_ja || "漁師"}で釣り手帳の未登録を3種類だけ埋める`, minutes: 25,
    reason: "BIG FISHの窓待ちとは分けて、いつでも進められる通常の釣り枠。3種類で終了するので予定に入れやすくします。",
    condition: "目的：釣り手帳の未登録を3種類だけ埋める。大物魚の時間窓は下のTIME SENSITIVEで別表示します。",
    steps: [`${fisher.name_ja || "漁師"}（Lv${fisher.level}）へジョブチェンジ`, "釣り手帳を開き、現在行けるエリアの未登録魚を確認", "未登録を3種類だけ釣る", "3種類埋まったら終了"],
    job_code: "FSH", job_name: fisher.name_ja || "漁師", job_level: level(fisher.level), job_role: "gatherer", repeat_count: 0
  }];
}
function mergeMethods(...groups) {
  const seen = new Set(), rows = [];
  for (const group of groups) for (const row of Array.isArray(group) ? group : []) {
    const key = String(row?.task_key || row?.title || "");
    if (!key || seen.has(key)) continue;
    seen.add(key); rows.push(row);
  }
  return rows;
}
function fishAsMethods(rows) {
  return rows.map(row => ({
    task_key: `live:big-fish:${row.id}`, daily_key: null, badge: "BIG FISH", title: row.name,
    minutes: Math.max(5, Math.ceil((row.end_at_ms - row.start_at_ms) / 60000)),
    reason: [row.zone, row.location, row.bait.length ? `餌 ${row.bait.join(" → ")}` : "", row.weather ? `天候 ${row.previous_weather ? `${row.previous_weather} → ` : ""}${row.weather}` : "", row.folklore_required ? "伝承録が必要" : ""].filter(Boolean).join(" / "),
    condition: `ET ${row.et_start}-${row.et_end}。Fish Trackerの現行条件からJST窓を計算。`, steps: [],
    job_code: "FSH", job_name: "漁師", job_role: "gatherer", source_kind: "ffxiv_fish_tracker",
    time_window: { start_at_ms: row.start_at_ms, end_at_ms: row.end_at_ms, label: `ET ${row.et_start}-${row.et_end}` }
  }));
}
function deadlinesAsMethods(rows, nowMs) {
  const weekly = { key: "weekly-reset", title: "週制限リセット", deadline_at_ms: nextWeeklyResetMs(nowMs), detail: "毎週火曜17:00 JST", source: "Lodestone（公式リセット時刻）" };
  return [weekly, ...(rows || [])].map(row => ({
    task_key: `live:deadline:${row.key}`, daily_key: null, badge: "期限・時限", title: row.title, minutes: 0,
    reason: row.detail || row.source || "期限情報", condition: "実時間でカウントダウン表示", steps: [],
    schedule_type: row.key === "weekly-reset" ? "weekly" : "event", deadline_at: row.deadline_at_ms,
    source_kind: row.source === "Lodestone" ? "lodestone" : "official_reset", time_window: { deadline_at: row.deadline_at_ms, label: "期限" }
  }));
}

export async function buildLiveFeed(env, nowMs = Date.now()) {
  const character = await ownerCharacter(env);
  const fisher = (character?.jobs || []).find(job => code(job?.code) === "FSH");
  const [fishSource, lodestone] = await Promise.all([loadFishData(nowMs), loadLodestoneDeadlines(nowMs)]);
  return {
    fish: fishSource.data ? buildBigFishRows(fishSource.data, level(fisher?.level), nowMs, 3) : [],
    deadlines: deadlinesAsMethods(lodestone.rows, nowMs),
    source_status: {
      fish: { ok: Boolean(fishSource.data), error: fishSource.error, source: "FFX|V Fish Tracker" },
      lodestone: { ok: !lodestone.error, error: lodestone.error, source: "Lodestone" }
    }
  };
}

export async function buildCatalogPlan(request, env, existingData = null) {
  const url = new URL(request.url);
  const mode = String(url.searchParams.get("planner_mode") || existingData?.plan?.selected_mode || "efficient");
  const minutes = Number(existingData?.preferences?.available_minutes || existingData?.plan?.remaining_minutes || 60) || 60;
  const character = existingData?.character || await ownerCharacter(env);
  if (!character) return existingData?.plan || basePlan(mode, minutes);
  const counts = await completionCounts(env);

  if (mode === "efficient") {
    const focus = code(url.searchParams.get("focus_combat_job_code") || existingData?.plan?.focus_job?.code || defaultCombat(character)?.code);
    return applyCombatJobFocus(basePlan("efficient", minutes), character, {
      focusJobCode: focus, availableMinutes: minutes,
      completedDaily: { leveling: url.searchParams.get("completed_leveling") === "1", alliance: url.searchParams.get("completed_alliance") === "1" },
      completionCounts: counts
    });
  }
  if (mode === "craft") {
    const focus = code(url.searchParams.get("focus_craft_job_code") || existingData?.plan?.focus_job?.code || defaultCraft(character)?.code);
    return applyCategoryJobFocus(basePlan("craft", minutes), character, { focusCraftJobCode: focus, availableMinutes: minutes });
  }
  if (mode === "gather") {
    const focus = code(url.searchParams.get("focus_gather_job_code") || existingData?.plan?.focus_job?.code || defaultGather(character)?.code);
    const focused = applyCategoryJobFocus(basePlan("gather", minutes), character, { focusGatherJobCode: focus, availableMinutes: minutes });
    const methods = mergeMethods(focused?.methods, fishingRoutine(character));
    return { ...focused, session_complete: methods.length === 0, methods, now: methods[0] || null, next: methods[1] ? { title: methods[1].title, minutes: methods[1].minutes, reason: methods[1].reason } : null, task_board_live_catalog: true };
  }
  if (mode === "discover") {
    const concrete = makeConcretePlan(character, minutes, 3, basePlan("discover", minutes), {}, counts, "discover") || basePlan("discover", minutes);
    const live = await buildLiveFeed(env);
    const methods = mergeMethods(concrete?.methods, fishAsMethods(live.fish), live.deadlines);
    return { ...concrete, methods, session_complete: methods.length === 0, source_status: live.source_status, task_board_live_catalog: true };
  }
  return existingData?.plan || basePlan(mode, minutes);
}

export async function augmentStateResponse(request, response, env) {
  if (!response.ok || !(response.headers.get("content-type") || "").includes("application/json")) return response;
  let data; try { data = await response.clone().json(); } catch { return response; }
  if (!data || typeof data !== "object" || !data.plan) return response;
  try {
    data.plan = await buildCatalogPlan(request, env, data);
    data.task_board_live_catalog = true;
  } catch (error) {
    data.task_board_live_catalog = false;
    data.task_board_live_catalog_error = String(error?.message || error || "catalog_failed");
  }
  return json(data, response.status);
}

export async function liveFeedResponse(env) {
  try { return json({ ok: true, ...(await buildLiveFeed(env)) }); }
  catch (error) { return json({ ok: false, fish: [], deadlines: deadlinesAsMethods([], Date.now()), error: String(error?.message || error || "live_feed_failed") }); }
}

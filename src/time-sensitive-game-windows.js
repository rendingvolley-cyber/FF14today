const TEAMCRAFT_LAZY_LIST_URL = "https://raw.githubusercontent.com/ffxiv-teamcraft/ffxiv-teamcraft/staging/libs/data/src/lib/lazy-files-list.ts";
const TEAMCRAFT_CDN = "https://cdn.ffxivteamcraft.com/assets/data";
const TEAMCRAFT_API = "https://api.ffxivteamcraft.com/data";
const TEAMCRAFT_CACHE_MS = 6 * 60 * 60 * 1000;
const EORZEA_TO_EARTH = 175 / 3600;
const EARTH_TO_EORZEA = 1 / EORZEA_TO_EARTH;
const ET_HOUR_MS = 60 * 60 * 1000;
const ET_DAY_MS = 24 * ET_HOUR_MS;
const ET_MINUTE_MS = 60 * 1000;
const FALLBACK_FILES = {
  nodes: "nodes.867d1c73e7bc69040105f952a415b29af7660ab6.json",
  items: "items.04e60a5a3583a28c5b832690af015808d580ed67.json",
  places: "places.051b5802c0e2366c6908b88fc08bc8523f3b656b.json"
};

let teamcraftCache = { loadedAt: 0, nodes: null, files: FALLBACK_FILES, error: null };

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

function level(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function localName(row, fallback = "") {
  if (typeof row === "string") return row;
  return String(row?.ja || row?.name_ja || row?.en || row?.name_en || fallback || "").trim();
}

function parseLazyFileName(source, key, fallback) {
  const block = String(source || "").match(new RegExp(`['\"]${key}['\"]\\s*:\\s*\\{[\\s\\S]*?hashedFileName\\s*:\\s*['\"]([^'\"]+)['\"]`));
  return block?.[1] || fallback;
}

export function parseTeamcraftLazyFiles(source) {
  return {
    nodes: parseLazyFileName(source, "nodes", FALLBACK_FILES.nodes),
    items: parseLazyFileName(source, "items", FALLBACK_FILES.items),
    places: parseLazyFileName(source, "places", FALLBACK_FILES.places)
  };
}

function fileHash(fileName) {
  const parts = String(fileName || "").split(".");
  return parts.length >= 3 ? parts[1] : "";
}

async function fetchJson(url) {
  const response = await fetch(url, { headers: { "user-agent": "FF14today/1.0" } });
  if (!response.ok) throw new Error(`teamcraft_http_${response.status}`);
  return response.json();
}

async function loadTeamcraftNodes(nowMs = Date.now()) {
  if (teamcraftCache.nodes && nowMs - teamcraftCache.loadedAt < TEAMCRAFT_CACHE_MS) return teamcraftCache;
  let files = teamcraftCache.files || FALLBACK_FILES;
  try {
    const listResponse = await fetch(TEAMCRAFT_LAZY_LIST_URL, { headers: { "user-agent": "FF14today/1.0" } });
    if (listResponse.ok) files = parseTeamcraftLazyFiles(await listResponse.text());
    const nodes = await fetchJson(`${TEAMCRAFT_CDN}/${files.nodes}`);
    teamcraftCache = { loadedAt: nowMs, nodes, files, error: null };
  } catch (error) {
    teamcraftCache = {
      loadedAt: nowMs,
      nodes: teamcraftCache.nodes,
      files,
      error: String(error?.message || error || "teamcraft_nodes_failed")
    };
  }
  return teamcraftCache;
}

function chunks(values, size = 80) {
  const rows = [];
  for (let i = 0; i < values.length; i += size) rows.push(values.slice(i, i + size));
  return rows;
}

async function loadRows(contentName, fileName, ids) {
  const unique = [...new Set(ids.map(Number).filter(Number.isFinite))];
  if (!unique.length) return {};
  const hash = fileHash(fileName);
  if (!hash) return {};
  const results = await Promise.allSettled(chunks(unique).map(batch => fetchJson(`${TEAMCRAFT_API}/${contentName}/${hash}/${batch.join(",")}`)));
  return Object.assign({}, ...results.filter(result => result.status === "fulfilled").map(result => result.value));
}

function jobForNodeType(type) {
  const n = Number(type);
  if (n === 0 || n === 1) return "MIN";
  if (n === 2 || n === 3) return "BTN";
  return null;
}

function jobLevel(character, code) {
  return level((character?.jobs || []).find(job => String(job?.code || "").toUpperCase() === code)?.level);
}

function currentBandFloor(jobLv) {
  if (jobLv >= 100) return 90;
  if (jobLv < 50) return jobLv;
  return Math.floor(jobLv / 10) * 10;
}

function eligibleTimedNodes(nodes, character) {
  const minLv = jobLevel(character, "MIN");
  const btnLv = jobLevel(character, "BTN");
  return Object.entries(nodes || {}).map(([id, node]) => ({ id: Number(id), ...node })).filter(node => {
    if (!node?.limited || !Array.isArray(node?.spawns) || node.spawns.length === 0) return false;
    const jobCode = jobForNodeType(node.type);
    if (!jobCode) return false;
    const lv = jobCode === "MIN" ? minLv : btnLv;
    if (!lv || level(node.level) > lv) return false;
    return level(node.level) >= currentBandFloor(lv);
  });
}

function earthToEt(earthMs) { return Number(earthMs) * EARTH_TO_EORZEA; }
function etToEarth(etMs) { return Number(etMs) * EORZEA_TO_EARTH; }

export function nextGatherWindow(node, nowMs = Date.now(), horizonHours = 12) {
  const nowEt = earthToEt(nowMs);
  const dayStart = Math.floor(nowEt / ET_DAY_MS) * ET_DAY_MS;
  const durationEt = Math.max(1, Number(node?.duration) || 120) * ET_MINUTE_MS;
  const horizon = nowMs + Math.max(1, horizonHours) * 3600000;
  const candidates = [];
  for (const spawn of node?.spawns || []) {
    const hour = Number(spawn);
    if (!Number.isFinite(hour)) continue;
    for (const offset of [-1, 0, 1, 2, 3, 4]) {
      const startEt = dayStart + offset * ET_DAY_MS + hour * ET_HOUR_MS;
      const endEt = startEt + durationEt;
      const startAt = etToEarth(startEt);
      const endAt = etToEarth(endEt);
      if (endAt <= nowMs || startAt > horizon) continue;
      candidates.push({ start_at_ms: startAt, end_at_ms: endAt, open: startAt <= nowMs && nowMs < endAt, spawn_hour: hour });
    }
  }
  return candidates.sort((a, b) => {
    if (a.open !== b.open) return a.open ? -1 : 1;
    return a.start_at_ms - b.start_at_ms;
  })[0] || null;
}

function nodeKind(node) {
  if (node?.ephemeral) return "刻限";
  if (node?.folklore) return "伝説";
  return "未知";
}

function jobName(code) { return code === "MIN" ? "採掘師" : "園芸師"; }

function etLabel(node) {
  const duration = Math.max(1, Number(node?.duration) || 120);
  return (node?.spawns || []).map(spawn => {
    const startMinutes = Math.round(Number(spawn) * 60);
    const endMinutes = (startMinutes + duration) % (24 * 60);
    const clock = minutes => `${String(Math.floor(minutes / 60) % 24).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
    return `${clock(startMinutes)}-${clock(endMinutes)}`;
  }).join(" / ");
}

function representativeItems(node, items) {
  return (node?.items || []).map(id => localName(items?.[id], "")).filter(Boolean).slice(0, 3);
}

export function buildTimedGatheringRowsFromData(data, character, nowMs = Date.now(), limit = 6) {
  const nodes = eligibleTimedNodes(data?.nodes || {}, character);
  return nodes.map(node => {
    const window = nextGatherWindow(node, nowMs, 12);
    if (!window) return null;
    const jobCode = jobForNodeType(node.type);
    const names = representativeItems(node, data?.items || {});
    const zone = localName(data?.places?.[node.zoneid], `エリアID ${node.zoneid}`);
    const coordinates = Number.isFinite(Number(node.x)) && Number.isFinite(Number(node.y))
      ? `X:${Number(node.x).toFixed(1)} Y:${Number(node.y).toFixed(1)}`
      : "";
    const kind = nodeKind(node);
    const itemTitle = names.length ? names.join(" / ") : `${kind}採集ポイント`;
    return {
      task_key: `live:timed-gather:${node.id}`,
      daily_key: null,
      badge: `時限採集・${kind}`,
      title: `${jobName(jobCode)}：${itemTitle}`,
      minutes: Math.max(5, Math.ceil((window.end_at_ms - Math.max(nowMs, window.start_at_ms)) / 60000)),
      reason: [`${kind} Lv${level(node.level)}`, zone, coordinates, `ET ${etLabel(node)}`].filter(Boolean).join(" / "),
      condition: `Lodestoneの${jobName(jobCode)}Lv${jobLevel(character, jobCode)}で採集可能。ET ${etLabel(node)}。`,
      steps: [],
      job_code: jobCode,
      job_name: jobName(jobCode),
      job_level: jobLevel(character, jobCode),
      job_role: "gatherer",
      source_kind: "ffxiv_teamcraft_timed_gather",
      schedule_type: "game_window",
      node_kind: kind,
      node_level: level(node.level),
      time_window: {
        start_at_ms: window.start_at_ms,
        end_at_ms: window.end_at_ms,
        state: window.open ? "open" : "upcoming",
        label: `ET ${etLabel(node)}`
      }
    };
  }).filter(Boolean).sort((a, b) => {
    const aOpen = a.time_window.state === "open", bOpen = b.time_window.state === "open";
    if (aOpen !== bOpen) return aOpen ? -1 : 1;
    const timeDiff = a.time_window.start_at_ms - b.time_window.start_at_ms;
    if (timeDiff) return timeDiff;
    return Number(b.node_level || 0) - Number(a.node_level || 0);
  }).slice(0, Math.max(1, limit));
}

export async function buildTimedGatheringRows(character, nowMs = Date.now(), limit = 6) {
  const source = await loadTeamcraftNodes(nowMs);
  if (!source.nodes) return { rows: [], error: source.error || "teamcraft_nodes_unavailable", source: "FFXIV Teamcraft" };
  const eligible = eligibleTimedNodes(source.nodes, character);
  const itemIds = eligible.flatMap(node => node.items || []);
  const placeIds = eligible.map(node => node.zoneid);
  const [items, places] = await Promise.all([
    loadRows("items", source.files.items, itemIds),
    loadRows("places", source.files.places, placeIds)
  ]);
  return {
    rows: buildTimedGatheringRowsFromData({ nodes: Object.fromEntries(eligible.map(node => [node.id, node])), items, places }, character, nowMs, limit),
    error: source.error,
    source: "FFXIV Teamcraft"
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

function mergeMethods(...groups) {
  const seen = new Set(), rows = [];
  for (const group of groups) for (const row of Array.isArray(group) ? group : []) {
    const key = String(row?.task_key || row?.title || "");
    if (!key || seen.has(key)) continue;
    seen.add(key); rows.push(row);
  }
  return rows;
}

export function applyGameWindowPolicyToPlan(plan, mode, timedRows = []) {
  if (!plan || !Array.isArray(plan.methods)) return plan;
  if (mode === "gather") {
    return { ...plan, methods: mergeMethods(plan.methods, timedRows), session_complete: false };
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
  let timed = { rows: [], error: null, source: "FFXIV Teamcraft" };
  if (mode === "gather" && data.character) timed = await buildTimedGatheringRows(data.character, nowMs, 6);
  data.plan = applyGameWindowPolicyToPlan(data.plan, mode, timed.rows);
  data.time_sensitive_scope = "game_windows";
  if (mode === "gather") data.timed_gathering_source = { source: timed.source, ok: timed.rows.length > 0, count: timed.rows.length, error: timed.error };
  return json(data, response.status);
}

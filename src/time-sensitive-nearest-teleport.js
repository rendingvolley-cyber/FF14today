const TEAMCRAFT_LAZY_LIST_URL = "https://raw.githubusercontent.com/ffxiv-teamcraft/ffxiv-teamcraft/staging/libs/data/src/lib/lazy-files-list.ts";
const TEAMCRAFT_CDN = "https://cdn.ffxivteamcraft.com/assets/data";
const TEAMCRAFT_API = "https://api.ffxivteamcraft.com/data";
const CACHE_MS = 6 * 60 * 60 * 1000;
const FALLBACK_FILES = {
  nodes: "nodes.867d1c73e7bc69040105f952a415b29af7660ab6.json",
  aetherytes: "aetherytes.76383d85baa4c97c2fcc39b6d1da406b2dd63f16.json",
  places: "places.051b5802c0e2366c6908b88fc08bc8523f3b656b.json"
};

let cache = { loadedAt: 0, files: FALLBACK_FILES, aetherytes: null, error: null };

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

function localName(row, fallback = "") {
  if (typeof row === "string") return row;
  return String(row?.ja || row?.name_ja || row?.en || row?.name_en || fallback || "").trim();
}

function parseLazyFileName(source, key, fallback) {
  const block = String(source || "").match(new RegExp(`['\"]${key}['\"]\\s*:\\s*\\{[\\s\\S]*?hashedFileName\\s*:\\s*['\"]([^'\"]+)['\"]`));
  return block?.[1] || fallback;
}

export function parseTeleportLazyFiles(source) {
  return {
    nodes: parseLazyFileName(source, "nodes", FALLBACK_FILES.nodes),
    aetherytes: parseLazyFileName(source, "aetherytes", FALLBACK_FILES.aetherytes),
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

async function loadRows(contentName, fileName, ids) {
  const unique = [...new Set(ids.map(Number).filter(Number.isFinite))];
  if (!unique.length) return {};
  const hash = fileHash(fileName);
  if (!hash) return {};
  const rows = [];
  for (let index = 0; index < unique.length; index += 80) {
    const batch = unique.slice(index, index + 80);
    try {
      rows.push(await fetchJson(`${TEAMCRAFT_API}/${contentName}/${hash}/${batch.join(",")}`));
    } catch {}
  }
  return Object.assign({}, ...rows);
}

async function loadAetheryteSource(nowMs = Date.now()) {
  if (cache.aetherytes && nowMs - cache.loadedAt < CACHE_MS) return cache;
  let files = cache.files || FALLBACK_FILES;
  try {
    const listResponse = await fetch(TEAMCRAFT_LAZY_LIST_URL, { headers: { "user-agent": "FF14today/1.0" } });
    if (listResponse.ok) files = parseTeleportLazyFiles(await listResponse.text());
    const aetherytes = await fetchJson(`${TEAMCRAFT_CDN}/${files.aetherytes}`);
    cache = { loadedAt: nowMs, files, aetherytes, error: null };
  } catch (error) {
    cache = {
      loadedAt: nowMs,
      files,
      aetherytes: cache.aetherytes,
      error: String(error?.message || error || "teamcraft_aetherytes_failed")
    };
  }
  return cache;
}

function distanceSquared(a, b) {
  const dx = Number(a?.x) - Number(b?.x);
  const dy = Number(a?.y) - Number(b?.y);
  return dx * dx + dy * dy;
}

export function nearestAetheryteForNode(node, aetherytes) {
  if (!node || !Number.isFinite(Number(node.x)) || !Number.isFinite(Number(node.y))) return null;
  const all = Array.isArray(aetherytes) ? aetherytes : Object.values(aetherytes || {});
  const usable = all.filter(aetheryte => Number(aetheryte?.type) === 0 && Number.isFinite(Number(aetheryte?.x)) && Number.isFinite(Number(aetheryte?.y)));
  const sameMap = usable.filter(aetheryte => Number(aetheryte?.map) === Number(node?.map));
  const sameZone = usable.filter(aetheryte => Number(aetheryte?.zoneid) === Number(node?.zoneid));
  const candidates = sameMap.length ? sameMap : sameZone;
  if (!candidates.length) return null;
  return [...candidates].sort((a, b) => distanceSquared(a, node) - distanceSquared(b, node))[0] || null;
}

function nodeIdFromMethod(method) {
  const explicit = Number(method?.node_id);
  if (Number.isFinite(explicit) && explicit > 0) return explicit;
  const match = String(method?.task_key || "").match(/^live:timed-gather:(\d+)$/);
  return match ? Number(match[1]) : null;
}

export function applyNearestTeleportHintsToPlan(plan, hints = {}) {
  if (!plan || !Array.isArray(plan.methods)) return plan;
  let enriched = 0;
  const methods = plan.methods.map(method => {
    if (method?.source_kind !== "ffxiv_teamcraft_timed_gather") return method;
    const nodeId = nodeIdFromMethod(method);
    const hint = nodeId ? hints[nodeId] : null;
    if (!hint?.name) return method;
    enriched += 1;
    const route = `最短テレポ：${hint.name}`;
    return {
      ...method,
      reason: [route, method.reason].filter(Boolean).join(" / "),
      nearest_teleport: {
        name: hint.name,
        x: Number(hint.x),
        y: Number(hint.y),
        distance: Number.isFinite(Number(hint.distance)) ? Number(hint.distance) : null
      },
      route_hint: method?.coordinates ? `${route} → ${method.coordinates}` : route,
      steps: [`${hint.name}へテレポ`, ...(Array.isArray(method.steps) ? method.steps : [])]
    };
  });
  return { ...plan, methods, nearest_teleport_hint_count: enriched };
}

async function buildHints(plan, nowMs = Date.now()) {
  const timed = (plan?.methods || []).filter(method => method?.source_kind === "ffxiv_teamcraft_timed_gather");
  const nodeIds = [...new Set(timed.map(nodeIdFromMethod).filter(Boolean))];
  if (!nodeIds.length) return { hints: {}, error: null };

  const source = await loadAetheryteSource(nowMs);
  if (!source.aetherytes) return { hints: {}, error: source.error || "teamcraft_aetherytes_unavailable" };
  const nodes = await loadRows("nodes", source.files.nodes, nodeIds);
  const nearestByNode = {};
  for (const nodeId of nodeIds) {
    const node = nodes?.[nodeId];
    const nearest = nearestAetheryteForNode(node, source.aetherytes);
    if (nearest) nearestByNode[nodeId] = { node, nearest };
  }
  const placeIds = Object.values(nearestByNode).map(row => row.nearest.nameid).filter(Boolean);
  const places = await loadRows("places", source.files.places, placeIds);
  const hints = {};
  for (const [nodeId, row] of Object.entries(nearestByNode)) {
    const name = localName(places?.[row.nearest.nameid], "");
    if (!name) continue;
    hints[nodeId] = {
      name,
      x: Number(row.nearest.x),
      y: Number(row.nearest.y),
      distance: Math.sqrt(distanceSquared(row.nearest, row.node))
    };
  }
  return { hints, error: source.error };
}

export async function addNearestTeleportHints(request, response, nowMs = Date.now()) {
  if (!response.ok || !(response.headers.get("content-type") || "").includes("application/json")) return response;
  const url = new URL(request.url);
  if (String(url.searchParams.get("planner_mode") || "") !== "gather") return response;
  let data;
  try { data = await response.clone().json(); }
  catch { return response; }
  if (!data?.plan) return response;
  try {
    const result = await buildHints(data.plan, nowMs);
    data.plan = applyNearestTeleportHintsToPlan(data.plan, result.hints);
    data.timed_gathering_teleport = {
      source: "FFXIV Teamcraft",
      ok: Number(data.plan.nearest_teleport_hint_count || 0) > 0,
      count: Number(data.plan.nearest_teleport_hint_count || 0),
      error: result.error || null
    };
  } catch (error) {
    data.timed_gathering_teleport = {
      source: "FFXIV Teamcraft",
      ok: false,
      count: 0,
      error: String(error?.message || error || "nearest_teleport_failed")
    };
  }
  return json(data, response.status);
}

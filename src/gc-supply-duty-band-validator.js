const XIVAPI_BASE = "https://v2.xivapi.com/api";
const VERIFY_TIMEOUT_MS = 4000;
const VERIFIED_CACHE_MS = 6 * 60 * 60 * 1000;
const FAILED_CACHE_MS = 60 * 1000;

const CRAFT_CODES = new Set(["CRP", "BSM", "ARM", "GSM", "LTW", "WVR", "ALC", "CUL"]);
const GATHER_CODES = new Set(["MIN", "BTN", "FSH"]);
const bandCache = new Map();

function normalizeCode(value) {
  return String(value || "").trim().toUpperCase();
}

function normalizeName(value) {
  return String(value || "")
    .normalize("NFKC")
    .replace(/[\s・･·'’`´ー―‐\-_.]/g, "")
    .toLowerCase();
}

function currentLevels(jobs, pageKind) {
  const allowed = pageKind === "crafting" ? CRAFT_CODES : pageKind === "gathering" ? GATHER_CODES : null;
  if (!allowed) return [];
  return [...new Set((Array.isArray(jobs) ? jobs : [])
    .filter(job => allowed.has(normalizeCode(job?.code)))
    .map(job => Math.floor(Number(job?.level)))
    .filter(level => Number.isInteger(level) && level > 0 && level <= 100))]
    .sort((a, b) => a - b);
}

function relationshipName(value) {
  if (!value || typeof value !== "object") return "";
  return String(value?.fields?.Name || value?.fields?.["Name@lang(ja)"] || "").trim();
}

export function extractSupplyDutyItems(payload) {
  const items = [];
  for (const row of Array.isArray(payload?.rows) ? payload.rows : []) {
    const level = Number(row?.row_id);
    const supplyData = Array.isArray(row?.fields?.SupplyData) ? row.fields.SupplyData : [];
    for (const group of supplyData) {
      const groupItems = Array.isArray(group?.Item) ? group.Item : [];
      for (const item of groupItems) {
        const name = relationshipName(item);
        if (!name) continue;
        items.push({ level, item_name: name });
      }
    }
  }
  const unique = new Map();
  for (const item of items) {
    const key = `${item.level}:${item.item_name}`;
    if (!unique.has(key)) unique.set(key, item);
  }
  return [...unique.values()];
}

function levenshtein(a, b) {
  const left = normalizeName(a);
  const right = normalizeName(b);
  if (left === right) return 0;
  if (!left) return right.length;
  if (!right) return left.length;
  const prev = Array.from({ length: right.length + 1 }, (_, i) => i);
  for (let i = 1; i <= left.length; i += 1) {
    const next = [i];
    for (let j = 1; j <= right.length; j += 1) {
      next[j] = Math.min(
        next[j - 1] + 1,
        prev[j] + 1,
        prev[j - 1] + (left[i - 1] === right[j - 1] ? 0 : 1)
      );
    }
    for (let j = 0; j < next.length; j += 1) prev[j] = next[j];
  }
  return prev[right.length];
}

export function resolveSupplyDutyName(rawName, candidates) {
  const source = String(rawName || "").trim();
  if (!source) return null;
  const rows = Array.isArray(candidates) ? candidates.filter(row => String(row?.item_name || "").trim()) : [];
  if (!rows.length) return null;
  const normalized = normalizeName(source);
  const exact = rows.find(row => normalizeName(row.item_name) === normalized);
  if (exact) return { ...exact, resolution: "gc_supply_level_exact", distance: 0 };

  const ranked = rows
    .map(row => ({ ...row, distance: levenshtein(source, row.item_name) }))
    .sort((a, b) => a.distance - b.distance || String(a.item_name).localeCompare(String(b.item_name), "ja"));
  const best = ranked[0];
  const second = ranked[1];
  const length = Math.max(normalized.length, normalizeName(best.item_name).length);
  const threshold = Math.max(1, Math.floor(length * 0.16));
  const clearMargin = !second || second.distance - best.distance >= 2;
  if (best.distance <= threshold && clearMargin) {
    return { ...best, resolution: "gc_supply_level_fuzzy" };
  }
  return null;
}

function cached(key) {
  const row = bandCache.get(key);
  if (!row || row.expires_at <= Date.now()) {
    if (row) bandCache.delete(key);
    return null;
  }
  return row.value;
}

function putCache(key, value, ok) {
  bandCache.set(key, {
    value,
    expires_at: Date.now() + (ok ? VERIFIED_CACHE_MS : FAILED_CACHE_MS)
  });
}

async function fetchSupplyDutyBand(levels, fetchImpl) {
  const key = levels.join(",");
  const existing = cached(key);
  if (existing) return existing;
  if (!levels.length) {
    const value = { ok: false, reason: "job_levels_unavailable", items: [] };
    putCache(key, value, false);
    return value;
  }

  const params = new URLSearchParams({
    rows: levels.join(","),
    fields: "SupplyData[].Item[].Name",
    language: "ja"
  });
  let response;
  try {
    response = await fetchImpl(`${XIVAPI_BASE}/sheet/GCSupplyDuty?${params.toString()}`, {
      headers: { "user-agent": "FF14Today/gc-supply-duty-band-validator" },
      signal: AbortSignal.timeout(VERIFY_TIMEOUT_MS),
      cf: { cacheEverything: true, cacheTtl: 21600 }
    });
  } catch {
    const value = { ok: false, reason: "xivapi_unreachable", items: [] };
    putCache(key, value, false);
    return value;
  }
  if (!response.ok) {
    const value = { ok: false, reason: `xivapi_http_${response.status}`, items: [] };
    putCache(key, value, false);
    return value;
  }
  let payload;
  try { payload = await response.json(); }
  catch {
    const value = { ok: false, reason: "xivapi_json", items: [] };
    putCache(key, value, false);
    return value;
  }
  const items = extractSupplyDutyItems(payload).filter(item => levels.includes(Number(item.level)));
  const value = items.length
    ? { ok: true, reason: null, items }
    : { ok: false, reason: "gc_supply_level_empty", items: [] };
  putCache(key, value, value.ok);
  return value;
}

function unresolvedRow(row, levels, reason) {
  const raw = String(row?.item_name_raw || row?.item_name || "").trim();
  return {
    ...row,
    item_name_raw: raw || undefined,
    item_name: "品名要確認",
    item_name_verified: false,
    item_name_resolution: "gc_supply_level_unverified",
    item_name_verification_error: reason || "gc_supply_level_unverified",
    gc_supply_level_verified: false,
    gc_supply_levels: levels
  };
}

export async function validateGrandCompanySupplyDutyDeliveries(deliveries, {
  jobs = [],
  pageKind,
  fetchImpl = fetch
} = {}) {
  const rows = Array.isArray(deliveries) ? deliveries : [];
  const levels = currentLevels(jobs, pageKind);
  const band = await fetchSupplyDutyBand(levels, fetchImpl);
  if (!band.ok) return rows.map(row => unresolvedRow(row, levels, band.reason));

  return rows.map(row => {
    const raw = String(row?.item_name_raw || row?.item_name || "").trim();
    const match = resolveSupplyDutyName(String(row?.item_name || raw), band.items);
    if (!match) return unresolvedRow(row, levels, "gc_supply_level_mismatch");
    const canonical = String(match.item_name || "").trim();
    return {
      ...row,
      item_name: canonical,
      ...(raw && raw !== canonical ? { item_name_raw: raw } : {}),
      item_name_verified: true,
      item_name_resolution: match.resolution,
      item_name_verification_error: undefined,
      gc_supply_level_verified: true,
      gc_supply_level: Number(match.level),
      gc_supply_levels: levels
    };
  });
}

export function relevantGrandCompanySupplyLevels(jobs, pageKind) {
  return currentLevels(jobs, pageKind);
}

const XIVAPI_BASE = "https://v2.xivapi.com/api";
const VERIFY_TIMEOUT_MS = 2500;
const VERIFIED_CACHE_MS = 6 * 60 * 60 * 1000;
const FAILED_CACHE_MS = 60 * 1000;

// Small, explicit OCR/Vision corrections that have been checked against the
// canonical FFXIV item name. Keep this list conservative: unknown names must
// remain visible and unverified instead of being guessed into another item.
const KNOWN_ITEM_ALIASES = new Map([
  ["オルコロクロマイト", "オルコクロマイト"]
]);

const verificationCache = new Map();

function cleanText(value, max = 160) {
  return String(value ?? "").replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
}

function positiveInt(value) {
  const n = Math.floor(Number(value));
  return Number.isInteger(n) && n > 0 ? n : null;
}

function queryEscape(value) {
  return String(value || "").replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

export function applyKnownGrandCompanyItemAlias(value) {
  const raw = cleanText(value);
  const canonical = KNOWN_ITEM_ALIASES.get(raw);
  if (!canonical) return { item_name: raw };
  return {
    item_name: canonical,
    item_name_raw: raw,
    item_name_verified: true,
    item_name_resolution: "known_alias"
  };
}

function cached(name) {
  const row = verificationCache.get(name);
  if (!row || row.expires_at <= Date.now()) {
    if (row) verificationCache.delete(name);
    return null;
  }
  return row.value;
}

function putCache(name, value, ok) {
  verificationCache.set(name, {
    value,
    expires_at: Date.now() + (ok ? VERIFIED_CACHE_MS : FAILED_CACHE_MS)
  });
}

async function exactJapaneseItem(name, fetchImpl) {
  const existing = cached(name);
  if (existing) return existing;

  const params = new URLSearchParams({
    sheets: "Item",
    fields: "Name,Name@lang(ja)",
    query: `Name@ja=\"${queryEscape(name)}\"`,
    limit: "8"
  });

  let response;
  try {
    response = await fetchImpl(`${XIVAPI_BASE}/search?${params.toString()}`, {
      headers: { "user-agent": "FF14Today/gc-item-name-canonicalizer" },
      signal: AbortSignal.timeout(VERIFY_TIMEOUT_MS),
      cf: { cacheEverything: true, cacheTtl: 21600 }
    });
  } catch {
    const value = { verified: false, reason: "xivapi_unreachable" };
    putCache(name, value, false);
    return value;
  }

  if (!response.ok) {
    const value = { verified: false, reason: `xivapi_http_${response.status}` };
    putCache(name, value, false);
    return value;
  }

  let data;
  try { data = await response.json(); }
  catch {
    const value = { verified: false, reason: "xivapi_json" };
    putCache(name, value, false);
    return value;
  }

  const exact = new Map();
  for (const result of data?.results || []) {
    const id = positiveInt(result?.row_id);
    if (!id) continue;
    const japanese = cleanText(result?.fields?.["Name@lang(ja)"]);
    const fallback = cleanText(result?.fields?.Name);
    if (japanese !== name && fallback !== name) continue;
    exact.set(id, { item_id: id, item_name: japanese || name });
  }

  if (exact.size !== 1) {
    const value = { verified: false, reason: exact.size > 1 ? "item_ambiguous" : "item_not_found" };
    putCache(name, value, false);
    return value;
  }

  const match = [...exact.values()][0];
  const value = { verified: true, ...match };
  putCache(name, value, true);
  return value;
}

export async function canonicalizeGrandCompanyDelivery(entry, { fetchImpl = fetch } = {}) {
  const row = { ...(entry || {}) };
  const rawName = cleanText(row.item_name);
  if (!rawName) return { ...row, item_name: rawName, item_name_verified: false, item_name_resolution: "unverified" };

  const known = applyKnownGrandCompanyItemAlias(rawName);
  if (known.item_name_resolution === "known_alias") {
    return {
      ...row,
      ...known,
      item_id: positiveInt(row.item_id)
    };
  }

  if (row.item_name_verified === true && positiveInt(row.item_id)) {
    return { ...row, item_name: rawName };
  }

  const match = await exactJapaneseItem(rawName, fetchImpl);
  if (!match.verified) {
    return {
      ...row,
      item_name: rawName,
      item_name_verified: false,
      item_name_resolution: "unverified",
      item_name_verification_error: match.reason || "unverified"
    };
  }

  const canonical = cleanText(match.item_name) || rawName;
  return {
    ...row,
    item_name: canonical,
    ...(canonical !== rawName ? { item_name_raw: rawName } : {}),
    item_id: match.item_id,
    item_name_verified: true,
    item_name_resolution: "exact"
  };
}

export async function canonicalizeGrandCompanyDeliveries(deliveries, options = {}) {
  const rows = Array.isArray(deliveries) ? deliveries : [];
  return Promise.all(rows.map(row => canonicalizeGrandCompanyDelivery(row, options)));
}

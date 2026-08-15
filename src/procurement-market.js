const XIVAPI_BASE = "https://v2.xivapi.com/api";
const UNIVERSALIS_BASE = "https://universalis.app/api/v2";
const DEFAULT_WORLD = "Chocobo";

function positiveInt(value) {
  const n = Math.floor(Number(value));
  return Number.isInteger(n) && n > 0 ? n : null;
}

function positivePrice(value) {
  const n = Math.round(Number(value));
  return Number.isFinite(n) && n > 0 ? n : null;
}

function normalizeText(value, max = 160) {
  return String(value ?? "").replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
}

function queryEscape(value) {
  return String(value || "").replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function containsJapanese(value) {
  return /[\u3040-\u30ff\u3400-\u9fff]/.test(String(value || ""));
}

function currentItemMap(data) {
  if (data?.items && typeof data.items === "object") return data.items;
  if (data?.itemID) return { [String(data.itemID)]: data };
  return {};
}

export function marketSnapshot(item, { itemId = null } = {}) {
  if (!item || typeof item !== "object") {
    return {
      item_id: positiveInt(itemId),
      min_nq: null,
      listing_average_nq: null,
      sale_average_nq: null,
      last_upload_time: null,
      recent_sales: 0
    };
  }
  const history = Array.isArray(item.recentHistory) ? item.recentHistory : [];
  const nqHistory = history.filter(row => !row?.hq && positivePrice(row?.pricePerUnit));
  return {
    item_id: positiveInt(item.itemID) || positiveInt(itemId),
    min_nq: positivePrice(item.minPriceNQ) || positivePrice(item.minPrice),
    listing_average_nq: positivePrice(item.currentAveragePriceNQ) || positivePrice(item.currentAveragePrice),
    sale_average_nq: positivePrice(item.averagePriceNQ) || positivePrice(item.averagePrice),
    last_upload_time: Number.isFinite(Number(item.lastUploadTime)) && Number(item.lastUploadTime) > 0 ? Number(item.lastUploadTime) : null,
    recent_sales: nqHistory.length
  };
}

export async function resolveItemIdByName(itemName, { fetchImpl = fetch } = {}) {
  const clean = normalizeText(itemName, 120);
  if (!clean) return null;
  const queries = containsJapanese(clean)
    ? [`Name@ja=\"${queryEscape(clean)}\"`, `Name=\"${queryEscape(clean)}\"`]
    : [`Name=\"${queryEscape(clean)}\"`, `Name@ja=\"${queryEscape(clean)}\"`];

  for (const query of queries) {
    const params = new URLSearchParams({
      sheets: "Item",
      fields: "Name,Name@lang(ja)",
      query,
      limit: "8"
    });
    let response;
    try {
      response = await fetchImpl(`${XIVAPI_BASE}/search?${params.toString()}`, {
        headers: { "user-agent": "FF14Today/procurement-market" },
        cf: { cacheEverything: true, cacheTtl: 604800 }
      });
    } catch {
      continue;
    }
    if (!response.ok) continue;
    let data;
    try { data = await response.json(); }
    catch { continue; }
    const matches = (data?.results || []).filter(result => {
      const english = normalizeText(result?.fields?.Name);
      const japanese = normalizeText(result?.fields?.["Name@lang(ja)"]);
      return clean === english || clean === japanese;
    });
    const unique = [...new Set(matches.map(row => positiveInt(row?.row_id)).filter(Boolean))];
    if (unique.length === 1) return unique[0];
  }
  return null;
}

export async function fetchMarketSnapshots(itemIds, { world = DEFAULT_WORLD, fetchImpl = fetch } = {}) {
  const ids = [...new Set((itemIds || []).map(positiveInt).filter(Boolean))].slice(0, 100);
  const snapshots = {};
  if (!ids.length) return snapshots;
  const response = await fetchImpl(
    `${UNIVERSALIS_BASE}/${encodeURIComponent(world)}/${ids.join(",")}?listings=20&entries=20`,
    { headers: { "user-agent": "FF14Today/procurement-market" } }
  );
  if (!response.ok) throw new Error(`Universalis HTTP ${response.status}`);
  const data = await response.json();
  const map = currentItemMap(data);
  for (const id of ids) snapshots[id] = marketSnapshot(map[String(id)] || map[id] || null, { itemId: id });
  return snapshots;
}

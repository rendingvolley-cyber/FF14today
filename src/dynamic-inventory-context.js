const XIVAPI_BASE = "https://v2.xivapi.com/api";
const MAX_DYNAMIC_ITEMS = 60;
let schemaReady = null;

function normalizeText(value, max = 160) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

function positiveInt(value) {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

export function japanDateKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  const get = type => parts.find(part => part.type === type)?.value || "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export async function ensureDynamicInventorySchema(env) {
  if (!schemaReady) {
    schemaReady = env.DB.batch([
      env.DB.prepare(`
        CREATE TABLE IF NOT EXISTS dynamic_recipe_item_context (
          profile_hash TEXT NOT NULL,
          observed_date TEXT NOT NULL,
          task_key TEXT NOT NULL,
          item_id INTEGER NOT NULL,
          display_name TEXT NOT NULL,
          english_name TEXT,
          japanese_name TEXT,
          resolved_at TEXT NOT NULL,
          PRIMARY KEY (profile_hash, observed_date, task_key, item_id)
        )
      `),
      env.DB.prepare(`
        CREATE INDEX IF NOT EXISTS idx_dynamic_recipe_item_context_profile
        ON dynamic_recipe_item_context(profile_hash, observed_date, resolved_at DESC)
      `)
    ]).catch(error => {
      schemaReady = null;
      throw error;
    });
  }
  return schemaReady;
}

async function fetchItemAliases(itemIds, fetchImpl = fetch) {
  const ids = [...new Set((itemIds || []).map(Number).filter(Number.isInteger))]
    .filter(id => id > 0)
    .slice(0, MAX_DYNAMIC_ITEMS);
  if (!ids.length) return [];
  const params = new URLSearchParams({
    fields: "Name,Name@lang(ja)",
    rows: ids.join(",")
  });
  const response = await fetchImpl(`${XIVAPI_BASE}/sheet/Item?${params.toString()}`, {
    headers: { "user-agent": "FF14Today/1.9.4 dynamic-inventory-context" },
    cf: { cacheEverything: true, cacheTtl: 604800 }
  });
  if (!response.ok) throw new Error(`XIVAPI HTTP ${response.status}`);
  const data = await response.json();
  return (data?.rows || []).map(row => {
    const itemId = positiveInt(row?.row_id);
    const english = normalizeText(row?.fields?.Name);
    const japanese = normalizeText(row?.fields?.["Name@lang(ja)"]);
    if (!itemId || (!english && !japanese)) return null;
    return {
      item_id: itemId,
      display_name: english || japanese,
      english_name: english || null,
      japanese_name: japanese || null
    };
  }).filter(Boolean);
}

export async function rememberDynamicRecipeItems(env, profileHash, taskKey, itemIds, { fetchImpl = fetch } = {}) {
  const cleanTaskKey = normalizeText(taskKey, 120);
  if (!profileHash || !/^craft:[A-Za-z0-9:_-]{1,110}$/.test(cleanTaskKey)) return 0;
  const aliases = await fetchItemAliases(itemIds, fetchImpl);
  if (!aliases.length) return 0;
  await ensureDynamicInventorySchema(env);
  const observedDate = japanDateKey();
  const resolvedAt = new Date().toISOString();
  await env.DB.batch(aliases.map(row => env.DB.prepare(`
    INSERT INTO dynamic_recipe_item_context (
      profile_hash, observed_date, task_key, item_id, display_name,
      english_name, japanese_name, resolved_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(profile_hash, observed_date, task_key, item_id) DO UPDATE SET
      display_name=excluded.display_name,
      english_name=excluded.english_name,
      japanese_name=excluded.japanese_name,
      resolved_at=excluded.resolved_at
  `).bind(
    profileHash,
    observedDate,
    cleanTaskKey,
    row.item_id,
    row.display_name,
    row.english_name,
    row.japanese_name,
    resolvedAt
  )));
  return aliases.length;
}

export async function loadDynamicAliasRows(env, profileHash) {
  if (!profileHash) return [];
  await ensureDynamicInventorySchema(env);
  const result = await env.DB.prepare(`
    SELECT item_id, display_name, english_name, japanese_name, MAX(resolved_at) AS resolved_at
    FROM dynamic_recipe_item_context
    WHERE profile_hash=? AND observed_date=?
    GROUP BY item_id, display_name, english_name, japanese_name
    ORDER BY resolved_at DESC
    LIMIT ?
  `).bind(profileHash, japanDateKey(), MAX_DYNAMIC_ITEMS).all();
  return (result.results || []).map(row => ({
    item_id: positiveInt(row.item_id),
    display_name: normalizeText(row.display_name),
    english_name: normalizeText(row.english_name) || null,
    japanese_name: normalizeText(row.japanese_name) || null,
    resolved_at: row.resolved_at || null
  })).filter(row => row.item_id && (row.english_name || row.japanese_name || row.display_name));
}

export function resolveVisibleInventoryRows(items, aliasRows) {
  const aliasMap = new Map();
  for (const row of aliasRows || []) {
    for (const alias of [row.english_name, row.japanese_name, row.display_name]) {
      const clean = normalizeText(alias);
      if (!clean || aliasMap.has(clean)) continue;
      aliasMap.set(clean, row);
    }
  }
  const resolved = [];
  for (const item of items || []) {
    const visibleName = normalizeText(item?.item_name);
    const match = aliasMap.get(visibleName);
    if (!match) continue;
    const quantity = Number(item?.quantity);
    const hqQuantity = item?.hq_quantity == null ? null : Number(item.hq_quantity);
    const confidence = Number(item?.confidence || 0);
    if (!Number.isInteger(quantity) || quantity < 0 || confidence < 0.7) continue;
    resolved.push({
      item_id: match.item_id,
      item_name: visibleName,
      quantity,
      hq_quantity: Number.isInteger(hqQuantity) && hqQuantity >= 0 ? hqQuantity : null,
      confidence
    });
  }
  return resolved;
}

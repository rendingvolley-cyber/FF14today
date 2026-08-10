import { allowedLeveInventoryItemIds, mergeResolvedInventoryRows } from "./inventory-context.js";

let schemaReady = null;
let allowedNameMapPromise = null;

export async function sha256Hex(value) {
  const bytes = typeof value === "string" ? new TextEncoder().encode(value) : value;
  const buffer = bytes instanceof ArrayBuffer
    ? bytes
    : bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, "0")).join("");
}

export async function profileHashFromRequest(request) {
  const token = request.headers.get("x-profile-token") || "";
  if (!/^[A-Za-z0-9_-]{43,128}$/.test(token)) return null;
  return sha256Hex(token);
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

export async function ensureInventorySchema(env) {
  if (!schemaReady) {
    schemaReady = env.DB.batch([
      env.DB.prepare(`
        CREATE TABLE IF NOT EXISTS inventory_item_context (
          profile_hash TEXT NOT NULL,
          observed_date TEXT NOT NULL,
          item_id INTEGER NOT NULL,
          item_name TEXT NOT NULL,
          quantity INTEGER NOT NULL,
          hq_quantity INTEGER,
          confidence REAL NOT NULL,
          observed_at TEXT NOT NULL,
          source TEXT NOT NULL DEFAULT 'clipboard_image',
          PRIMARY KEY (profile_hash, observed_date, item_id)
        )
      `),
      env.DB.prepare(`
        CREATE INDEX IF NOT EXISTS idx_inventory_context_time
        ON inventory_item_context(profile_hash, observed_date, observed_at DESC)
      `)
    ]).catch(error => {
      schemaReady = null;
      throw error;
    });
  }
  return schemaReady;
}

function normalizeVisibleName(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

async function loadAllowedItemNameMap() {
  if (allowedNameMapPromise) return allowedNameMapPromise;
  allowedNameMapPromise = (async () => {
    const ids = [...allowedLeveInventoryItemIds()].sort((a, b) => a - b);
    if (!ids.length) return new Map();
    const params = new URLSearchParams({
      fields: "Name,Name@lang(ja)",
      rows: ids.join(",")
    });
    const response = await fetch(`https://v2.xivapi.com/api/sheet/Item?${params.toString()}`, {
      headers: { "user-agent": "FF14Today/1.9.1 inventory-evidence" }
    });
    if (!response.ok) throw new Error(`XIVAPI HTTP ${response.status}`);
    const data = await response.json();
    const map = new Map();
    for (const row of data?.rows || []) {
      const itemId = Number(row?.row_id);
      if (!Number.isInteger(itemId) || !allowedLeveInventoryItemIds().has(itemId)) continue;
      const english = normalizeVisibleName(row?.fields?.Name);
      const japanese = normalizeVisibleName(row?.fields?.["Name@lang(ja)"]);
      for (const name of [english, japanese]) {
        if (!name) continue;
        map.set(name, { item_id: itemId, item_name: name });
      }
    }
    return map;
  })().catch(error => {
    allowedNameMapPromise = null;
    throw error;
  });
  return allowedNameMapPromise;
}

export async function resolveInventoryRows(items) {
  let nameMap;
  try { nameMap = await loadAllowedItemNameMap(); }
  catch { return []; }
  const rows = [];
  for (const item of Array.isArray(items) ? items : []) {
    const visibleName = normalizeVisibleName(item.item_name);
    const resolved = nameMap.get(visibleName);
    if (!resolved) continue;
    rows.push({
      ...item,
      ...resolved,
      item_name: visibleName
    });
  }
  return mergeResolvedInventoryRows(rows);
}

export async function storeInventoryRows(env, profileHash, rows) {
  const merged = mergeResolvedInventoryRows(rows);
  if (!profileHash || !merged.length) return 0;
  await ensureInventorySchema(env);
  const date = japanDateKey();
  const observedAt = new Date().toISOString();
  await env.DB.batch(merged.map(row => env.DB.prepare(`
    INSERT INTO inventory_item_context (
      profile_hash, observed_date, item_id, item_name, quantity,
      hq_quantity, confidence, observed_at, source
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'clipboard_image')
    ON CONFLICT(profile_hash, observed_date, item_id) DO UPDATE SET
      item_name=excluded.item_name,
      quantity=excluded.quantity,
      hq_quantity=excluded.hq_quantity,
      confidence=excluded.confidence,
      observed_at=excluded.observed_at,
      source=excluded.source
  `).bind(
    profileHash,
    date,
    row.item_id,
    row.item_name,
    row.quantity,
    row.hq_quantity,
    row.confidence,
    observedAt
  )));
  return merged.length;
}

export async function loadInventoryEvidence(env, profileHash) {
  if (!profileHash) return { items: {}, rows: [], observedAt: null };
  await ensureInventorySchema(env);
  const result = await env.DB.prepare(`
    SELECT item_id, item_name, quantity, hq_quantity, confidence, observed_at
    FROM inventory_item_context
    WHERE profile_hash=? AND observed_date=?
    ORDER BY observed_at DESC, item_id ASC
    LIMIT 200
  `).bind(profileHash, japanDateKey()).all();
  const rows = (result.results || []).map(row => ({
    item_id: Number(row.item_id),
    item_name: row.item_name,
    quantity: Math.max(0, Number(row.quantity) || 0),
    hq_quantity: row.hq_quantity == null ? null : Math.max(0, Number(row.hq_quantity) || 0),
    confidence: Number(row.confidence || 0),
    observed_at: row.observed_at
  }));
  const items = {};
  for (const row of rows) {
    items[row.item_id] = {
      quantity: row.quantity,
      hq_quantity: row.hq_quantity,
      item_name: row.item_name
    };
  }
  const observedAt = rows.map(row => row.observed_at).filter(Boolean).sort().at(-1) || null;
  return { items, rows, observedAt };
}

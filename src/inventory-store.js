import { allowedLeveInventoryItemIds, mergeResolvedInventoryRows } from "./inventory-context.js";

let schemaReady = null;
const resolutionCache = new Map();

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

function escapeQueryString(value) {
  return String(value || "").replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

async function searchExactItemName(name, language) {
  const clean = String(name || "").trim();
  if (!clean) return null;
  const cacheKey = `${language}:${clean.toLocaleLowerCase(language === "ja" ? "ja-JP" : "en-US")}`;
  if (resolutionCache.has(cacheKey)) return resolutionCache.get(cacheKey);

  const clause = language === "ja"
    ? `Name@ja="${escapeQueryString(clean)}"`
    : `Name="${escapeQueryString(clean)}"`;
  const params = new URLSearchParams({
    sheets: "Item",
    fields: "Name",
    language,
    query: clause,
    limit: "5"
  });
  let resolved = null;
  try {
    const response = await fetch(`https://v2.xivapi.com/api/search?${params.toString()}`, {
      headers: { "user-agent": "FF14Today/1.9.1 inventory-evidence" }
    });
    if (response.ok) {
      const data = await response.json();
      const allowed = allowedLeveInventoryItemIds();
      for (const result of data?.results || []) {
        const itemId = Number(result?.row_id);
        const resultName = String(result?.fields?.Name || "").trim();
        if (!allowed.has(itemId)) continue;
        if (resultName !== clean) continue;
        resolved = { item_id: itemId, item_name: resultName };
        break;
      }
    }
  } catch {}
  resolutionCache.set(cacheKey, resolved);
  return resolved;
}

export async function resolveInventoryRows(items) {
  const rows = [];
  for (const item of Array.isArray(items) ? items : []) {
    let resolved = await searchExactItemName(item.item_name, "ja");
    if (!resolved) resolved = await searchExactItemName(item.item_name, "en");
    if (!resolved) continue;
    rows.push({
      ...item,
      ...resolved
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

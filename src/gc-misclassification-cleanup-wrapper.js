import app from "./leve-cost-wrapper.js";

function jsonResponse(data, response) {
  const headers = new Headers(response.headers);
  headers.set("content-type", "application/json; charset=utf-8");
  headers.delete("content-length");
  return new Response(JSON.stringify(data, null, 2), {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}

async function sha256Hex(value) {
  const bytes = typeof value === "string" ? new TextEncoder().encode(value) : value;
  const buffer = bytes instanceof ArrayBuffer
    ? bytes
    : bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, "0")).join("");
}

async function profileHashFromRequest(request) {
  const token = request.headers.get("x-profile-token") || "";
  if (!/^[A-Za-z0-9_-]{43,128}$/.test(token)) return null;
  return sha256Hex(token);
}

export function genericPayloadForCachedAnalysis(analysis) {
  if (!analysis || typeof analysis !== "object") return null;
  return {
    page_type: analysis.page_type,
    journal_entries: Array.isArray(analysis.journal_entries) ? analysis.journal_entries : [],
    crafter_stats: analysis.crafter_stats ?? null,
    gatherer_stats: analysis.gatherer_stats ?? null,
    model: analysis.model
  };
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
}

export function sameJsonValue(left, right) {
  return JSON.stringify(canonical(left)) === JSON.stringify(canonical(right));
}

async function ensureGenericContextTables(env) {
  await env.DB.batch([
    env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS decision_context (
        profile_hash TEXT NOT NULL,
        context_type TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        confidence REAL NOT NULL,
        observed_at TEXT NOT NULL,
        source TEXT NOT NULL DEFAULT 'clipboard_image',
        PRIMARY KEY (profile_hash, context_type)
      )
    `),
    env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS decision_context_image_cache (
        profile_hash TEXT NOT NULL,
        image_sha256 TEXT NOT NULL,
        analysis_json TEXT NOT NULL,
        observed_at TEXT NOT NULL,
        PRIMARY KEY (profile_hash, image_sha256)
      )
    `)
  ]);
}

async function removeMatchingJournalMisclassification(env, profileHash, imageSha) {
  if (!env?.DB || !profileHash || !imageSha) return false;
  try {
    await ensureGenericContextTables(env);
    const cachedRow = await env.DB.prepare(`
      SELECT analysis_json
      FROM decision_context_image_cache
      WHERE profile_hash=? AND image_sha256=?
      LIMIT 1
    `).bind(profileHash, imageSha).first();
    if (!cachedRow?.analysis_json) return false;

    let cachedAnalysis;
    try { cachedAnalysis = JSON.parse(cachedRow.analysis_json); }
    catch { return false; }
    if (cachedAnalysis?.page_type !== "journal") return false;

    const currentRow = await env.DB.prepare(`
      SELECT payload_json, source
      FROM decision_context
      WHERE profile_hash=? AND context_type='journal'
      LIMIT 1
    `).bind(profileHash).first();
    if (!currentRow?.payload_json || currentRow.source !== "clipboard_image") return false;

    let currentPayload;
    try { currentPayload = JSON.parse(currentRow.payload_json); }
    catch { return false; }
    const cachedPayload = genericPayloadForCachedAnalysis(cachedAnalysis);
    if (!sameJsonValue(currentPayload, cachedPayload)) return false;

    const reclassified = {
      page_type: "unknown",
      confidence: 0,
      model: "gc-reclassified",
      journal_entries: [],
      crafter_stats: null,
      gatherer_stats: null
    };
    await env.DB.batch([
      env.DB.prepare(`
        DELETE FROM decision_context
        WHERE profile_hash=? AND context_type='journal' AND source='clipboard_image'
      `).bind(profileHash),
      env.DB.prepare(`
        UPDATE decision_context_image_cache
        SET analysis_json=?, observed_at=?
        WHERE profile_hash=? AND image_sha256=?
      `).bind(JSON.stringify(reclassified), new Date().toISOString(), profileHash, imageSha)
    ]);
    return true;
  } catch {
    return false;
  }
}

async function gcPasteIdentity(request) {
  const contentType = request.headers.get("content-type") || "";
  if (!contentType.includes("multipart/form-data")) return null;
  let form;
  try { form = await request.clone().formData(); }
  catch { return null; }
  if (String(form.get("workflow_context") || "") !== "grand-company") return null;
  const file = form.get("image");
  if (!(file instanceof File) || file.size <= 0) return null;
  const [profileHash, imageSha] = await Promise.all([
    profileHashFromRequest(request),
    file.arrayBuffer().then(sha256Hex)
  ]);
  return profileHash && imageSha ? { profileHash, imageSha } : null;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname !== "/api/context/image" || request.method !== "POST") {
      return app.fetch(request, env);
    }

    const identity = await gcPasteIdentity(request);
    if (!identity) return app.fetch(request, env);

    const response = await app.fetch(request, env);
    if (!response.ok || !(response.headers.get("content-type") || "").includes("application/json")) return response;
    let data;
    try { data = await response.clone().json(); }
    catch { return response; }
    if (data?.analysis?.page_type !== "grand_company_deliveries" || !data?.grand_company_context_saved) return response;

    const removed = await removeMatchingJournalMisclassification(env, identity.profileHash, identity.imageSha);
    if (!removed) return response;
    return jsonResponse({ ...data, misclassified_context_removed: true }, response);
  }
};

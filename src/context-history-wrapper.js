import app from "./single-user.js";

const JOURNAL_MAX_AGE_MS = 24 * 60 * 60 * 1000;
let historySchemaReady = null;

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

function subjectKeyFor(analysis) {
  if (analysis?.page_type === "crafter_stats") {
    return String(analysis?.crafter_stats?.job_name || "unknown").trim().normalize("NFKC").toLocaleLowerCase("ja-JP");
  }
  if (analysis?.page_type === "gatherer_stats") {
    return String(analysis?.gatherer_stats?.job_name || "unknown").trim().normalize("NFKC").toLocaleLowerCase("ja-JP");
  }
  return analysis?.page_type === "journal" ? "journal" : "unknown";
}

async function ensureHistorySchema(env) {
  if (!historySchemaReady) {
    historySchemaReady = (async () => {
      await env.DB.prepare(`
        CREATE TABLE IF NOT EXISTS decision_context_history (
          snapshot_key TEXT PRIMARY KEY,
          profile_hash TEXT NOT NULL,
          context_type TEXT NOT NULL,
          subject_key TEXT NOT NULL DEFAULT '',
          payload_json TEXT NOT NULL,
          confidence REAL NOT NULL,
          observed_at TEXT NOT NULL,
          image_sha256 TEXT,
          source TEXT NOT NULL DEFAULT 'clipboard_image'
        )
      `).run();
      await env.DB.prepare(`
        CREATE INDEX IF NOT EXISTS idx_decision_context_history_profile_type_time
        ON decision_context_history(profile_hash, context_type, observed_at DESC)
      `).run();
      await env.DB.prepare(`
        CREATE INDEX IF NOT EXISTS idx_decision_context_history_subject
        ON decision_context_history(profile_hash, context_type, subject_key, observed_at DESC)
      `).run();
      await env.DB.prepare(`
        INSERT OR IGNORE INTO decision_context_history (
          snapshot_key, profile_hash, context_type, subject_key, payload_json,
          confidence, observed_at, image_sha256, source
        )
        SELECT
          'legacy:' || profile_hash || ':' || context_type || ':' || observed_at,
          profile_hash, context_type, '', payload_json, confidence, observed_at, NULL,
          'v1.4_latest_backfill'
        FROM decision_context
      `).run();
    })().catch(error => {
      historySchemaReady = null;
      throw error;
    });
  }
  return historySchemaReady;
}

function dedupeJournalEntries(rows) {
  const seen = new Set();
  const entries = [];
  for (const row of rows) {
    let payload;
    try { payload = JSON.parse(row.payload_json); }
    catch { continue; }
    for (const entry of Array.isArray(payload?.journal_entries) ? payload.journal_entries : []) {
      const title = String(entry?.title || "").trim();
      if (!title) continue;
      const key = [title, entry?.objective || "", entry?.location || ""].join("|").normalize("NFKC").toLocaleLowerCase("ja-JP");
      if (seen.has(key)) continue;
      seen.add(key);
      entries.push(entry);
      if (entries.length >= 60) return entries;
    }
  }
  return entries;
}

async function rebuildJournalLatest(env, profileHash) {
  const cutoff = new Date(Date.now() - JOURNAL_MAX_AGE_MS).toISOString();
  const result = await env.DB.prepare(`
    SELECT payload_json, confidence, observed_at
    FROM decision_context_history
    WHERE profile_hash=? AND context_type='journal' AND observed_at>=?
    ORDER BY observed_at DESC
    LIMIT 30
  `).bind(profileHash, cutoff).all();
  const rows = result.results || [];
  if (!rows.length) return 0;
  const journalEntries = dedupeJournalEntries(rows);
  const latestObservedAt = rows[0].observed_at;
  const confidence = Math.max(...rows.map(row => Number(row.confidence) || 0));
  const payload = {
    page_type: "journal",
    journal_entries: journalEntries,
    crafter_stats: null,
    gatherer_stats: null,
    model: "context-history-merge-v1.4.1"
  };
  await env.DB.prepare(`
    INSERT INTO decision_context (profile_hash, context_type, payload_json, confidence, observed_at, source)
    VALUES (?, 'journal', ?, ?, ?, 'clipboard_history_merge')
    ON CONFLICT(profile_hash, context_type) DO UPDATE SET
      payload_json=excluded.payload_json,
      confidence=excluded.confidence,
      observed_at=excluded.observed_at,
      source=excluded.source
  `).bind(profileHash, JSON.stringify(payload), confidence, latestObservedAt).run();
  return journalEntries.length;
}

async function imageShaFromRequest(request) {
  try {
    const form = await request.formData();
    const file = form.get("image");
    if (!(file instanceof File)) return null;
    return sha256Hex(await file.arrayBuffer());
  } catch {
    return null;
  }
}

async function saveSnapshot(env, profileHash, imageSha, analysis) {
  if (!profileHash || !analysis || analysis.page_type === "unknown" || Number(analysis.confidence || 0) < 0.6) {
    return { saved: false, count: 0, journalEntries: 0 };
  }
  await ensureHistorySchema(env);
  const observedAt = new Date().toISOString();
  const subjectKey = subjectKeyFor(analysis);
  const snapshotKey = imageSha
    ? `${profileHash}:${imageSha}`
    : `${profileHash}:${analysis.page_type}:${subjectKey}:${observedAt}`;
  await env.DB.prepare(`
    INSERT OR IGNORE INTO decision_context_history (
      snapshot_key, profile_hash, context_type, subject_key, payload_json,
      confidence, observed_at, image_sha256, source
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'clipboard_image')
  `).bind(
    snapshotKey,
    profileHash,
    analysis.page_type,
    subjectKey,
    JSON.stringify(analysis),
    Number(analysis.confidence || 0),
    observedAt,
    imageSha
  ).run();

  const countRow = await env.DB.prepare(`
    SELECT COUNT(*) AS n FROM decision_context_history WHERE profile_hash=?
  `).bind(profileHash).first();
  const journalEntries = analysis.page_type === "journal"
    ? await rebuildJournalLatest(env, profileHash)
    : 0;
  return {
    saved: true,
    count: Number(countRow?.n || 0),
    journalEntries
  };
}

async function prepareHistoryForPlan(env, request) {
  const profileHash = await profileHashFromRequest(request);
  if (!profileHash) return;
  await ensureHistorySchema(env);
  await rebuildJournalLatest(env, profileHash);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/context/image" && request.method === "POST") {
      const delegatedRequest = request.clone();
      const [profileHash, imageSha] = await Promise.all([
        profileHashFromRequest(request),
        imageShaFromRequest(request.clone())
      ]);
      const response = await app.fetch(delegatedRequest, env);
      if (!response.ok || !(response.headers.get("content-type") || "").includes("application/json")) return response;
      let data;
      try { data = await response.clone().json(); }
      catch { return response; }
      const history = await saveSnapshot(env, profileHash, imageSha, data?.analysis);
      return json({
        ...data,
        context_history_saved: history.saved,
        context_history_count: history.count,
        journal_entries_available: history.journalEntries || undefined,
        persistence: "history"
      }, response.status);
    }

    if (url.pathname === "/api/plan" && request.method === "POST") {
      await prepareHistoryForPlan(env, request);
    }

    if (url.pathname === "/api/context/history" && request.method === "GET") {
      const profileHash = await profileHashFromRequest(request);
      if (!profileHash) return json({ error: "プロフィールを確認できません。" }, 401);
      await ensureHistorySchema(env);
      const result = await env.DB.prepare(`
        SELECT context_type, subject_key, confidence, observed_at, source
        FROM decision_context_history
        WHERE profile_hash=?
        ORDER BY observed_at DESC
        LIMIT 100
      `).bind(profileHash).all();
      return json({ ok: true, count: result.results?.length || 0, items: result.results || [] });
    }

    return app.fetch(request, env);
  }
};

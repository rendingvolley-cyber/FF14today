const PARSER_VERSION = "lodestone-achievements-v0.6";
const CACHE_MS = 6 * 60 * 60 * 1000;
const PAGE_CONCURRENCY = 5;

const HEADERS = {
  "accept-language": "ja-JP,ja;q=0.9",
  "user-agent": "FF14-Today/0.6 personal-achievement-sync"
};

async function collectText(response, selector) {
  const values = [];
  let current = null;
  class Handler {
    element() {
      current = [];
      values.push(current);
    }
    text(text) {
      if (current) current.push(text.text);
    }
  }
  await new HTMLRewriter().on(selector, new Handler()).transform(response).arrayBuffer();
  return values.map(parts => parts.join("").replace(/\s+/g, " ").trim());
}

async function collectAttribute(response, selector, attribute) {
  const values = [];
  class Handler {
    element(element) {
      values.push(element.getAttribute(attribute) || "");
    }
  }
  await new HTMLRewriter().on(selector, new Handler()).transform(response).arrayBuffer();
  return values;
}

function parseIntLoose(value) {
  const match = String(value || "").replace(/,/g, "").match(/\d+/);
  return match ? Number.parseInt(match[0], 10) : null;
}

function extractAchievementName(activityText) {
  const text = String(activityText || "").trim();
  const jp = text.match(/[「“\"]([^」”\"]+)[」”\"]/);
  if (jp) return jp[1].trim();
  return text.replace(/を達成しました。?$/, "").trim();
}

function parseTimestamp(scriptText) {
  const match = String(scriptText || "").match(/ldst_strftime\((\d+)/);
  return match ? Number.parseInt(match[1], 10) : null;
}

function parsePageInfo(text) {
  const values = String(text || "").match(/\d+/g) || [];
  if (values.length < 2) return { current_page: 1, page_total: 1 };
  return {
    current_page: Number.parseInt(values[0], 10),
    page_total: Number.parseInt(values[1], 10)
  };
}

async function parseAchievementPage(response) {
  const [hrefs, activities, scripts, totals, points, pageInfos] = await Promise.all([
    collectAttribute(response.clone(), ".ldst__achievement .entry .entry__achievement", "href"),
    collectText(response.clone(), ".ldst__achievement .entry .entry__activity__txt"),
    collectText(response.clone(), ".ldst__achievement .entry .entry__activity__time > script"),
    collectText(response.clone(), ".ldst__achievement .parts__total"),
    collectText(response.clone(), ".ldst__achievement .achievement__point"),
    collectText(response.clone(), ".ldst__achievement ul.btn__pager:nth-child(2) > li:nth-child(3)")
  ]);

  const entries = [];
  for (let i = 0; i < hrefs.length; i += 1) {
    const idMatch = hrefs[i].match(/\/achievement\/detail\/(\d+)\//);
    if (!idMatch) continue;
    const activityText = activities[i] || "";
    const timestamp = parseTimestamp(scripts[i] || "");
    entries.push({
      achievement_id: Number.parseInt(idMatch[1], 10),
      name: extractAchievementName(activityText),
      achieved_at_unix: timestamp,
      achieved_at: timestamp ? new Date(timestamp * 1000).toISOString() : null,
      activity_text: activityText
    });
  }

  const page = parsePageInfo(pageInfos[0]);
  return {
    entries,
    total_achievements: parseIntLoose(totals[0]),
    achievement_points: parseIntLoose(points[0]),
    current_page: page.current_page,
    page_total: page.page_total
  };
}

function achievementUrl(lodestoneId, page = 1) {
  const suffix = page > 1 ? `?page=${page}` : "";
  return `https://jp.finalfantasyxiv.com/lodestone/character/${lodestoneId}/achievement/${suffix}`;
}

async function fetchPage(lodestoneId, page) {
  const response = await fetch(achievementUrl(lodestoneId, page), { headers: HEADERS });
  if (!response.ok) throw new Error(`Lodestone achievement HTTP ${response.status} on page ${page}`);
  return parseAchievementPage(response);
}

async function ensureTable(env) {
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS lodestone_achievement_state (
      lodestone_id TEXT PRIMARY KEY,
      total_achievements INTEGER NOT NULL,
      achievement_points INTEGER,
      page_total INTEGER NOT NULL,
      history_json TEXT NOT NULL,
      synced_at TEXT NOT NULL,
      parser_version TEXT NOT NULL
    )
  `).run();
}

async function readCached(env, lodestoneId) {
  await ensureTable(env);
  const row = await env.DB.prepare(`
    SELECT * FROM lodestone_achievement_state WHERE lodestone_id=? LIMIT 1
  `).bind(lodestoneId).first();
  if (!row) return null;
  return {
    lodestone_id: row.lodestone_id,
    total_achievements: Number(row.total_achievements),
    achievement_points: row.achievement_points == null ? null : Number(row.achievement_points),
    page_total: Number(row.page_total),
    history: JSON.parse(row.history_json),
    synced_at: row.synced_at,
    parser_version: row.parser_version,
    cached: true
  };
}

function isFresh(state) {
  if (!state?.synced_at) return false;
  const age = Date.now() - new Date(state.synced_at).getTime();
  return Number.isFinite(age) && age >= 0 && age < CACHE_MS;
}

async function writeState(env, state) {
  await env.DB.prepare(`
    INSERT INTO lodestone_achievement_state (
      lodestone_id, total_achievements, achievement_points, page_total,
      history_json, synced_at, parser_version
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(lodestone_id) DO UPDATE SET
      total_achievements=excluded.total_achievements,
      achievement_points=excluded.achievement_points,
      page_total=excluded.page_total,
      history_json=excluded.history_json,
      synced_at=excluded.synced_at,
      parser_version=excluded.parser_version
  `).bind(
    state.lodestone_id,
    state.total_achievements,
    state.achievement_points,
    state.page_total,
    JSON.stringify(state.history),
    state.synced_at,
    state.parser_version
  ).run();
}

export async function getLodestoneAchievementState(env, lodestoneId) {
  return readCached(env, String(lodestoneId));
}

export async function syncLodestoneAchievements(env, lodestoneId, { force = false } = {}) {
  const id = String(lodestoneId);
  const cached = await readCached(env, id);
  if (!force && isFresh(cached)) return cached;

  const first = await fetchPage(id, 1);
  if (!Number.isInteger(first.total_achievements) || first.total_achievements < 0) {
    throw new Error("Lodestone achievement parser failed: total achievements not found.");
  }
  if (!Number.isInteger(first.page_total) || first.page_total < 1 || first.page_total > 100) {
    throw new Error("Lodestone achievement parser failed: invalid page count.");
  }

  const pages = [first];
  const pageNumbers = Array.from({ length: Math.max(0, first.page_total - 1) }, (_, i) => i + 2);
  for (let i = 0; i < pageNumbers.length; i += PAGE_CONCURRENCY) {
    const chunk = pageNumbers.slice(i, i + PAGE_CONCURRENCY);
    const parsed = await Promise.all(chunk.map(page => fetchPage(id, page)));
    pages.push(...parsed);
  }

  const byId = new Map();
  for (const page of pages) {
    for (const entry of page.entries) byId.set(entry.achievement_id, entry);
  }
  const history = [...byId.values()].sort((a, b) => (b.achieved_at_unix || 0) - (a.achieved_at_unix || 0));

  if (history.length !== first.total_achievements) {
    throw new Error(`Lodestone achievement parser failed closed: expected ${first.total_achievements}, parsed ${history.length}.`);
  }

  const state = {
    lodestone_id: id,
    total_achievements: first.total_achievements,
    achievement_points: first.achievement_points,
    page_total: first.page_total,
    history,
    synced_at: new Date().toISOString(),
    parser_version: PARSER_VERSION,
    cached: false
  };
  await writeState(env, state);
  return state;
}

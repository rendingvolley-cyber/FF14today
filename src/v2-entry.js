import legacySingleUserApp from "./single-user.js";
import {
  getLodestoneAchievementState,
  syncLodestoneAchievements
} from "./lodestone-achievements.js";
import { buildTimedGatheringRows } from "./time-sensitive-game-windows.js";
import {
  buildBigFishRows,
  parseFishTrackerData
} from "./task-board-live-catalog.js";

const OWNER_LODESTONE_ID = "3091607";
const XIVAPI_BASE = "https://v2.xivapi.com/api";
const FISH_DATA_URL = "https://raw.githubusercontent.com/icykoneko/ff14-fish-tracker-app/master/js/app/data.js";
const CACHE_MS = 6 * 60 * 60 * 1000;

let achievementCatalogCache = { loadedAt: 0, rows: null };
let fishCache = { loadedAt: 0, data: null, error: null };

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

async function ownerCharacter(env) {
  try {
    const row = await env.DB.prepare(`
      SELECT lodestone_id, lodestone_url, name, world, data_center, jobs_json,
             bozja_rank, synced_at, parser_version
      FROM character_state
      WHERE lodestone_id=?
      LIMIT 1
    `).bind(OWNER_LODESTONE_ID).first();
    if (!row) return null;
    return {
      lodestone_id: row.lodestone_id,
      lodestone_url: row.lodestone_url,
      name: row.name,
      world: row.world,
      data_center: row.data_center,
      jobs: JSON.parse(row.jobs_json || "[]"),
      bozja_rank: row.bozja_rank,
      synced_at: row.synced_at,
      parser_version: row.parser_version
    };
  } catch {
    return null;
  }
}

function jobLevel(character, code) {
  const row = (character?.jobs || []).find(job => String(job?.code || "").toUpperCase() === code);
  const value = Number(row?.level || 0);
  return Number.isFinite(value) ? value : 0;
}

function normalizeText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function achievementDistanceScore(name, description) {
  const text = `${normalizeText(name)} ${normalizeText(description)}`;
  const values = [...text.matchAll(/([0-9][0-9,]*)\s*(?:回|個|体|匹|種類|勝|件|回達成|回クリア)/g)]
    .map(match => Number(String(match[1]).replace(/,/g, "")))
    .filter(value => Number.isFinite(value) && value > 0);
  let score = values.length ? Math.min(...values) : 25;
  if (/初めて|初回|1回|ひとつ|クエストをコンプリート/.test(text)) score -= 12;
  if (/累計|合計|通算/.test(text)) score += Math.min(500, Math.max(...values, 50));
  if (/1000|1,000|5000|5,000|10000|10,000/.test(text)) score += 1000;
  return Math.max(0, score);
}

async function loadAchievementCatalog(nowMs = Date.now()) {
  if (achievementCatalogCache.rows && nowMs - achievementCatalogCache.loadedAt < CACHE_MS) {
    return achievementCatalogCache.rows;
  }

  const rows = [];
  let after = -1;
  const limit = 500;
  for (let page = 0; page < 12; page += 1) {
    const params = new URLSearchParams({
      fields: "Name,Description,Points",
      language: "ja",
      limit: String(limit)
    });
    if (after >= 0) params.set("after", String(after));
    const response = await fetch(`${XIVAPI_BASE}/sheet/Achievement?${params.toString()}`, {
      headers: { "user-agent": "FF14Today/v2-achievement-candidates" },
      cf: { cacheEverything: true, cacheTtl: 21600 }
    });
    if (!response.ok) throw new Error(`xivapi_achievement_http_${response.status}`);
    const data = await response.json();
    const pageRows = Array.isArray(data?.rows) ? data.rows : [];
    rows.push(...pageRows);
    if (pageRows.length < limit) break;
    const lastId = Number(pageRows[pageRows.length - 1]?.row_id);
    if (!Number.isFinite(lastId) || lastId <= after) break;
    after = lastId;
  }

  achievementCatalogCache = { loadedAt: nowMs, rows };
  return rows;
}

async function buildAchievementCandidates(env, limit = 12) {
  let state = await getLodestoneAchievementState(env, OWNER_LODESTONE_ID);
  if (!state) state = await syncLodestoneAchievements(env, OWNER_LODESTONE_ID, { force: false });
  const acquired = new Set((state?.history || []).map(row => Number(row?.achievement_id)).filter(Number.isFinite));
  const catalog = await loadAchievementCatalog();
  const rows = catalog
    .map(row => {
      const id = Number(row?.row_id);
      const name = normalizeText(row?.fields?.Name);
      const description = normalizeText(row?.fields?.Description);
      const points = Number(row?.fields?.Points || 0) || 0;
      if (!Number.isFinite(id) || id <= 0 || !name || !description || acquired.has(id)) return null;
      return {
        achievement_id: id,
        name,
        description,
        points,
        distance_score: achievementDistanceScore(name, description)
      };
    })
    .filter(Boolean)
    .sort((a, b) => (a.distance_score - b.distance_score) || (b.points - a.points) || a.achievement_id - b.achievement_id)
    .slice(0, Math.max(1, Math.min(30, Number(limit) || 12)));

  return {
    ok: true,
    basis: "Lodestone取得済みIDとXIVAPI実績条件を照合。現在カウンターを取得できないため、初版は条件文の軽さから近さを推定します。",
    acquired_count: state?.total_achievements || acquired.size,
    synced_at: state?.synced_at || null,
    candidates: rows
  };
}

async function loadFishData(nowMs = Date.now()) {
  if (fishCache.data && nowMs - fishCache.loadedAt < CACHE_MS) return fishCache;
  try {
    const response = await fetch(FISH_DATA_URL, {
      headers: { "user-agent": "FF14Today/v2-fishing" },
      cf: { cacheEverything: true, cacheTtl: 21600 }
    });
    if (!response.ok) throw new Error(`fish_source_http_${response.status}`);
    fishCache = { loadedAt: nowMs, data: parseFishTrackerData(await response.text()), error: null };
  } catch (error) {
    fishCache = {
      loadedAt: nowMs,
      data: fishCache.data,
      error: String(error?.message || error || "fish_source_failed")
    };
  }
  return fishCache;
}

function experienceFishingRows(level) {
  if (!level) return [];
  if (level < 15) {
    return [{
      title: `漁師Lv${level}の適正レベル帯で通常釣り`,
      reason: "序盤は適正レベル帯の新規魚・クラスクエスト対象を埋めながら経験値を取る。",
      kind: "experience"
    }];
  }
  if (level < 100) {
    return [
      {
        title: "オーシャンフィッシングを優先",
        reason: `漁師Lv${level}の経験値目的。開催中なら短時間でまとまった経験値を狙いやすい。`,
        kind: "experience"
      },
      {
        title: "未開放の釣り場・釣り手帳を埋める",
        reason: "新規魚の手帳経験値を回収しつつ、後のヌシ釣り用の釣り場知識も増やす。",
        kind: "experience"
      }
    ];
  }
  return [{
    title: "Lv100到達済み：経験値より図鑑・ヌシ優先",
    reason: "レベル上限なので、取得候補はヌシ・オオヌシや未取得魚を優先。",
    kind: "experience"
  }];
}

async function buildFishingCandidates(character, mode = "all") {
  const fisherLevel = jobLevel(character, "FSH");
  const source = await loadFishData();
  const bigFish = source.data ? buildBigFishRows(source.data, fisherLevel, Date.now(), 8) : [];
  return {
    ok: true,
    fisher_level: fisherLevel,
    mode,
    source: "FFX|V Fish Tracker",
    source_error: source.error,
    experience: mode === "big-fish" ? [] : experienceFishingRows(fisherLevel),
    big_fish: mode === "experience" ? [] : bigFish
  };
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (!url.pathname.startsWith("/api/")) return env.ASSETS.fetch(request);

    try {
      if (url.pathname === "/api/health" && request.method === "GET") {
        return json({
          ok: true,
          service: "ff14-today",
          version: "2.0.0",
          single_user: true,
          screenshot_import: false,
          grand_company: false,
          allied_society: false,
          hunt_board: false,
          roulette_recommendations: false,
          island_sanctuary: true,
          achievement_candidates: true,
          timed_gathering_on_demand: true,
          fishing_on_demand: true
        });
      }

      if (url.pathname === "/api/profile" && request.method === "GET") {
        const character = await ownerCharacter(env);
        const achievements = await getLodestoneAchievementState(env, OWNER_LODESTONE_ID);
        return json({
          ok: true,
          character,
          achievements: achievements ? {
            total_achievements: achievements.total_achievements,
            achievement_points: achievements.achievement_points,
            synced_at: achievements.synced_at
          } : null
        });
      }

      if (url.pathname === "/api/sync" && request.method === "POST") {
        return legacySingleUserApp.fetch(request, env);
      }

      if (url.pathname === "/api/achievements" && request.method === "GET") {
        const state = await getLodestoneAchievementState(env, OWNER_LODESTONE_ID);
        return json({ ok: true, achievements: state });
      }

      if (url.pathname === "/api/achievements/sync" && request.method === "POST") {
        const force = url.searchParams.get("force") === "1";
        const state = await syncLodestoneAchievements(env, OWNER_LODESTONE_ID, { force });
        return json({ ok: true, achievements: state });
      }

      if (url.pathname === "/api/achievements/candidates" && request.method === "GET") {
        return json(await buildAchievementCandidates(env, url.searchParams.get("limit")));
      }

      if (url.pathname === "/api/gathering/timed" && request.method === "GET") {
        const character = await ownerCharacter(env);
        if (!character) return json({ error: "Lodestoneを先に同期してください。" }, 409);
        const result = await buildTimedGatheringRows(character, Date.now(), 8);
        return json({ ok: true, ...result });
      }

      if (url.pathname === "/api/fishing/candidates" && request.method === "GET") {
        const character = await ownerCharacter(env);
        if (!character) return json({ error: "Lodestoneを先に同期してください。" }, 409);
        const mode = ["all", "experience", "big-fish"].includes(url.searchParams.get("mode"))
          ? url.searchParams.get("mode")
          : "all";
        return json(await buildFishingCandidates(character, mode));
      }

      return json({
        error: "not_available_in_v2",
        detail: "FF14 Today v2ではこの旧APIを公開していません。"
      }, 404);
    } catch (error) {
      return json({
        error: "request_failed",
        detail: String(error?.message || error)
      }, 500);
    }
  }
};

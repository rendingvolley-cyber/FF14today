import legacySingleUserApp from "./single-user.js";
import { buildTimedGatheringRows } from "./time-sensitive-game-windows.js";
import {
  buildBigFishRows,
  parseFishTrackerData
} from "./task-board-live-catalog.js";

const OWNER_LODESTONE_ID = "3091607";
const FISH_DATA_URL = "https://raw.githubusercontent.com/icykoneko/ff14-fish-tracker-app/master/js/app/data.js";
const CACHE_MS = 6 * 60 * 60 * 1000;

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
      title: `漁師Lv${level}：釣り手帳の未取得を埋める`,
      reason: "釣り手帳で現在Lv以下の未取得魚がいる釣り場を選び、マップ表示→現地で未取得が消えるまで釣る。",
      kind: "experience"
    }];
  }
  if (level < 100) {
    return [
      {
        title: "オーシャンフィッシング：リムサ下甲板 X:3.0 Y:12.7",
        reason: `漁師Lv${level}。Dryskthotaで航路確認→受付中なら参加。餌は隣のMerchant & Menderで購入。1航海終えたら次枠まで別作業。`,
        kind: "experience"
      },
      {
        title: "開催待ちは釣り手帳の未取得を上から埋める",
        reason: "釣り手帳→現在Lv以下の未取得魚がいる釣り場→マップ表示→現地へ移動、の順で進める。",
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
          version: "2.2.0",
          single_user: true,
          screenshot_import: false,
          grand_company: false,
          allied_society: false,
          hunt_board: false,
          roulette_recommendations: false,
          achievement_candidates: false,
          leveling_advisor: true,
          actionable_steps: true,
          island_material_shortage: true,
          island_sanctuary: true,
          timed_gathering_on_demand: true,
          fishing_on_demand: true
        });
      }

      if (url.pathname === "/api/profile" && request.method === "GET") {
        return json({
          ok: true,
          character: await ownerCharacter(env)
        });
      }

      if (url.pathname === "/api/sync" && request.method === "POST") {
        return legacySingleUserApp.fetch(request, env);
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

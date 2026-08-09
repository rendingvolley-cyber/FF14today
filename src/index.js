const PARSER_VERSION = "lodestone-v0.2";

const JOBS = [
  ["PLD", "Paladin", "ナイト", "tank"],
  ["WAR", "Warrior", "戦士", "tank"],
  ["DRK", "Dark Knight", "暗黒騎士", "tank"],
  ["GNB", "Gunbreaker", "ガンブレイカー", "tank"],
  ["WHM", "White Mage", "白魔道士", "healer"],
  ["SCH", "Scholar", "学者", "healer"],
  ["AST", "Astrologian", "占星術師", "healer"],
  ["SGE", "Sage", "賢者", "healer"],
  ["MNK", "Monk", "モンク", "melee"],
  ["DRG", "Dragoon", "竜騎士", "melee"],
  ["NIN", "Ninja", "忍者", "melee"],
  ["SAM", "Samurai", "侍", "melee"],
  ["RPR", "Reaper", "リーパー", "melee"],
  ["VPR", "Viper", "ヴァイパー", "melee"],
  ["BST", "Beastmaster", "魔獣使い", "limited"],
  ["BRD", "Bard", "吟遊詩人", "ranged"],
  ["MCH", "Machinist", "機工士", "ranged"],
  ["DNC", "Dancer", "踊り子", "ranged"],
  ["BLM", "Black Mage", "黒魔道士", "caster"],
  ["SMN", "Summoner", "召喚士", "caster"],
  ["RDM", "Red Mage", "赤魔道士", "caster"],
  ["PCT", "Pictomancer", "ピクトマンサー", "caster"],
  ["BLU", "Blue Mage", "青魔道士", "limited"],
  ["CRP", "Carpenter", "木工師", "crafter"],
  ["BSM", "Blacksmith", "鍛冶師", "crafter"],
  ["ARM", "Armorer", "甲冑師", "crafter"],
  ["GSM", "Goldsmith", "彫金師", "crafter"],
  ["LTW", "Leatherworker", "革細工師", "crafter"],
  ["WVR", "Weaver", "裁縫師", "crafter"],
  ["ALC", "Alchemist", "錬金術師", "crafter"],
  ["CUL", "Culinarian", "調理師", "crafter"],
  ["MIN", "Miner", "採掘師", "gatherer"],
  ["BTN", "Botanist", "園芸師", "gatherer"],
  ["FSH", "Fisher", "漁師", "gatherer"]
];

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store"
    }
  });
}

function normalizeText(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function parseLodestoneId(value) {
  if (!value) return null;
  try {
    const url = new URL(value);
    const match = url.pathname.match(/\/lodestone\/character\/(\d+)\//);
    return match ? match[1] : null;
  } catch {
    return /^\d+$/.test(String(value)) ? String(value) : null;
  }
}

async function collectSelectorText(response, selector) {
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

  await new HTMLRewriter()
    .on(selector, new Handler())
    .transform(response)
    .arrayBuffer();

  return values.map(parts => normalizeText(parts.join("")));
}

async function fetchLodestone(url) {
  const base = new URL(url);
  const idMatch = base.pathname.match(/\/lodestone\/character\/(\d+)\//);
  if (!idMatch) throw new Error("Invalid Lodestone character URL.");

  const canonical = `${base.origin}/lodestone/character/${idMatch[1]}/`;
  const classJobUrl = `${canonical}class_job/`;
  const headers = {
    "accept-language": "en-US,en;q=0.9",
    "user-agent": "FF14-Today/0.2 personal-progress-sync"
  };

  const [profileResponse, jobResponse] = await Promise.all([
    fetch(canonical, { headers }),
    fetch(classJobUrl, { headers })
  ]);

  if (!profileResponse.ok) throw new Error(`Lodestone profile HTTP ${profileResponse.status}`);
  if (!jobResponse.ok) throw new Error(`Lodestone class/job HTTP ${jobResponse.status}`);

  const [names, worlds, levels] = await Promise.all([
    collectSelectorText(profileResponse.clone(), ".frame__chara__name"),
    collectSelectorText(profileResponse.clone(), ".frame__chara__world"),
    collectSelectorText(jobResponse.clone(), ".character__job__level")
  ]);

  const name = normalizeText(names[0]);
  const worldRaw = normalizeText(worlds[0]);
  if (!name || !worldRaw) {
    throw new Error("Lodestone profile parser failed: name/world not found.");
  }
  if (levels.length < JOBS.length) {
    throw new Error(`Lodestone job parser failed: expected >= ${JOBS.length} levels, got ${levels.length}.`);
  }

  const worldMatch = worldRaw.match(/^(.+?)\s*\[([^\]]+)\]/);
  const world = worldMatch ? normalizeText(worldMatch[1]) : worldRaw;
  const dataCenter = worldMatch ? normalizeText(worldMatch[2]) : null;

  const jobs = JOBS.map((meta, index) => {
    const raw = normalizeText(levels[index]);
    const level = raw === "-" ? null : Number.parseInt(raw, 10);
    return {
      code: meta[0],
      name_en: meta[1],
      name_ja: meta[2],
      role: meta[3],
      level: Number.isFinite(level) ? level : null
    };
  });

  return {
    lodestone_id: idMatch[1],
    lodestone_url: canonical,
    name,
    world,
    data_center: dataCenter,
    jobs,
    bozja_rank: null,
    synced_at: new Date().toISOString(),
    parser_version: PARSER_VERSION
  };
}

async function saveCharacter(env, state) {
  await env.DB.prepare(`
    INSERT INTO character_state (
      lodestone_id, lodestone_url, name, world, data_center,
      jobs_json, bozja_rank, synced_at, parser_version
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(lodestone_id) DO UPDATE SET
      lodestone_url=excluded.lodestone_url,
      name=excluded.name,
      world=excluded.world,
      data_center=excluded.data_center,
      jobs_json=excluded.jobs_json,
      bozja_rank=excluded.bozja_rank,
      synced_at=excluded.synced_at,
      parser_version=excluded.parser_version
  `).bind(
    state.lodestone_id,
    state.lodestone_url,
    state.name,
    state.world,
    state.data_center,
    JSON.stringify(state.jobs),
    state.bozja_rank,
    state.synced_at,
    state.parser_version
  ).run();
}

async function getCharacter(env, lodestoneId) {
  if (!lodestoneId) return null;
  const row = await env.DB.prepare(`
    SELECT * FROM character_state WHERE lodestone_id=? LIMIT 1
  `).bind(lodestoneId).first();
  if (!row) return null;
  return {
    lodestone_id: row.lodestone_id,
    lodestone_url: row.lodestone_url,
    name: row.name,
    world: row.world,
    data_center: row.data_center,
    jobs: JSON.parse(row.jobs_json),
    bozja_rank: row.bozja_rank,
    synced_at: row.synced_at,
    parser_version: row.parser_version
  };
}

function buildRulePlan(character, availableMinutes, energy) {
  const eligible = character.jobs
    .filter(j => j.level !== null && j.level < 100 && j.role !== "limited")
    .sort((a, b) => (b.level - a.level) || a.code.localeCompare(b.code));
  const primary = eligible[0] ?? character.jobs.find(j => j.code === "WAR");
  const secondary = eligible[1] ?? null;

  let mainMinutes = Math.min(availableMinutes, energy <= 1 ? 15 : energy === 2 ? 25 : 35);
  if (availableMinutes <= 15) mainMinutes = availableMinutes;

  const reason = primary?.level < 100
    ? `現在Lv${primary.level}。Lodestoneで確認できる未カンストJobの中で、まず短く進めやすい候補として選択。`
    : "戦闘用のカンストJobを使って、未整理の進捗確認を優先。";

  return {
    planner_kind: "rule-v0.2",
    notice: "暫定ルールベース。実績・Big Fish・期限情報・Geminiは未接続。",
    now: {
      title: primary?.level < 100 ? `${primary.name_ja}を${mainMinutes}分だけ進める` : "進捗情報を1件追加する",
      minutes: mainMinutes,
      reason,
      steps: primary?.level < 100
        ? [
            `${primary.name_ja}（Lv${primary.level}）へ変更`,
            `${mainMinutes}分だけレベル上げを進める`,
            "時間になったら途中でも終了"
          ]
        : [
            "ゲーム内の実績画面を1ページ確認",
            "次フェーズのScreenshot Import用にSSを1枚残す"
          ]
    },
    next: secondary && availableMinutes >= 45
      ? {
          title: `${secondary.name_ja}は余力がある時だけ`,
          minutes: Math.min(20, Math.max(10, availableMinutes - mainMinutes)),
          reason: `Lv${secondary.level}。今日はメイン完了後のみ。`
        }
      : null,
    fallback: {
      title: "Lodestone同期だけして終了",
      minutes: 2,
      reason: "気力がない日は情報更新だけでもアプリが次回の判断材料を持てる。"
    },
    skip_today: [
      "全ジョブ一覧を眺めて次を自分で決める",
      "実績一覧を最初から全部確認する",
      "複数カテゴリを同時に始める"
    ]
  };
}

async function apiState(request, env) {
  const url = new URL(request.url);
  const lodestoneId = parseLodestoneId(url.searchParams.get("lodestone_id"));
  if (!lodestoneId) {
    return json({
      character: null,
      preferences: { available_minutes: 60, energy: 2 },
      plan: null
    });
  }

  const [character, prefs] = await Promise.all([
    getCharacter(env, lodestoneId),
    env.DB.prepare(`
      SELECT available_minutes, energy, updated_at
      FROM user_preferences
      WHERE lodestone_id=?
    `).bind(lodestoneId).first()
  ]);

  const today = new Date().toISOString().slice(0, 10);
  const planRow = await env.DB.prepare(`
    SELECT * FROM daily_plans
    WHERE lodestone_id=? AND plan_date=?
  `).bind(lodestoneId, today).first();

  return json({
    character,
    preferences: prefs ?? { available_minutes: 60, energy: 2 },
    plan: planRow ? JSON.parse(planRow.plan_json) : null
  });
}

async function apiSync(request, env) {
  let payload = {};
  try { payload = await request.json(); } catch {}
  const url = payload.lodestone_url;
  if (!url) return json({ error: "Lodestone URLを入力してください。" }, 400);
  if (!parseLodestoneId(url)) {
    return json({ error: "LodestoneキャラクターURLの形式を確認してください。" }, 400);
  }

  try {
    const state = await fetchLodestone(url);
    await saveCharacter(env, state);
    return json({ ok: true, character: state });
  } catch (error) {
    return json({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
      parser_version: PARSER_VERSION
    }, 502);
  }
}

async function apiPlan(request, env) {
  let payload = {};
  try { payload = await request.json(); } catch {}

  const lodestoneId = parseLodestoneId(payload.lodestone_id);
  if (!lodestoneId) return json({ error: "先にLodestone URLを同期してください。" }, 409);

  const character = await getCharacter(env, lodestoneId);
  if (!character) return json({ error: "Sync Lodestone first." }, 409);

  const availableMinutes = Math.max(15, Math.min(240, Number(payload.available_minutes) || 60));
  const energy = Math.max(1, Math.min(5, Number(payload.energy) || 2));
  const now = new Date().toISOString();

  await env.DB.prepare(`
    INSERT INTO user_preferences (lodestone_id, available_minutes, energy, updated_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(lodestone_id) DO UPDATE SET
      available_minutes=excluded.available_minutes,
      energy=excluded.energy,
      updated_at=excluded.updated_at
  `).bind(lodestoneId, availableMinutes, energy, now).run();

  const plan = buildRulePlan(character, availableMinutes, energy);
  const today = now.slice(0, 10);

  await env.DB.prepare(`
    INSERT INTO daily_plans (
      lodestone_id, plan_date, generated_at, available_minutes, energy, planner_kind, plan_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(lodestone_id, plan_date) DO UPDATE SET
      generated_at=excluded.generated_at,
      available_minutes=excluded.available_minutes,
      energy=excluded.energy,
      planner_kind=excluded.planner_kind,
      plan_json=excluded.plan_json
  `).bind(
    lodestoneId, today, now, availableMinutes, energy,
    plan.planner_kind, JSON.stringify(plan)
  ).run();

  return json({ ok: true, plan });
}

async function handleApi(request, env) {
  const url = new URL(request.url);

  if (url.pathname === "/api/health") {
    return json({
      ok: true,
      service: "ff14-today",
      version: "0.2.0",
      d1: Boolean(env.DB),
      multi_character: true
    });
  }

  if (url.pathname === "/api/state" && request.method === "GET") return apiState(request, env);
  if (url.pathname === "/api/sync" && request.method === "POST") return apiSync(request, env);
  if (url.pathname === "/api/plan" && request.method === "POST") return apiPlan(request, env);
  return json({ error: "Not found" }, 404);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) {
      try {
        return await handleApi(request, env);
      } catch (error) {
        return json({
          error: "Unhandled server error",
          detail: error instanceof Error ? error.message : String(error)
        }, 500);
      }
    }
    return env.ASSETS.fetch(request);
  }
};

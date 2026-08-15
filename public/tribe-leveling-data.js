const NORMAL_ROLES = new Set(["tank", "healer", "melee", "ranged", "caster"]);
const CATEGORY_ORDER = ["combat", "craft", "gather"];

export const ALLIED_SOCIETY_DAILY_LIMIT = 12;
export const ALLIED_SOCIETY_QUESTS_PER_GROUP = 3;

export const ALLIED_SOCIETY_DAILY_GUIDES = [
  { id: "vanu_vanu", name: "バヌバヌ族", categories: ["combat"], min_level: 50, max_level: 59, area: "アバラシア雲海" },
  { id: "vath", name: "グナース族（分かたれし者）", categories: ["combat"], min_level: 50, max_level: 59, area: "高地ドラヴァニア" },
  { id: "moogle", name: "モーグリ族", categories: ["craft"], min_level: 50, max_level: 59, area: "ドラヴァニア雲海" },
  { id: "kojin", name: "コウジン族", categories: ["combat"], min_level: 60, max_level: 69, area: "紅玉海" },
  { id: "ananta", name: "アナンタ族", categories: ["combat"], min_level: 60, max_level: 69, area: "ギラバニア辺境地帯" },
  { id: "namazu", name: "ナマズオ族", categories: ["craft", "gather"], min_level: 60, max_level: 69, area: "アジムステップ" },
  { id: "pixie", name: "ピクシー族", categories: ["combat"], min_level: 70, max_level: 79, area: "イル・メグ" },
  { id: "qitari", name: "キタリ族", categories: ["gather"], min_level: 70, max_level: 79, area: "ラケティカ大森林" },
  { id: "dwarf", name: "ドワーフ族", categories: ["craft"], min_level: 70, max_level: 79, area: "レイクランド" },
  { id: "arkasodara", name: "アルカソーダラ族", categories: ["combat"], min_level: 80, max_level: 89, area: "サベネア島" },
  { id: "omicron", name: "オミクロン族", categories: ["gather"], min_level: 80, max_level: 89, area: "ウルティマ・トゥーレ" },
  { id: "loporrit", name: "レポリット族", categories: ["craft"], min_level: 80, max_level: 89, area: "嘆きの海" },
  { id: "pelupelu", name: "ペルペル族", categories: ["combat"], min_level: 90, max_level: 99, area: "コザマル・カ" },
  { id: "mamool_ja", name: "マムージャ族", categories: ["gather"], min_level: 90, max_level: 99, area: "ヤクテル樹海" },
  { id: "yok_huy", name: "ヨカフイ族", categories: ["craft"], min_level: 90, max_level: 99, area: "オルコ・パチャ" }
];

export const TRIBE_LEVELING_GUIDES = [
  {
    id: "pixie",
    min_level: 70,
    max_level: 79,
    name: "ピクシー族",
    range_label: "Lv70〜79",
    unlock_quest: "夢と現の狭間で",
    start_location: "クリスタリウム X:13.1 Y:15.3",
    npc: "桃色のピクシー",
    prerequisite: "メインクエスト「運命はまた廻る」をコンプリート",
    first_step: "クリスタリウム X:13.1 Y:15.3へ行き、桃色のピクシーから「夢と現の狭間で」を受注する。",
    unlock_result: "「夢と現の狭間で」完了後、ピクシー族のデイリークエストが解放される。",
    steps: [
      "前提：メインクエスト「運命はまた廻る」を終えているか確認",
      "クリスタリウム X:13.1 Y:15.3の桃色のピクシーから「夢と現の狭間で」を受注",
      "クエストを完了したら、このガイドを「解放済み」にする"
    ]
  },
  {
    id: "arkasodara",
    min_level: 80,
    max_level: 89,
    name: "アルカソーダラ族",
    range_label: "Lv80〜89",
    unlock_quest: "爆走ヒッポ、島を駆る",
    start_location: "サベネア島 X:25.3 Y:31.2",
    npc: "カーンチャナ",
    prerequisite: "前提サブクエスト2系列を終え、「森へ吹き込む草原の風」をコンプリート",
    first_step: "まずサベネア島 X:25.5 Y:36.0のオグルから「アジムステップの若き冒険者」を受注する。",
    unlock_result: "前提2系列の合流後、「爆走ヒッポ、島を駆る」を完了するとデイリークエストが解放される。",
    steps: [
      "先に「アジムステップの若き冒険者」系列を開始：サベネア島 X:25.5 Y:36.0／オグル",
      "次に「錬金術師と赤ん坊」系列を開始：サベネア島 X:29.2 Y:15.2／イェザーン",
      "2系列を進めて「森へ吹き込む草原の風」を完了",
      "サベネア島 X:25.3 Y:31.2のカーンチャナから「爆走ヒッポ、島を駆る」を受注・完了"
    ]
  },
  {
    id: "pelupelu",
    min_level: 90,
    max_level: 99,
    name: "ペルペル族",
    range_label: "Lv90〜99",
    unlock_quest: "新事業！ トラル旅行公司",
    start_location: "トライヨラ X:13.6 Y:12.9",
    npc: "空色衣装のペルペル族",
    prerequisite: "メインクエスト「黄金のレガシー」をコンプリート",
    first_step: "トライヨラ X:13.6 Y:12.9へ行き、空色衣装のペルペル族から「新事業！ トラル旅行公司」を受注する。",
    unlock_result: "「新事業！ トラル旅行公司」完了後、ペルペル族のデイリークエストが解放される。",
    steps: [
      "前提：メインクエスト「黄金のレガシー」を終えているか確認",
      "トライヨラ X:13.6 Y:12.9の空色衣装のペルペル族から「新事業！ トラル旅行公司」を受注",
      "クエストを完了したら、このガイドを「解放済み」にする"
    ]
  }
];

function normalizeCode(value) {
  return String(value || "").trim().toUpperCase();
}

function jobCategory(job) {
  const code = normalizeCode(job?.code);
  if (!code || code === "BLU" || job?.role === "limited") return null;
  if (NORMAL_ROLES.has(job?.role)) return "combat";
  if (job?.role === "crafter") return "craft";
  if (job?.role === "gatherer") return "gather";
  return null;
}

function normalizeFocus(focus = {}) {
  return {
    combat: normalizeCode(focus.combat || focus.efficient || focus.focus_combat_job_code),
    craft: normalizeCode(focus.craft || focus.focus_craft_job_code),
    gather: normalizeCode(focus.gather || focus.focus_gather_job_code)
  };
}

function jobsForCategory(jobs, category) {
  return (Array.isArray(jobs) ? jobs : []).filter(job => {
    const level = Number(job?.level);
    return jobCategory(job) === category && Number.isInteger(level) && level > 0;
  });
}

function pickTargetJob(jobs, society, category, focus, progression = false) {
  const candidates = jobsForCategory(jobs, category).filter(job => {
    const level = Number(job.level);
    return progression
      ? level > society.max_level
      : level >= society.min_level && level <= society.max_level;
  });
  if (!candidates.length) return null;
  const focusCode = focus[category] || "";
  return candidates.sort((a, b) => {
    const levelDiff = Number(a.level) - Number(b.level);
    if (levelDiff !== 0) return levelDiff;
    const aFocus = normalizeCode(a.code) === focusCode ? 1 : 0;
    const bFocus = normalizeCode(b.code) === focusCode ? 1 : 0;
    return bFocus - aFocus;
  })[0];
}

function candidateScore(candidate) {
  const levelingBonus = candidate.kind === "leveling" ? 1000000 : 0;
  const catchupBonus = Math.max(0, 100 - Number(candidate.target_job_level || 100)) * 1000;
  const lowerBandBonus = Math.max(0, 100 - Number(candidate.min_level || 100)) * 10;
  const focusTieBreak = candidate.focused ? 1 : 0;
  return levelingBonus + catchupBonus + lowerBandBonus + focusTieBreak;
}

function makeCandidate(society, category, job, focus, kind) {
  const code = normalizeCode(job.code);
  const focused = Boolean(focus[category] && focus[category] === code);
  const leveling = kind === "leveling";
  return {
    society_id: society.id,
    society_name: society.name,
    category,
    area: society.area,
    min_level: society.min_level,
    max_level: society.max_level,
    range_label: `Lv${society.min_level}〜${society.max_level}`,
    quests: ALLIED_SOCIETY_QUESTS_PER_GROUP,
    target_job_code: code,
    target_job_name: String(job.name_ja || job.name || code),
    target_job_level: Number(job.level),
    kind,
    conditional: !leveling,
    focused,
    reason: leveling
      ? `${String(job.name_ja || job.name || code)} Lv${job.level}が${society.name}の適正帯（Lv${society.min_level}〜${society.max_level}）。高Lvを先に100へ押し切るより、低Lv側を追いつかせて装備帯を揃えるための底上げ3件として優先します。`
      : `経験値の適正帯は超えています。${society.name}の友好度・通貨・報酬を進める余力3枠として提案します。友好度MAXならここは使わなくてOKです。`
  };
}

function buildCandidates(jobs, focus, progression = false) {
  const rows = [];
  for (const society of ALLIED_SOCIETY_DAILY_GUIDES) {
    for (const category of society.categories) {
      const job = pickTargetJob(jobs, society, category, focus, progression);
      if (!job) continue;
      rows.push(makeCandidate(society, category, job, focus, progression ? "progression" : "leveling"));
    }
  }
  return rows.sort((a, b) => candidateScore(b) - candidateScore(a));
}

function addUniqueGroup(groups, usedSocieties, candidate) {
  if (!candidate || usedSocieties.has(candidate.society_id)) return false;
  groups.push(candidate);
  usedSocieties.add(candidate.society_id);
  return true;
}

export function buildTribeDailyPlan(characterOrJobs, options = {}) {
  const jobs = Array.isArray(characterOrJobs) ? characterOrJobs : characterOrJobs?.jobs || [];
  const focus = normalizeFocus(options.focus || options);
  const maxGroups = Math.floor(ALLIED_SOCIETY_DAILY_LIMIT / ALLIED_SOCIETY_QUESTS_PER_GROUP);
  const levelingCandidates = buildCandidates(jobs, focus, false);
  const groups = [];
  const usedSocieties = new Set();

  // Reserve one catch-up block per available play category, always starting from its lowest eligible job.
  for (const category of CATEGORY_ORDER) {
    const candidate = levelingCandidates.find(row => row.category === category && !usedSocieties.has(row.society_id));
    addUniqueGroup(groups, usedSocieties, candidate);
  }

  // Fill the remaining daily allowance from the lowest-level eligible jobs before reputation-only overflow.
  for (const candidate of levelingCandidates) {
    if (groups.length >= maxGroups) break;
    addUniqueGroup(groups, usedSocieties, candidate);
  }

  if (groups.length < maxGroups) {
    const progressionCandidates = buildCandidates(jobs, focus, true);
    for (const candidate of progressionCandidates) {
      if (groups.length >= maxGroups) break;
      addUniqueGroup(groups, usedSocieties, candidate);
    }
  }

  const ranked = groups.slice(0, maxGroups).map((group, index) => ({ ...group, priority_rank: index + 1 }));
  const plannedQuests = ranked.reduce((sum, group) => sum + Number(group.quests || 0), 0);
  const levelingQuests = ranked.filter(group => group.kind === "leveling").reduce((sum, group) => sum + group.quests, 0);
  const conditionalQuests = ranked.filter(group => group.conditional).reduce((sum, group) => sum + group.quests, 0);

  return {
    version: "allied-society-daily-plan-v2-low-level-catchup",
    daily_limit: ALLIED_SOCIETY_DAILY_LIMIT,
    quests_per_society: ALLIED_SOCIETY_QUESTS_PER_GROUP,
    planned_quests: Math.min(ALLIED_SOCIETY_DAILY_LIMIT, plannedQuests),
    remaining_quests: Math.max(0, ALLIED_SOCIETY_DAILY_LIMIT - plannedQuests),
    leveling_quests: levelingQuests,
    conditional_quests: conditionalQuests,
    groups: ranked,
    note: conditionalQuests
      ? "低Lvジョブの底上げを先に配分しています。余力枠は経験値目的ではなく、解放状況・友好度MAXはLodestoneから判別できないため不要なら空けてOKです。"
      : "高Lvを100へ押し切るより、Lodestone上で低いジョブを適正帯の友好部族で追いつかせる配分です。"
  };
}

export function alliedSocietyCategoryLabel(category) {
  if (category === "combat") return "戦闘";
  if (category === "craft") return "製作";
  if (category === "gather") return "採集";
  return "その他";
}

export function tribeGuideForJob(job) {
  if (!job || !NORMAL_ROLES.has(job.role)) return null;
  const code = normalizeCode(job.code);
  if (code === "BLU" || job.role === "limited") return null;
  const level = Number(job.level);
  if (!Number.isInteger(level)) return null;
  return TRIBE_LEVELING_GUIDES.find(guide => level >= guide.min_level && level <= guide.max_level) || null;
}
const LEVELING_DUNGEONS_70_100 = [
  { min: 70, max: 70, name: "巨砲要塞 カストルム・アバニア", level: 69 },
  { min: 71, max: 72, name: "殺戮郷村 ホルミンスター", level: 71 },
  { min: 73, max: 74, name: "水妖幻園 ドォーヌ・メグ", level: 73 },
  { min: 75, max: 76, name: "古跡探索 キタンナ神影洞", level: 75 },
  { min: 77, max: 78, name: "爽涼離宮 マリカの大井戸", level: 77 },
  { min: 79, max: 80, name: "偽造天界 グルグ火山", level: 79 },
  { min: 81, max: 82, name: "異形楼閣 ゾットの塔", level: 81 },
  { min: 83, max: 84, name: "魔導神門 バブイルの塔", level: 83 },
  { min: 85, max: 86, name: "終末樹海 ヴァナスパティ", level: 85 },
  { min: 87, max: 88, name: "創造環境 ヒュペルボレア造物院", level: 87 },
  { min: 89, max: 90, name: "星海潜航 アイティオン星晶鏡", level: 89 },
  { min: 91, max: 92, name: "濁流遡上 イフイカ・トゥム", level: 91 },
  { min: 93, max: 94, name: "山嶺登頂 ウォーコー・ゾーモー", level: 93 },
  { min: 95, max: 96, name: "遺産踏査 天深きセノーテ", level: 95 },
  { min: 97, max: 98, name: "外征前哨 ヴァンガード", level: 97 },
  { min: 99, max: 99, name: "魂魄工廠 オリジェニクス", level: 99 }
];

const DPS_ROLES = new Set(["melee", "ranged", "caster"]);
const NORMAL_COMBAT_ROLES = new Set(["tank", "healer", "melee", "ranged", "caster"]);
const BLUE_MAGE_CODE = "BLU";
const FRONTLINE_TASK_KEY = "daily:frontline";

function normalizedCode(job) {
  return String(job?.code || "").trim().toUpperCase();
}

function isBlueMage(job) {
  return normalizedCode(job) === BLUE_MAGE_CODE || (job?.role === "limited" && /青魔/.test(String(job?.name_ja || "")));
}

export function isLevelingCombatJob(job) {
  if (!job || !Number.isInteger(Number(job.level))) return false;
  const level = Number(job.level);
  if (isBlueMage(job)) return level >= 70 && level < 80;
  return NORMAL_COMBAT_ROLES.has(job.role) && level >= 70 && level < 100;
}

export function levelingCombatJobs(character) {
  return (character?.jobs || [])
    .filter(isLevelingCombatJob)
    .sort((a, b) => (b.level - a.level) || normalizedCode(a).localeCompare(normalizedCode(b)));
}

function findFocusedJob(character, code) {
  const wanted = String(code || "").trim().toUpperCase();
  if (!wanted) return null;
  return levelingCombatJobs(character).find(job => normalizedCode(job) === wanted) || null;
}

function dungeonForLevel(level) {
  return LEVELING_DUNGEONS_70_100.find(duty => level >= duty.min && level <= duty.max) || null;
}

function withJob(method, job) {
  return {
    ...method,
    job_code: job.code,
    job_name: job.name_ja,
    job_level: job.level,
    job_role: job.role
  };
}

function scored(method, score, source) {
  return {
    ...method,
    efficiency_score: Number(score) || 0,
    efficiency_source: source || "grounded_rule"
  };
}

function rouletteMethod(job, dailyKey, kind, minutes, reason, score) {
  return scored(withJob({
    task_key: `roulette:${dailyKey}`,
    daily_key: dailyKey,
    badge: "日次ボーナス",
    title: `${job.name_ja}で「コンテンツルーレット：${kind}」を1回`,
    minutes,
    reason,
    condition: `目的：${job.name_ja} Lv${job.level}の経験値を、回数制限のある日次ボーナスから先に回収する。`,
    steps: [
      `${job.name_ja}（Lv${job.level}）へジョブチェンジ`,
      "メニュー → コンテンツ情報 → コンテンツファインダー",
      `コンテンツルーレット → 「${kind}」を選択`,
      "1回だけ申請してクリア",
      "終わったら「✓ 完了！」"
    ]
  }, job), score, "daily_bonus");
}

function frontlineMethod(job) {
  return scored(withJob({
    task_key: FRONTLINE_TASK_KEY,
    daily_key: null,
    badge: "1日1回のPvP育成枠",
    title: `${job.name_ja}で「デイリーチャレンジ：フロントライン」を1回`,
    minutes: 25,
    reason: "フロントラインは参加報酬として通常のキャラクター経験値も得られる。反復IDへ入る前に、1日1回のデイリーチャレンジ枠として比較対象に入れます。",
    condition: "目的：短時間の1戦で日次枠を回収し、戦闘ジョブ経験値も進める。",
    steps: [
      `${job.name_ja}（Lv${job.level}）へジョブチェンジ`,
      "コンテンツファインダー → PvP → デイリーチャレンジ：フロントライン",
      "当日のルールへ1回だけ申請",
      "1戦終わったら「✓ 完了！」"
    ]
  }, job), 94, "daily_frontline");
}

function repeatDungeonMethod(job, duty) {
  if (!duty) return null;
  const dps = DPS_ROLES.has(job.role);
  const score = dps ? 74 : 80;
  return scored(withJob({
    task_key: `leveling-dungeon:${job.code}:${duty.level}`,
    daily_key: null,
    badge: "反復できる安定枠",
    title: `${job.name_ja}で「${duty.name}」を1周`,
    minutes: dps ? 35 : 25,
    reason: `選択中の${job.name_ja}はLv${job.level}。回数制限のある高効率候補を消化した後の比較対象として、現在Lvで入れる最高帯のレベリングID「${duty.name}」（Lv${duty.level}）を置いています。IDだから自動で#1にはしません。`,
    condition: dps
      ? "目的：待ち時間のブレを避け、コンテンツサポーターで再現性の高い経験値を積む。"
      : "目的：短い待ち時間を活かして、現在Lv帯のIDを反復する。",
    steps: dps
      ? [`${job.name_ja}（Lv${job.level}）へジョブチェンジ`, `コンテンツサポーターで「${duty.name}」を選択`, "1周する", "終わったら「✓ 完了！」"]
      : [`${job.name_ja}（Lv${job.level}）へジョブチェンジ`, `コンテンツファインダーで「${duty.name}」を選択`, "1周する", "終わったら「✓ 完了！」"]
  }, job), score, "repeatable_dungeon");
}

function bozjaMethod(job, character) {
  if (Number(character?.bozja_rank || 0) <= 0 || job.level < 71 || job.level > 90) return null;
  return scored(withJob({
    task_key: `leveling:bozja:${job.code}`,
    daily_key: null,
    badge: "解放済みの反復候補",
    title: `${job.name_ja}で南方ボズヤ戦線を30分だけ回る`,
    minutes: 30,
    reason: `レジスタンスランク${Number(character.bozja_rank)}を確認できているため、解放済みの反復レベリング候補としてIDと比較します。日次ボーナスを消化済みで、ID以外を回したい時の有力な代替です。`,
    condition: "目的：スカーミッシュ／クリティカルエンゲージメントを拾いながら経験値を積む。",
    steps: [
      `${job.name_ja}（Lv${job.level}）へジョブチェンジ`,
      "南方ボズヤ戦線へ入場",
      "発生中のスカーミッシュ／クリティカルエンゲージメントを30分だけ回る",
      "30分で切り上げて「✓ 完了！」"
    ]
  }, job), DPS_ROLES.has(job.role) ? 76 : 70, "unlocked_repeatable");
}

function blueMageMethods(job) {
  if (!isBlueMage(job) || job.level < 70 || job.level >= 80) return [];
  return [
    scored(withJob({
      task_key: "blu:70-79:tempest-clionid-solo",
      daily_key: null,
      badge: "青魔専用・ソロ高効率",
      title: "テンペスト北で「ディープシーリーチ→クリオニッド」を20分",
      minutes: 20,
      reason: "青魔道士は通常ジョブよりフィールドモンスター討伐の経験値が多く、ルーレットやPvPには参加できません。Lv70台は通常IDへ寄せず、青魔専用のフィールド育成を優先します。",
      condition: "目的：ソロで格上モンスターの経験値を取る。クリオニッドにリーチを3体食べさせた後は通常攻撃が危険なので距離を取る。",
      steps: [
        `${job.name_ja}（Lv${job.level}）へジョブチェンジ`,
        "テンペスト北・コルシア島へ移動する境界付近へ行く",
        "ディープシーリーチとクリオニッドを近づけ、クリオニッドにリーチを食べさせる",
        "20分だけ繰り返す",
        "終わったら「✓ 完了！」"
      ]
    }, job), 100, "blue_mage_field_bonus"),
    scored(withJob({
      task_key: "blu:70-79:field-solo",
      daily_key: null,
      badge: "青魔専用・安定ソロ",
      title: job.level === 70 ? "コルシア島南側で同格付近の敵を20分狩る" : "現在Lvに近い漆黒エリアのフィールド敵を20分狩る",
      minutes: 20,
      reason: "青魔道士のフィールドモンスター経験値ボーナスを使う、準備の少ないソロ育成。FATEやギルドリーヴ由来の敵はボーナス対象外なので通常フィールド敵だけを狙います。",
      condition: "目的：特殊なペア育成を前提にせず、1人で安定して経験値を積む。",
      steps: [
        `${job.name_ja}（Lv${job.level}）へジョブチェンジ`,
        job.level === 70 ? "コルシア島南側へ移動" : "自分と同格前後の通常フィールド敵がいる漆黒エリアへ移動",
        "FATE対象外の通常モンスターを20分だけ狩る",
        "終わったら「✓ 完了！」"
      ]
    }, job), 82, "blue_mage_field_bonus")
  ];
}

function fitToTime(methods, availableMinutes) {
  const minutes = Math.max(0, Number(availableMinutes) || 0);
  return methods.filter(method => Number(method.minutes || 0) <= minutes + 5);
}

function rankMethods(methods, completionCounts) {
  const counts = completionCounts && typeof completionCounts === "object" ? completionCounts : {};
  return methods
    .filter(Boolean)
    .filter(method => !(method.task_key === FRONTLINE_TASK_KEY && Number(counts[method.task_key] || 0) > 0))
    .map((method, baseIndex) => ({
      ...method,
      repeat_count: Math.max(0, Number(counts[method.task_key]) || 0),
      _base_index: baseIndex
    }))
    .sort((a, b) => {
      const scoreDiff = Number(b.efficiency_score || 0) - Number(a.efficiency_score || 0);
      if (scoreDiff) return scoreDiff;
      const repeatDiff = Number(a.repeat_count > 0) - Number(b.repeat_count > 0);
      if (repeatDiff) return repeatDiff;
      return (a.repeat_count - b.repeat_count) || (a._base_index - b._base_index);
    })
    .map(({ _base_index, ...method }, index) => ({
      ...method,
      rank: index + 1,
      badge: method.repeat_count > 0 ? `${method.badge} · 今日${method.repeat_count}回済み` : method.badge
    }));
}

function focusFromJob(job) {
  return { code: job.code, name: job.name_ja, level: job.level, role: job.role };
}

function asNow(method) {
  if (!method) return null;
  return {
    task_key: method.task_key,
    daily_key: method.daily_key,
    title: method.title,
    minutes: method.minutes,
    reason: method.reason,
    condition: method.condition,
    steps: method.steps,
    repeat_count: method.repeat_count || 0,
    efficiency_score: method.efficiency_score || 0,
    efficiency_source: method.efficiency_source || null
  };
}

function normalCombatMethods(job, character, completed, completionCounts) {
  const methods = [];
  if (!completed.leveling) {
    methods.push(rouletteMethod(job, "leveling", "レベリング", 30,
      "レベル上げでは回数制限のある日次ボーナスを、反復コンテンツより先に比較します。", 100));
  }
  methods.push(frontlineMethod(job));
  if (job.level >= 50 && !completed.alliance) {
    methods.push(rouletteMethod(job, "alliance", "アライアンスレイド", 35,
      "1日1回の経験値ボーナスを回収できるため、反復IDより先に比較します。", 90));
  }
  methods.push(repeatDungeonMethod(job, dungeonForLevel(job.level)));
  methods.push(bozjaMethod(job, character));
  return rankMethods(methods, completionCounts);
}

export function applyCombatJobFocus(plan, character, options = {}) {
  if (!plan || plan.selected_mode !== "efficient") return plan;
  const job = findFocusedJob(character, options.focusJobCode);
  if (!job) return plan;

  const completed = {
    leveling: Boolean(options.completedDaily?.leveling),
    alliance: Boolean(options.completedDaily?.alliance)
  };
  const completionCounts = options.completionCounts || {};
  const baseMethods = isBlueMage(job)
    ? rankMethods(blueMageMethods(job), completionCounts)
    : normalCombatMethods(job, character, completed, completionCounts);

  const journalMethods = (plan.methods || []).filter(method => method?.source_kind === "journal_screenshot");
  const fitted = fitToTime(baseMethods, options.availableMinutes);
  const combined = [...fitted, ...journalMethods]
    .filter((method, index, rows) => rows.findIndex(row => row.task_key === method.task_key) === index)
    .slice(0, 3)
    .map((method, index) => ({ ...method, rank: index + 1 }));

  if (!combined.length) {
    return {
      ...plan,
      planner_kind: "combat-job-focus-v1.7.2",
      session_complete: true,
      focus_job: focusFromJob(job),
      methods: [],
      now: null,
      next: null,
      notice: `${job.name_ja} Lv${job.level}を選択中。現在確認できる条件では、残り時間に収まる根拠付き育成候補がありません。別ジョブや雑なIDへ勝手に切り替えません。`,
      fallback: { title: "根拠のない候補を出さない", minutes: 0, reason: "選択したジョブを維持します。" },
      combat_job_focus: true,
      combat_efficiency_comparator: true
    };
  }

  const recommended = combined[0];
  const limitedNote = isBlueMage(job)
    ? "青魔道士はリミテッドジョブなので、通常ルーレット/フロントラインではなく専用のフィールド育成だけで比較しています。"
    : "日次・回数制限・反復候補を比較し、IDは比較に勝った時だけ上位に出します。";
  return {
    ...plan,
    planner_kind: "combat-job-focus-v1.7.2",
    session_complete: false,
    focus_job: focusFromJob(job),
    methods: combined,
    now: asNow(recommended),
    next: combined[1] ? { title: combined[1].title, minutes: combined[1].minutes, reason: combined[1].reason } : null,
    fallback: combined[2] ? { title: combined[2].title, minutes: combined[2].minutes, reason: combined[2].reason } : plan.fallback,
    notice: `戦闘ジョブは「${job.name_ja} Lv${job.level}」を選択中。${limitedNote}`,
    combat_job_focus: true,
    combat_efficiency_comparator: true
  };
}

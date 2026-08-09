const LEVELING_DUNGEONS_90_100 = [
  { min: 91, max: 92, name: "濁流遡上 イフイカ・トゥム", level: 91 },
  { min: 93, max: 94, name: "山嶺登頂 ウォーコー・ゾーモー", level: 93 },
  { min: 95, max: 96, name: "遺産踏査 天深きセノーテ", level: 95 },
  { min: 97, max: 98, name: "外征前哨 ヴァンガード", level: 97 },
  { min: 99, max: 99, name: "魂魄工廠 オリジェニクス", level: 99 }
];

const DPS_ROLES = new Set(["melee", "ranged", "caster"]);
const MODES = new Set(["efficient", "craft", "gather", "discover"]);

function normalizeMode(value) {
  return MODES.has(value) ? value : "efficient";
}

function pickHighestJob(character, predicate, includeCapped = false) {
  return (character?.jobs || [])
    .filter(job => job.level !== null && (includeCapped || job.level < 100) && predicate(job))
    .sort((a, b) => (b.level - a.level) || a.code.localeCompare(b.code))[0] || null;
}

function findJob(character, code) {
  return (character?.jobs || []).find(job => job.code === code && job.level !== null) || null;
}

function pickPrimaryCombatJob(character) {
  return pickHighestJob(character, job => !["crafter", "gatherer", "limited"].includes(job.role));
}

function pickCrafterJob(character) {
  return pickHighestJob(character, job => job.role === "crafter");
}

function pickGathererJob(character) {
  return pickHighestJob(character, job => job.role === "gatherer" && job.code !== "FSH")
    || pickHighestJob(character, job => job.role === "gatherer");
}

function dungeonForLevel(level) {
  return LEVELING_DUNGEONS_90_100.find(duty => level >= duty.min && level <= duty.max) || null;
}

function normalizeCompletedDaily(value) {
  return {
    leveling: Boolean(value?.leveling),
    alliance: Boolean(value?.alliance)
  };
}

function normalizeCompletionCounts(value) {
  const result = {};
  if (!value || typeof value !== "object") return result;
  for (const [key, count] of Object.entries(value)) {
    const safeKey = String(key || "").trim();
    const safeCount = Math.max(0, Math.min(99, Number(count) || 0));
    if (safeKey) result[safeKey] = safeCount;
  }
  return result;
}

function withJob(method, job) {
  if (!job) return method;
  return {
    ...method,
    job_code: job.code,
    job_name: job.name_ja,
    job_level: job.level,
    job_role: job.role
  };
}

function asNow(method) {
  if (!method) return null;
  return {
    task_key: method.task_key,
    daily_key: method.daily_key,
    title: method.title,
    minutes: method.minutes,
    reason: method.reason,
    steps: method.steps,
    repeat_count: method.repeat_count || 0
  };
}

function rouletteMethod(job, dailyKey, kind, badge, minutes, reason) {
  return withJob({
    task_key: `roulette:${dailyKey}`,
    daily_key: dailyKey,
    badge,
    title: `${job.name_ja}で「コンテンツルーレット：${kind}」を1回`,
    minutes,
    reason,
    condition: `今日の「${kind}」ボーナスが未消化なら選ぶ`,
    steps: [
      `${job.name_ja}（Lv${job.level}）へジョブチェンジ`,
      "メニュー → コンテンツ情報 → コンテンツファインダー",
      `コンテンツルーレット → 「${kind}」を選択`,
      "1回だけ申請してクリア",
      "終わったら「✓ 完了！」"
    ]
  }, job);
}

function repeatDungeonMethod(job, duty) {
  if (!duty) return null;
  const dps = DPS_ROLES.has(job.role);
  return withJob({
    task_key: `leveling-dungeon:${job.code}:${duty.level}`,
    daily_key: null,
    badge: "日課後の反復",
    title: `${job.name_ja}で「${duty.name}」を1周`,
    minutes: dps ? 35 : 25,
    reason: `Lv${job.level}で入れるLv${duty.level}のレベリングダンジョン。日課後も経験値を優先したい時の反復候補。`,
    condition: dps
      ? "CF待ちを許容できればCF、すぐ始めたいならコンテンツサポーター"
      : "解放済みならCFで1周",
    steps: dps
      ? [
          `${job.name_ja}（Lv${job.level}）へジョブチェンジ`,
          `コンテンツファインダーで「${duty.name}」を確認`,
          "待てるならCF、すぐ始めるならコンテンツサポーターを選ぶ",
          "1周したら「✓ 完了！」"
        ]
      : [
          `${job.name_ja}（Lv${job.level}）へジョブチェンジ`,
          `コンテンツファインダーで「${duty.name}」を選択`,
          "1周したら「✓ 完了！」"
        ]
  }, job);
}

function efficientMethods(character) {
  const job = pickPrimaryCombatJob(character);
  if (!job) return [];
  const methods = [
    rouletteMethod(job, "leveling", "レベリング", "日次ボーナス", 30,
      "未消化なら最優先。1日1回の経験値ボーナスを先に取る。")
  ];
  if (job.level >= 50) {
    methods.push(rouletteMethod(job, "alliance", "アライアンスレイド", "日次ボーナス", 35,
      "個別レイド周回ではなく、アライアンスルーレットの日次ボーナス目的で1回。"));
  }
  const dungeon = repeatDungeonMethod(job, dungeonForLevel(job.level));
  if (dungeon) methods.push(dungeon);
  return methods;
}

function craftMethods(character) {
  const job = pickCrafterJob(character);
  if (!job) return [];
  return [
    withJob({
      task_key: `craft-log-new:${job.code}:${job.level}`,
      daily_key: null,
      badge: "手帳を埋める",
      title: `${job.name_ja}で未製作レシピを3種類だけ作る`,
      minutes: 20,
      reason: "短時間で製作手帳に目に見える進捗を作る。今日は3種類で終了。",
      condition: `Lv${job.level}以下で、素材を用意しやすい未製作レシピがある時`,
      steps: [
        `${job.name_ja}（Lv${job.level}）へジョブチェンジ`,
        "製作手帳を開く",
        "未製作マークの中から素材を用意しやすいものを3種類選ぶ",
        "3種類作ったら「✓ 完了！」"
      ]
    }, job),
    withJob({
      task_key: `craft-leveling:${job.code}:${job.level}`,
      daily_key: null,
      badge: "レベルを進める",
      title: `${job.name_ja}の経験値を25分だけ稼ぐ`,
      minutes: 25,
      reason: "製作のレベル上げを優先する枠。25分で区切り、終わりの見えない連続製作にしない。",
      condition: "今日は製作ジョブのレベルを進めたい時",
      steps: [
        `${job.name_ja}（Lv${job.level}）へジョブチェンジ`,
        "現在レベル帯で経験値を得られる製作コンテンツを1つ選ぶ",
        "25分だけ進める",
        "時間になったら途中でも「✓ 完了！」"
      ]
    }, job),
    withJob({
      task_key: `craft-prep:${job.code}:${job.level}`,
      daily_key: null,
      badge: "軽めの準備",
      title: `${job.name_ja}の次に作りたいものを3件だけ準備する`,
      minutes: 15,
      reason: "今日は作り込む気分じゃない時に、次回の開始コストだけ下げる。",
      condition: "素材確認や手帳整理だけならできそうな時",
      steps: [
        `${job.name_ja}（Lv${job.level}）の製作手帳を開く`,
        "次に作りたいレシピを3件だけ決める",
        "不足素材を確認する",
        "3件決まったら「✓ 完了！」"
      ]
    }, job)
  ];
}

function gatherMethods(character) {
  const job = pickGathererJob(character);
  if (!job) return [];
  const fisher = job.code === "FSH";
  return [
    withJob({
      task_key: `gather-log-new:${job.code}:${job.level}`,
      daily_key: null,
      badge: fisher ? "釣り手帳" : "採集手帳",
      title: fisher
        ? `${job.name_ja}で未釣りを3種類だけ埋める`
        : `${job.name_ja}で未採集を5種類だけ埋める`,
      minutes: 20,
      reason: "手帳に見える進捗を作る。数を少なく固定して、途中でダレないようにする。",
      condition: `Lv${job.level}以下で今行ける場所から選ぶ`,
      steps: fisher
        ? [
            `${job.name_ja}（Lv${job.level}）へジョブチェンジ`,
            "釣り手帳を開く",
            "今行ける釣り場から未釣りを3種類だけ狙う",
            "3種類埋めたら「✓ 完了！」"
          ]
        : [
            `${job.name_ja}（Lv${job.level}）へジョブチェンジ`,
            "採集手帳を開く",
            "今行ける場所から未採集を5種類だけ採る",
            "5種類埋めたら「✓ 完了！」"
          ]
    }, job),
    withJob({
      task_key: `gather-leveling:${job.code}:${job.level}`,
      daily_key: null,
      badge: "レベルを進める",
      title: `${job.name_ja}の経験値を25分だけ稼ぐ`,
      minutes: 25,
      reason: "採集ジョブのレベル上げをしたい日の本命。時間で区切る。",
      condition: "今日はギャザラーのレベルを上げたい時",
      steps: [
        `${job.name_ja}（Lv${job.level}）へジョブチェンジ`,
        "現在レベル帯で経験値を得られる採集場所・コンテンツを1つ選ぶ",
        "25分だけ採集する",
        "時間になったら「✓ 完了！」"
      ]
    }, job),
    withJob({
      task_key: `gather-stock:${job.code}:${job.level}`,
      daily_key: null,
      badge: "素材を貯める",
      title: `${job.name_ja}で使いそうな素材を30個だけ集める`,
      minutes: 15,
      reason: "目的を30個に固定した軽い採集。製作用ストック作りにもつながる。",
      condition: "考えずに採るだけの気分の時",
      steps: [
        `${job.name_ja}（Lv${job.level}）へジョブチェンジ`,
        "今行きやすい採集場所を1つ決める",
        "使いそうな素材を合計30個だけ集める",
        "30個集めたら「✓ 完了！」"
      ]
    }, job)
  ];
}

function discoverMethods(character) {
  const methods = [];
  const anyCombat = pickHighestJob(
    character,
    job => !["crafter", "gatherer", "limited"].includes(job.role),
    true
  );
  const fisher = findJob(character, "FSH");

  methods.push({
    task_key: "discover:gold-saucer-gate",
    daily_key: null,
    badge: "普段やらない遊び",
    title: "ゴールドソーサーでGATEを1回だけ遊ぶ",
    minutes: 20,
    reason: "育成効率から一度離れて、短いイベントを1本だけ触る発見枠。",
    condition: "ゴールドソーサー解放済みなら候補",
    steps: [
      "ゴールドソーサーへ移動",
      "開催中または次に始まるGATEを確認",
      "1回だけ参加する",
      "終わったら「✓ 完了！」"
    ]
  });

  if (fisher) {
    methods.push(withJob({
      task_key: "discover:ocean-fishing",
      daily_key: null,
      badge: "いつもと違う釣り",
      title: `${fisher.name_ja}でオーシャンフィッシングを1航海`,
      minutes: 35,
      reason: "通常の採集とは別物の短時間イベント。受付時間が合う日だけ選べばOK。",
      condition: "オーシャンフィッシングの受付時間が合い、解放済みなら選ぶ",
      steps: [
        `${fisher.name_ja}（Lv${fisher.level}）へジョブチェンジ`,
        "リムサ・ロミンサのオーシャンフィッシング受付を確認",
        "受付中なら1航海だけ参加",
        "終わったら「✓ 完了！」"
      ]
    }, fisher));
  }

  if (Number(character?.bozja_rank || 0) > 0) {
    methods.push(withJob({
      task_key: "discover:bozja-one-set",
      daily_key: null,
      badge: "寄り道コンテンツ",
      title: "南方ボズヤ戦線でスカーミッシュを3回だけ遊ぶ",
      minutes: 30,
      reason: "通常IDとは違う大人数フィールド戦。ランク進行があるので、少しだけ触っても積み上がる。",
      condition: "南方ボズヤ戦線へ入場できる時",
      steps: [
        "南方ボズヤ戦線へ入場",
        "近くで発生しているスカーミッシュに参加",
        "合計3回終わったら切り上げる",
        "「✓ 完了！」を押す"
      ]
    }, anyCombat));
  } else if (anyCombat) {
    methods.push(withJob({
      task_key: "discover:fate-three",
      daily_key: null,
      badge: "寄り道コンテンツ",
      title: `${anyCombat.name_ja}でFATEを3回だけ遊ぶ`,
      minutes: 20,
      reason: "IDやルーレット以外のフィールド遊びを短く触る発見枠。",
      condition: "今いるエリアか移動しやすいエリアでFATEが見つかる時",
      steps: [
        `${anyCombat.name_ja}へジョブチェンジ`,
        "マップで近いFATEを確認",
        "3回だけ参加",
        "終わったら「✓ 完了！」"
      ]
    }, anyCombat));
  }

  return methods.slice(0, 3);
}

function removeCompletedDaily(methods, completedDaily) {
  return methods.filter(method => !method.daily_key || !completedDaily[method.daily_key]);
}

function fitToRemainingTime(methods, availableMinutes) {
  const minutes = Math.max(0, Number(availableMinutes) || 0);
  return methods.filter(method => Number(method.minutes || 0) <= minutes + 5);
}

function applyRepeatPriority(methods, completionCounts) {
  return methods
    .map((method, baseIndex) => {
      const repeatCount = completionCounts[method.task_key] || 0;
      return {
        ...method,
        repeat_count: repeatCount,
        badge: repeatCount > 0 ? `${method.badge} · 今日${repeatCount}回済み` : method.badge,
        _base_index: baseIndex
      };
    })
    .sort((a, b) => {
      const aRepeated = a.repeat_count > 0 ? 1 : 0;
      const bRepeated = b.repeat_count > 0 ? 1 : 0;
      return (aRepeated - bRepeated)
        || (a.repeat_count - b.repeat_count)
        || (a._base_index - b._base_index);
    })
    .map(({ _base_index, ...method }, index) => ({ ...method, rank: index + 1 }));
}

function modeLabel(mode) {
  if (mode === "craft") return "製作";
  if (mode === "gather") return "採集";
  if (mode === "discover") return "おまかせ発見";
  return "効率";
}

function focusFromMethod(method) {
  if (!method || !method.job_name) return null;
  return {
    code: method.job_code,
    name: method.job_name,
    level: method.job_level,
    role: method.job_role
  };
}

function sessionCompletePlan(character, availableMinutes, completedDaily, mode, deferredMethod = null) {
  const remaining = Math.max(0, Math.round(Number(availableMinutes) || 0));
  return {
    planner_kind: "category-first-v0.9",
    session_complete: true,
    selected_mode: mode,
    remaining_minutes: remaining,
    notice: deferredMethod
      ? `残り約${remaining}分。「${deferredMethod.title}」は目安${deferredMethod.minutes}分なので、今日はここで終了でOK。`
      : `残り約${remaining}分。今日はここで終了でOK。`,
    focus_job: null,
    completed_daily: completedDaily,
    methods: [],
    now: null,
    next: null,
    deferred_task: deferredMethod ? { title: deferredMethod.title, minutes: deferredMethod.minutes } : null,
    fallback: { title: "今日はここで終了", minutes: 0 },
    skip_today: ["残り時間を超えて無理に始める", "別カテゴリの候補まで全部やろうとする"]
  };
}

function concretePlan(character, availableMinutes, energy, completedDailyInput, completionCountsInput, modeInput) {
  const mode = normalizeMode(modeInput);
  const completedDaily = normalizeCompletedDaily(completedDailyInput);
  const completionCounts = normalizeCompletionCounts(completionCountsInput);

  let rawMethods;
  if (mode === "craft") rawMethods = craftMethods(character);
  else if (mode === "gather") rawMethods = gatherMethods(character);
  else if (mode === "discover") rawMethods = discoverMethods(character);
  else rawMethods = removeCompletedDaily(efficientMethods(character), completedDaily);

  if (!rawMethods.length) return null;

  const fits = fitToRemainingTime(rawMethods, availableMinutes);
  if (!fits.length) return sessionCompletePlan(character, availableMinutes, completedDaily, mode, rawMethods[0]);

  const methods = applyRepeatPriority(fits, completionCounts).slice(0, 3);
  const recommended = methods[0];
  const label = modeLabel(mode);
  const repeatNote = recommended.repeat_count > 0
    ? "このカテゴリの候補を一通り触っているため、今日の実行回数が少ないものから再提示しています。"
    : "同じTODOの2回目より、まだやっていない候補を優先しています。";

  return {
    planner_kind: "category-first-v0.9",
    session_complete: false,
    selected_mode: mode,
    remaining_minutes: Math.max(0, Math.round(Number(availableMinutes) || 0)),
    notice: `今日は「${label}」。${repeatNote} #1〜#3から気分に合う1つだけ選べばOK。`,
    focus_job: focusFromMethod(recommended),
    completed_daily: completedDaily,
    methods,
    now: asNow(recommended),
    next: methods[1] ? {
      title: methods[1].title,
      minutes: methods[1].minutes,
      reason: "#1の気分じゃない時はこちら。"
    } : null,
    fallback: methods[2] ? {
      title: methods[2].title,
      minutes: methods[2].minutes,
      reason: "さらに別案。"
    } : {
      title: "今日はここで終了",
      minutes: 0,
      reason: "候補を無理に増やさない。"
    },
    skip_today: [
      "選んでいないカテゴリのことを考える",
      "3候補を全部やろうとする",
      "攻略サイトを何個も開いて比較し直す"
    ]
  };
}

export function makeConcretePlan(
  character,
  availableMinutes,
  energy,
  basePlan = null,
  completedDaily = null,
  completionCounts = null,
  mode = "efficient"
) {
  const plan = concretePlan(
    character,
    availableMinutes,
    energy,
    completedDaily,
    completionCounts,
    mode
  );
  if (plan) return plan;
  return basePlan;
}

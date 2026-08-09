const LEVELING_DUNGEONS_90_100 = [
  { min: 91, max: 92, name: "濁流遡上 イフイカ・トゥム", level: 91 },
  { min: 93, max: 94, name: "山嶺登頂 ウォーコー・ゾーモー", level: 93 },
  { min: 95, max: 96, name: "遺産踏査 天深きセノーテ", level: 95 },
  { min: 97, max: 98, name: "外征前哨 ヴァンガード", level: 97 },
  { min: 99, max: 99, name: "魂魄工廠 オリジェニクス", level: 99 }
];

const DPS_ROLES = new Set(["melee", "ranged", "caster"]);

function pickHighestJob(character, predicate) {
  return (character?.jobs || [])
    .filter(job => job.level !== null && job.level < 100 && predicate(job))
    .sort((a, b) => (b.level - a.level) || a.code.localeCompare(b.code))[0] || null;
}

function pickPrimaryCombatJob(character) {
  return pickHighestJob(
    character,
    job => !["crafter", "gatherer", "limited"].includes(job.role)
  );
}

function pickCrafterJob(character) {
  return pickHighestJob(character, job => job.role === "crafter");
}

function pickGathererJob(character) {
  const nonFisher = pickHighestJob(
    character,
    job => job.role === "gatherer" && job.code !== "FSH"
  );
  return nonFisher || pickHighestJob(character, job => job.role === "gatherer");
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
    lane: method.lane,
    title: method.title,
    minutes: method.minutes,
    reason: method.reason,
    steps: method.steps,
    repeat_count: method.repeat_count || 0
  };
}

function rouletteMethod(job, dailyKey, kind, badge, minutes, reason) {
  return withJob({
    lane: "combat",
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
      "終わったらこのカードの「✓ 完了！」を押す"
    ]
  }, job);
}

function repeatDungeonMethod(job, duty) {
  if (!duty) return null;
  const dps = DPS_ROLES.has(job.role);
  return withJob({
    lane: "combat",
    task_key: `leveling-dungeon:${job.code}:${duty.level}`,
    daily_key: null,
    badge: "効率本命・戦闘",
    title: `${job.name_ja}で「${duty.name}」を1周`,
    minutes: dps ? 35 : 25,
    reason: dps
      ? `Lv${job.level}で入れるLv${duty.level}のレベリングダンジョン。日課ボーナス後の経験値効率を優先したい時の候補。DPSで待ちたくない時は同じIDをコンテンツサポーターで開始できる。`
      : `Lv${job.level}で入れるLv${duty.level}のレベリングダンジョン。日課ボーナス後の経験値効率を優先したい時の候補。`,
    condition: dps
      ? `「${duty.name}」解放済み。CF待ちが気にならなければCF、すぐ始めたいならコンテンツサポーター`
      : `「${duty.name}」解放済みならCFで1周`,
    steps: dps
      ? [
          `${job.name_ja}（Lv${job.level}）へジョブチェンジ`,
          `コンテンツファインダーで「${duty.name}」を確認`,
          "待ち時間を許容できるならそのままCFで1周",
          `すぐ始めたいなら メニュー → コンテンツ情報 → コンテンツサポーター → 「${duty.name}」`,
          "どちらか片方で1周したら「✓ 完了！」"
        ]
      : [
          `${job.name_ja}（Lv${job.level}）へジョブチェンジ`,
          `コンテンツファインダーで「${duty.name}」を選択`,
          "1回申請してクリア",
          "終わったら「✓ 完了！」"
        ]
  }, job);
}

function crafterMethod(job) {
  if (!job) return null;
  return withJob({
    lane: "craft",
    task_key: `craft-log:${job.code}:${job.level}`,
    daily_key: null,
    badge: "作る・別方向",
    title: `${job.name_ja}で製作手帳を20分だけ進める`,
    minutes: 20,
    reason: "戦闘の気分じゃない時の別方向。効率競争より、手帳に見える進捗を作って一区切りつける。",
    condition: `Lv${job.level}以下で、今ある素材か店売り素材で作れるものを選ぶ`,
    steps: [
      `${job.name_ja}（Lv${job.level}）へジョブチェンジ`,
      "製作手帳を開く",
      "未製作マークがあるレシピを、作りやすい順に3種類だけ製作する",
      "未製作が見つからなければ、現在レベル帯の作りやすいレシピを3回製作する",
      "3種類または3回終わったら「✓ 完了！」"
    ]
  }, job);
}

function gathererMethod(job) {
  if (!job) return null;
  const fisher = job.code === "FSH";
  return withJob({
    lane: "gather",
    task_key: `${fisher ? "fishing-log" : "gather-log"}:${job.code}:${job.level}`,
    daily_key: null,
    badge: fisher ? "釣る・まったり" : "採る・まったり",
    title: fisher
      ? `${job.name_ja}で釣り手帳の未釣りを3種類埋める`
      : `${job.name_ja}で採集手帳の未採集を5種類埋める`,
    minutes: 20,
    reason: "戦闘や製作から離れて、手帳を少しずつ埋める気分転換枠。短時間で終点が見える量だけに絞る。",
    condition: `Lv${job.level}以下の手帳項目から、移動しやすい場所を優先する`,
    steps: fisher
      ? [
          `${job.name_ja}（Lv${job.level}）へジョブチェンジ`,
          "釣り手帳を開く",
          "未釣りのうち、今すぐ行ける釣り場から3種類だけ狙う",
          "3種類埋まったら「✓ 完了！」"
        ]
      : [
          `${job.name_ja}（Lv${job.level}）へジョブチェンジ`,
          "採集手帳を開く",
          "未採集のうち、今すぐ行ける場所から5種類だけ採る",
          "5種類埋まったら「✓ 完了！」"
        ]
  }, job);
}

function makeCombatMethods(job, duty) {
  const methods = [
    rouletteMethod(
      job,
      "leveling",
      "レベリング",
      "効率本命・今日まだなら最優先",
      30,
      "1日1回の経験値ボーナスを先に取る。まずここを消化してから反復周回を考える。"
    )
  ];

  if (job.level >= 50) {
    methods.push(
      rouletteMethod(
        job,
        "alliance",
        "アライアンスレイド",
        "効率本命・日課の次点",
        35,
        "個別アライアンス周回ではなく、ルーレットの日次ボーナス目的で1回だけ使う。"
      )
    );
  }

  const dungeon = repeatDungeonMethod(job, duty);
  if (dungeon) methods.push(dungeon);
  return methods;
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
        badge: repeatCount > 0
          ? `${method.badge} · 今日${repeatCount}回済み`
          : method.badge,
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

function completedLabel(completedDaily) {
  const done = [];
  if (completedDaily.leveling) done.push("レベルレ済み");
  if (completedDaily.alliance) done.push("アラルレ済み");
  return done;
}

function focusFromMethod(method, fallback) {
  if (!method) return fallback;
  return {
    code: method.job_code,
    name: method.job_name,
    level: method.job_level,
    role: method.job_role
  };
}

function sessionCompletePlan(primary, availableMinutes, completedDaily, deferredMethod = null) {
  const remaining = Math.max(0, Math.round(Number(availableMinutes) || 0));
  return {
    planner_kind: "session-complete-v0.9",
    session_complete: true,
    remaining_minutes: remaining,
    notice: deferredMethod
      ? `残り約${remaining}分。次の候補「${deferredMethod.title}」は目安${deferredMethod.minutes}分なので、今日はここで終了でOK。`
      : `残り約${remaining}分。今日はここで終了でOK。`,
    focus_job: { code: primary.code, name: primary.name_ja, level: primary.level, role: primary.role },
    completed_daily: completedDaily,
    methods: [],
    now: null,
    next: null,
    deferred_task: deferredMethod ? { title: deferredMethod.title, minutes: deferredMethod.minutes } : null,
    fallback: { title: "今日はここで終了", minutes: 0, reason: "残り時間に無理に詰め込まず、完了履歴だけ残して終わる。" },
    skip_today: ["残り時間を超えるコンテンツを無理に始める", "次に何をするか自分で探し直す"]
  };
}

function concretePlan(character, availableMinutes, energy, completedDailyInput, completionCountsInput) {
  const primary = pickPrimaryCombatJob(character);
  if (!primary) return null;

  const completedDaily = normalizeCompletedDaily(completedDailyInput);
  const completionCounts = normalizeCompletionCounts(completionCountsInput);
  const duty = dungeonForLevel(primary.level);

  const combatCandidates = fitToRemainingTime(
    removeCompletedDaily(makeCombatMethods(primary, duty), completedDaily),
    availableMinutes
  );
  const combatLane = combatCandidates[0] || null;
  const craftLane = crafterMethod(pickCrafterJob(character));
  const gatherLane = gathererMethod(pickGathererJob(character));

  const lanePool = fitToRemainingTime(
    [combatLane, craftLane, gatherLane].filter(Boolean),
    availableMinutes
  );

  if (!lanePool.length) {
    const deferred = combatCandidates[0] || craftLane || gatherLane || null;
    return sessionCompletePlan(primary, availableMinutes, completedDaily, deferred);
  }

  const methods = applyRepeatPriority(lanePool, completionCounts).slice(0, 3);
  const recommended = methods[0];
  const completed = completedLabel(completedDaily);
  const completionNote = completed.length
    ? `${completed.join("・")}を反映済み。`
    : "日課チェックはまだ未完了。";
  const repeatNote = recommended.repeat_count > 0
    ? "候補3方向を一通り触っているため、最も回数が少ない再候補を先頭にしています。"
    : "同じTODOの2回目より、まだやっていない方向を優先します。";

  return {
    planner_kind: "diverse-lanes-v0.9",
    session_complete: false,
    remaining_minutes: Math.max(0, Math.round(Number(availableMinutes) || 0)),
    notice: `${completionNote} ${repeatNote} #1が気分じゃなければ#2/#3へ逃げてOK。`,
    focus_job: focusFromMethod(recommended, {
      code: primary.code,
      name: primary.name_ja,
      level: primary.level,
      role: primary.role
    }),
    completed_daily: completedDaily,
    methods,
    now: asNow(recommended),
    next: methods[1] ? {
      title: methods[1].title,
      minutes: methods[1].minutes,
      reason: "#1の気分じゃない時は、方向の違うこちらを選んでOK。"
    } : null,
    fallback: {
      title: methods[methods.length - 1]?.title || `${primary.name_ja}に着替えるだけ`,
      minutes: methods[methods.length - 1]?.minutes || 2,
      reason: "今日は本命の気分じゃなくても、別方向から1個進めれば十分。"
    },
    skip_today: [
      "同じIDの2周目を、未実行の別方向より先に置く",
      "3つ全部やろうとする",
      "攻略サイトを何個も開いて効率比較する"
    ]
  };
}

export function makeConcretePlan(
  character,
  availableMinutes,
  energy,
  basePlan = null,
  completedDaily = null,
  completionCounts = null
) {
  const plan = concretePlan(
    character,
    availableMinutes,
    energy,
    completedDaily,
    completionCounts
  );
  if (plan) return plan;
  return basePlan;
}

const LEVELING_DUNGEONS_90_100 = [
  { min: 91, max: 92, name: "濁流遡上 イフイカ・トゥム", level: 91 },
  { min: 93, max: 94, name: "山嶺登頂 ウォーコー・ゾーモー", level: 93 },
  { min: 95, max: 96, name: "遺産踏査 天深きセノーテ", level: 95 },
  { min: 97, max: 98, name: "外征前哨 ヴァンガード", level: 97 },
  { min: 99, max: 99, name: "魂魄工廠 オリジェニクス", level: 99 }
];

const DPS_ROLES = new Set(["melee", "ranged", "caster"]);

function pickPrimaryCombatJob(character) {
  return (character?.jobs || [])
    .filter(job => job.level !== null && job.level < 100 && !["crafter", "gatherer", "limited"].includes(job.role))
    .sort((a, b) => (b.level - a.level) || a.code.localeCompare(b.code))[0] || null;
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

function normalizeCompletedTaskKeys(value) {
  const source = Array.isArray(value) ? value : [];
  return new Set(
    source
      .map(item => String(item || "").trim())
      .filter(Boolean)
      .slice(0, 100)
  );
}

function asNow(method) {
  if (!method) return null;
  return {
    task_key: method.task_key,
    daily_key: method.daily_key,
    title: method.title,
    minutes: method.minutes,
    reason: method.reason,
    steps: method.steps
  };
}

function rouletteMethod(job, dailyKey, kind, badge, minutes, reason) {
  return {
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
  };
}

function repeatDungeonMethod(job, duty) {
  if (!duty) return null;
  const dps = DPS_ROLES.has(job.role);
  return {
    task_key: `leveling-dungeon:${job.code}:${duty.level}`,
    daily_key: null,
    badge: dps ? "日課後の反復" : "日課後の本命",
    title: `${job.name_ja}で「${duty.name}」を1周`,
    minutes: dps ? 35 : 25,
    reason: dps
      ? `Lv${job.level}で入れるLv${duty.level}のレベリングダンジョン。日課ボーナス後は、現在レベルに近いレベリングIDを反復候補にする。DPSで待ちたくない時は同じIDをコンテンツサポーターで開始できる。`
      : `Lv${job.level}で入れるLv${duty.level}のレベリングダンジョン。日課ボーナス後の反復候補。`,
    condition: dps
      ? `「${duty.name}」解放済み。CF待ちが気にならなければCF、すぐ始めたいならコンテンツサポーター`
      : `「${duty.name}」解放済みならCFで1周`,
    steps: dps
      ? [
          `${job.name_ja}（Lv${job.level}）へジョブチェンジ`,
          `まずコンテンツファインダーで「${duty.name}」を確認`,
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
  };
}

function makeMethods(job, duty) {
  const methods = [
    rouletteMethod(
      job,
      "leveling",
      "レベリング",
      "今日まだなら最優先",
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
        "日課の次点",
        35,
        "アライアンスレイドは個別コンテンツ周回ではなく、ルーレットの日次ボーナス目的で1回だけ使う。"
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

function removeCompletedTasks(methods, completedTaskKeys) {
  return methods.filter(method => !completedTaskKeys.has(method.task_key));
}

function fitToRemainingTime(methods, availableMinutes) {
  const minutes = Math.max(0, Number(availableMinutes) || 0);
  return methods.filter(method => Number(method.minutes || 0) <= minutes + 5);
}

function rerankMethods(methods) {
  return methods.map((method, index) => ({ ...method, rank: index + 1 }));
}

function completedLabel(completedDaily) {
  const done = [];
  if (completedDaily.leveling) done.push("レベルレ済み");
  if (completedDaily.alliance) done.push("アラルレ済み");
  return done;
}

function sessionCompletePlan(primary, availableMinutes, completedDaily, deferredMethod = null) {
  const remaining = Math.max(0, Math.round(Number(availableMinutes) || 0));
  return {
    planner_kind: "session-complete-v0.8.1",
    session_complete: true,
    remaining_minutes: remaining,
    notice: deferredMethod
      ? `残り約${remaining}分。次の候補「${deferredMethod.title}」は目安${deferredMethod.minutes}分なので、今日はここで終了でOK。`
      : `残り約${remaining}分。今日すでに完了したTODOは繰り返し表示しません。今日はここで終了でOK。`,
    focus_job: { code: primary.code, name: primary.name_ja, level: primary.level, role: primary.role },
    completed_daily: completedDaily,
    methods: [],
    now: null,
    next: null,
    deferred_task: deferredMethod ? { title: deferredMethod.title, minutes: deferredMethod.minutes } : null,
    fallback: { title: "今日はここで終了", minutes: 0, reason: "完了済みTODOをもう一度出さず、次の違う候補が追加されるまでここで終える。" },
    skip_today: ["完了した同じTODOをそのまま繰り返す", "次に何をするか自分で探し直す"]
  };
}

function concreteCombatPlan(character, availableMinutes, energy, completedDailyInput, completedTaskKeysInput) {
  const primary = pickPrimaryCombatJob(character);
  if (!primary) return null;

  const completedDaily = normalizeCompletedDaily(completedDailyInput);
  const completedTaskKeys = normalizeCompletedTaskKeys(completedTaskKeysInput);
  const duty = dungeonForLevel(primary.level);
  const afterDaily = removeCompletedDaily(makeMethods(primary, duty), completedDaily);
  const afterCompletedTasks = removeCompletedTasks(afterDaily, completedTaskKeys);
  if (!afterCompletedTasks.length) return sessionCompletePlan(primary, availableMinutes, completedDaily);

  const methods = rerankMethods(fitToRemainingTime(afterCompletedTasks, availableMinutes));
  if (!methods.length) return sessionCompletePlan(primary, availableMinutes, completedDaily, afterCompletedTasks[0]);

  const recommended = methods[0];
  const completed = completedLabel(completedDaily);
  const completionNote = completed.length
    ? ` ${completed.join("・")}を除外して並べ替え済み。`
    : " 日課チェックはまだ未完了。";

  return {
    planner_kind: "complete-next-v0.8.1",
    session_complete: false,
    remaining_minutes: Math.max(0, Math.round(Number(availableMinutes) || 0)),
    notice: `Lv${primary.level} ${primary.name_ja}向け。${completionNote}今日完了したTODOも再提示しません。終わったら「✓ 完了！」だけ押せば次へ進みます。`,
    focus_job: { code: primary.code, name: primary.name_ja, level: primary.level, role: primary.role },
    completed_daily: completedDaily,
    methods,
    now: asNow(recommended),
    next: methods[1] ? {
      title: methods[1].title,
      minutes: methods[1].minutes,
      reason: `#1が終わって時間が残っていれば自動でこちらへ切り替え。${methods[1].condition || "次の候補。"}`
    } : null,
    fallback: {
      title: methods[methods.length - 1]?.title || `${primary.name_ja}に着替えるだけ`,
      minutes: 2,
      reason: "気力が落ちたら、候補を探し直さず今表示されている最後の候補の入口まで進めばOK。"
    },
    skip_today: [
      "完了した同じTODOをもう一度おすすめする",
      "完了後にもう一度「今日やることを決める」を押す",
      "チェック済みの日課をもう一度おすすめ候補として考える",
      "攻略サイトを何個も開いて効率比較する",
      "別ジョブの育成先をその場で考え直す"
    ]
  };
}

export function makeConcretePlan(
  character,
  availableMinutes,
  energy,
  basePlan = null,
  completedDaily = null,
  completedTaskKeys = null
) {
  const combat = concreteCombatPlan(
    character,
    availableMinutes,
    energy,
    completedDaily,
    completedTaskKeys
  );
  if (combat) return combat;
  return basePlan;
}

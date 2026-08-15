const LEVELING_DUNGEONS_90_100 = [
  { min: 91, max: 92, name: "濁流遡上 イフイカ・トゥム", level: 91 },
  { min: 93, max: 94, name: "山嶺登頂 ウォーコー・ゾーモー", level: 93 },
  { min: 95, max: 96, name: "遺産踏査 天深きセノーテ", level: 95 },
  { min: 97, max: 98, name: "外征前哨 ヴァンガード", level: 97 },
  { min: 99, max: 99, name: "魂魄工廠 オリジェニクス", level: 99 }
];

const DPS_ROLES = new Set(["melee", "ranged", "caster"]);
const MODES = new Set(["efficient", "craft", "gather", "discover"]);
const EORZEA_REAL_SECONDS_PER_HOUR = 175;

function normalizeMode(value) {
  return MODES.has(value) ? value : "efficient";
}

function pickCatchupJob(character, predicate, includeCapped = false) {
  return (character?.jobs || [])
    .filter(job => job.level !== null && (includeCapped || job.level < 100) && predicate(job))
    .sort((a, b) => (a.level - b.level) || a.code.localeCompare(b.code))[0] || null;
}

function findJob(character, code) {
  return (character?.jobs || []).find(job => job.code === code && job.level !== null) || null;
}

function pickPrimaryCombatJob(character) {
  return pickCatchupJob(character, job => !["crafter", "gatherer", "limited"].includes(job.role));
}

function pickCrafterJob(character) {
  return pickCatchupJob(character, job => job.role === "crafter");
}

function pickGathererJob(character) {
  return pickCatchupJob(character, job => job.role === "gatherer" && job.code !== "FSH")
    || pickCatchupJob(character, job => job.role === "gatherer");
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
    condition: method.condition,
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
    condition: `目的：${job.name_ja}の経験値。今日の「${kind}」日次ボーナスを回収する。`,
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
    badge: "日課後の経験値",
    title: `${job.name_ja}で「${duty.name}」を1周`,
    minutes: dps ? 35 : 25,
    reason: `Lv${job.level}で入れるLv${duty.level}のレベリングダンジョン。日課消化後も経験値を伸ばす目的で出しています。`,
    condition: dps
      ? "目的：待ち時間の判断を増やさないため、DPSはコンテンツサポーターで1周する。"
      : "目的：現在レベル帯の経験値を1周ぶん確実に積む。",
    steps: dps
      ? [
          `${job.name_ja}（Lv${job.level}）へジョブチェンジ`,
          `コンテンツサポーターで「${duty.name}」を選択`,
          "1周する",
          "終わったら「✓ 完了！」"
        ]
      : [
          `${job.name_ja}（Lv${job.level}）へジョブチェンジ`,
          `コンテンツファインダーで「${duty.name}」を選択`,
          "1周する",
          "終わったら「✓ 完了！」"
        ]
  }, job);
}

function efficientMethods(character) {
  const job = pickPrimaryCombatJob(character);
  if (!job) return [];
  const methods = [
    rouletteMethod(job, "leveling", "レベリング", "日次ボーナス", 30,
      "低Lvジョブを先に追いつかせて装備帯を揃える方針。1日1回の経験値ボーナスを最低Lv側へ使います。")
  ];
  if (job.level >= 50) {
    methods.push(rouletteMethod(job, "alliance", "アライアンスレイド", "日次ボーナス", 35,
      "低Lvジョブの底上げを優先しつつ、1日1回のアライアンスルーレット経験値ボーナスを回収します。"));
  }
  const dungeon = repeatDungeonMethod(job, dungeonForLevel(job.level));
  if (dungeon) methods.push(dungeon);
  return methods;
}

function exactAlchemistMethods(job) {
  if (job.level < 90 || job.level > 91) return [];
  return [
    withJob({
      task_key: "craft:alc90:leve:ginseng-angle-brush",
      daily_key: null,
      badge: "ギルドリーヴ納品",
      title: "ギルドリーヴ用「Ginseng Angle Brush」をHQで1個作る",
      minutes: 20,
      reason: "TuliyollalのLv90ギルドリーヴ「Big Brush, Big Dreams」の納品物。1個納品で2,695,430 EXP＋約5,060ギル、HQ納品なら報酬が増えるため、目的のない製作より優先します。",
      condition: "目的：錬金術師の経験値をリーヴ1枚で大きく進める。発行NPCはTuliyollalのMalihali（X:13.7 Y:12.7）。",
      steps: [
        `${job.name_ja}（Lv${job.level}）へジョブチェンジ`,
        "製作手帳で「Ginseng Angle Brush」を開く",
        "HQを1個だけ製作する",
        "Tuliyollal（X:13.7 Y:12.7）のMalihaliで「Big Brush, Big Dreams」を受注して納品",
        "終わったら「✓ 完了！」"
      ]
    }, job),
    withJob({
      task_key: "craft:alc90:leve:growth-formula-lambda",
      daily_key: null,
      badge: "材料軽めのリーヴ",
      title: "ギルドリーヴ用「Growth Formula Lambda」をHQで3個作る",
      minutes: 18,
      reason: "TuliyollalのLv90ギルドリーヴ「Fast-forwarding Flora」の納品物。3個納品で1,440,660 EXP＋約2,530ギル。Ginseng Angle BrushよりEXP効率は低いが、材料構成が単純な代替案です。",
      condition: "目的：リーヴ納品で錬金術師経験値を確定で進める。発行NPCはTuliyollalのMalihali（X:13.7 Y:12.7）。",
      steps: [
        `${job.name_ja}（Lv${job.level}）へジョブチェンジ`,
        "製作手帳で「Growth Formula Lambda」を開く",
        "HQを3個だけ製作する",
        "Tuliyollal（X:13.7 Y:12.7）のMalihaliで「Fast-forwarding Flora」を受注して納品",
        "終わったら「✓ 完了！」"
      ]
    }, job),
    withJob({
      task_key: "craft:alc91:collectable:loboskin-grimoire",
      daily_key: null,
      badge: "紫貨＋経験値",
      title: "収集品「Rarefied Loboskin Grimoire」を1個作って納品する",
      minutes: 20,
      reason: "Lv91錬金術師の収集品で、収集価値に応じて経験値と紫貨が得られる。リーヴ権を消費したくない時の、目的が明確な製作候補です。",
      condition: "目的：リーヴ権を使わず、錬金術師経験値とクラフタースクリップ紫貨を同時に得る。",
      steps: [
        `${job.name_ja}（Lv${job.level}）へジョブチェンジ`,
        "製作手帳 → スペシャルレシピ → 収集品で「Rarefied Loboskin Grimoire」を開く",
        "収集価値を上げて1個だけ製作する",
        "収集品取引窓口へ1個納品する",
        "終わったら「✓ 完了！」"
      ]
    }, job)
  ].filter(method => job.level >= (method.task_key.includes("alc91") ? 91 : 90));
}

function craftMethods(character) {
  const job = pickCrafterJob(character);
  if (!job) return [];
  if (job.code === "ALC") return exactAlchemistMethods(job);
  return [];
}

function eorzeaHour(nowMs = Date.now()) {
  const realSeconds = nowMs / 1000;
  const eorzeaSeconds = realSeconds * (3600 / EORZEA_REAL_SECONDS_PER_HOUR);
  return ((eorzeaSeconds / 3600) % 24 + 24) % 24;
}

function minutesUntilAmetrineWindow(nowMs = Date.now()) {
  const hour = eorzeaHour(nowMs);
  const starts = [0, 12];
  let bestHours = 24;
  let open = false;
  for (const start of starts) {
    const sinceStart = (hour - start + 24) % 24;
    if (sinceStart >= 0 && sinceStart < 2) open = true;
    const until = (start - hour + 24) % 24;
    if (until < bestHours) bestHours = until;
  }
  return {
    open,
    minutes: open ? 0 : Math.max(1, Math.ceil(bestHours * EORZEA_REAL_SECONDS_PER_HOUR / 60))
  };
}

function exactMinerMethods(job) {
  if (job.level < 81) return [];
  const window = minutesUntilAmetrineWindow();
  const windowText = window.open
    ? "いま出現時間内（ET 00:00-02:00 / 12:00-14:00）"
    : `次の出現まで実時間約${window.minutes}分`;
  return [
    withJob({
      task_key: "gather:min81:collectable:rarefied-raw-ametrine",
      daily_key: null,
      badge: window.open ? "今しか採れない" : "時間限定・次窓あり",
      title: "「Rarefied Raw Ametrine」を収集価値1000目標で採る",
      minutes: Math.max(12, Math.min(30, window.minutes + 10)),
      reason: `Lv81採掘師の時間限定収集品。${windowText}。収集価値1000なら紫貨22＋経験値約111万が目安なので、時間窓が近い時は通常採集より優先します。`,
      condition: "目的：時間限定ノードを逃さず、ギャザラースクリップ紫貨と経験値を同時に得る。",
      steps: [
        `${job.name_ja}（Lv${job.level}）へジョブチェンジ`,
        "Labyrinthos「The Archeion」へテレポ",
        "Psyche（X:32.5 Y:21.2）へ移動",
        "ET 00:00-02:00 または 12:00-14:00 の採掘ノードで Rarefied Raw Ametrine を採集",
        "収集品取引窓口へ納品して「✓ 完了！」"
      ]
    }, job),
    withJob({
      task_key: "gather:min81:collectable:rarefied-high-durium-ore",
      daily_key: null,
      badge: "いつでも採れる収集品",
      title: "Thavnairで「Rarefied High Durium Ore」を収集品として採る",
      minutes: 15,
      reason: "Lv81から採れる常設の収集品。時間窓待ちが不要で、紫貨を確実に積めるため、時間限定ノードを待ちたくない時の明確な代替案です。",
      condition: "目的：場所と納品先が決まった採集だけを行い、ギャザラースクリップ紫貨を増やす。",
      steps: [
        `${job.name_ja}（Lv${job.level}）へジョブチェンジ`,
        "Thavnair「The Great Work」へテレポ",
        "Lv85 Mineral Deposit（目安 X:17.2 Y:19.2）へ移動",
        "Rarefied High Durium Ore を収集品として採集",
        "収集品取引窓口へ納品して「✓ 完了！」"
      ]
    }, job)
  ];
}

function gatherMethods(character) {
  const job = pickGathererJob(character);
  if (!job) return [];
  if (job.code === "MIN") return exactMinerMethods(job);
  return [];
}

function discoverMethods(character) {
  const methods = [];
  const anyCombat = pickCatchupJob(
    character,
    job => !["crafter", "gatherer", "limited"].includes(job.role),
    true
  );
  const fisher = findJob(character, "FSH");

  methods.push({
    task_key: "discover:gold-saucer-gate",
    daily_key: null,
    badge: "短い寄り道",
    title: "ゴールドソーサーで次のGATEを1回だけ遊ぶ",
    minutes: 20,
    reason: "育成効率から離れて短いイベントを1本だけ遊ぶ発見枠。終点が明確なので、寄り道が長引きにくい。",
    condition: "目的：普段の育成ループから外れた遊びを20分以内で試す。",
    steps: [
      "ゴールドソーサーへ移動",
      "イベント案内で次のGATEを確認",
      "そのGATEに1回だけ参加",
      "終わったら「✓ 完了！」"
    ]
  });

  if (fisher) {
    methods.push(withJob({
      task_key: "discover:ocean-fishing",
      daily_key: null,
      badge: "イベント釣り",
      title: `${fisher.name_ja}でオーシャンフィッシングを1航海`,
      minutes: 35,
      reason: "通常の採集とは違う、開始と終了がはっきりした釣りイベント。1航海だけで区切れるため発見枠に入れます。",
      condition: "目的：通常のレベリング以外の釣りコンテンツを1航海だけ体験する。",
      steps: [
        `${fisher.name_ja}（Lv${fisher.level}）へジョブチェンジ`,
        "リムサ・ロミンサのオーシャンフィッシング受付へ移動",
        "受付可能な便に1航海だけ参加",
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
      reason: "通常IDとは違う大人数フィールド戦で、既存のボズヤランク進行も積み上がるため。",
      condition: "目的：いつものID以外の戦闘を試しつつ、ボズヤ進行も残す。",
      steps: [
        "南方ボズヤ戦線へ入場",
        "発生中のスカーミッシュへ参加",
        "合計3回終わったら切り上げる",
        "「✓ 完了！」を押す"
      ]
    }, anyCombat));
  } else if (anyCombat) {
    methods.push(withJob({
      task_key: "discover:fate-three",
      daily_key: null,
      badge: "フィールド寄り道",
      title: `${anyCombat.name_ja}でFATEを3回だけ遊ぶ`,
      minutes: 20,
      reason: "IDやルーレット以外のフィールド戦闘を短時間で試すための発見枠。",
      condition: "目的：普段のCF外の戦闘を3回だけ触って終了する。",
      steps: [
        `${anyCombat.name_ja}へジョブチェンジ`,
        "現在地のマップを開く",
        "近いFATEへ3回参加",
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

function sessionCompletePlan(availableMinutes, completedDaily, mode, deferredMethod = null, noticeOverride = null) {
  const remaining = Math.max(0, Math.round(Number(availableMinutes) || 0));
  return {
    planner_kind: "decision-owned-v1.3",
    session_complete: true,
    selected_mode: mode,
    remaining_minutes: remaining,
    notice: noticeOverride || (deferredMethod
      ? `残り約${remaining}分。「${deferredMethod.title}」は目安${deferredMethod.minutes}分なので、今日はここで終了でOK。`
      : `残り約${remaining}分。今日はここで終了でOK。`),
    focus_job: null,
    completed_daily: completedDaily,
    methods: [],
    now: null,
    next: null,
    deferred_task: deferredMethod ? { title: deferredMethod.title, minutes: deferredMethod.minutes } : null,
    fallback: { title: "今日はここで終了", minutes: 0 },
    skip_today: ["自分で候補を検索して比較する", "目的のない作業を数だけこなす"]
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

  if (!rawMethods.length) {
    if (mode === "craft" || mode === "gather") {
      return sessionCompletePlan(
        availableMinutes,
        completedDaily,
        mode,
        null,
        "最低Lv側を優先していますが、この職・レベル帯は対象・場所・報酬根拠まで確定できる候補がまだありません。適当な『何か作る／採る』は出しません。"
      );
    }
    return null;
  }

  const fits = fitToRemainingTime(rawMethods, availableMinutes);
  if (!fits.length) return sessionCompletePlan(availableMinutes, completedDaily, mode, rawMethods[0]);

  const methods = applyRepeatPriority(fits, completionCounts).slice(0, 3);
  const recommended = methods[0];
  const label = modeLabel(mode);
  const repeatNote = recommended.repeat_count > 0
    ? "今日すでに実行済みですが、同カテゴリ内でまだ目的・報酬根拠が強いため再提示しています。"
    : "最低Lv側を先に追いつかせつつ、目的・報酬・場所まで具体化できる候補を優先しています。";

  return {
    planner_kind: "decision-owned-v1.4-low-level-catchup",
    session_complete: false,
    selected_mode: mode,
    remaining_minutes: Math.max(0, Math.round(Number(availableMinutes) || 0)),
    notice: `今日は「${label}」。${repeatNote}`,
    focus_job: focusFromMethod(recommended),
    completed_daily: completedDaily,
    methods,
    now: asNow(recommended),
    next: methods[1] ? {
      title: methods[1].title,
      minutes: methods[1].minutes,
      reason: methods[1].reason
    } : null,
    fallback: methods[2] ? {
      title: methods[2].title,
      minutes: methods[2].minutes,
      reason: methods[2].reason
    } : {
      title: "今日はここで終了",
      minutes: 0,
      reason: "根拠の薄い候補を水増ししない。"
    },
    skip_today: [
      "候補の中身を自分で決め直す",
      "攻略サイトを何個も開いて比較する",
      "目的のない製作・採集を数だけこなす"
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

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

function asNow(method) {
  return {
    title: method.title,
    minutes: method.minutes,
    reason: method.reason,
    steps: method.steps
  };
}

function makeDpsMethods(job, duty) {
  const methods = [
    {
      rank: 1,
      badge: "今日まだなら最優先",
      title: `${job.name_ja}で「コンテンツルーレット：レベリング」を1回`,
      minutes: 30,
      reason: "1日1回の経験値ボーナスを先に取る。レベル上げの日は、まずこれを消化するのが基本。",
      condition: "今日のレベリングルーレットが未消化なら選ぶ",
      steps: [
        `${job.name_ja}（Lv${job.level}）へジョブチェンジ`,
        "メニュー → コンテンツ情報 → コンテンツファインダー",
        "コンテンツルーレット → 「レベリング」を選択",
        "1回だけ申請してクリア"
      ]
    },
    {
      rank: 2,
      badge: "DPSの反復周回",
      title: `${job.name_ja}で「輝ける神域 アグライア」を1周`,
      minutes: 25,
      reason: "DPSは適正IDの待ち時間が伸びやすいので、暁月アライアンスを反復候補にする。1周で切り上げやすい。",
      condition: "レベリングルーレット消化済み・アグライア解放済みなら選ぶ",
      steps: [
        `${job.name_ja}のままコンテンツファインダーを開く`,
        "アライアンスレイド → 「輝ける神域 アグライア」を選択",
        "1回申請して1周クリア",
        "まだ遊ぶなら同じ方法をもう1周。別の候補探しはしない"
      ]
    }
  ];

  if (duty) {
    methods.push({
      rank: 3,
      badge: "待ち時間ゼロ",
      title: `${job.name_ja}で「${duty.name}」をコンテンツサポーター1周`,
      minutes: 35,
      reason: `Lv${job.level}で入れるLv${duty.level}ダンジョン。マッチングを待たず、自分のペースで確実に開始できる。`,
      condition: `「${duty.name}」解放済みなら選ぶ`,
      steps: [
        `${job.name_ja}（Lv${job.level}）へジョブチェンジ`,
        "メニュー → コンテンツ情報 → コンテンツサポーター",
        `「黄金のレガシー」→「${duty.name}」を選択`,
        "サポートNPCで1周だけクリア"
      ]
    });
  } else {
    methods.push({
      rank: 3,
      badge: "ソロ寄り",
      title: `${job.name_ja}で「ピルグリム・トラバース」を10階層進める`,
      minutes: 30,
      reason: "Lv91～100向けのディープダンジョン。ルーレット以外の反復候補として使える。",
      condition: "ピルグリム・トラバース解放済みなら選ぶ",
      steps: [
        `${job.name_ja}へジョブチェンジ`,
        "イル・メグのヴァンサウからピルグリム・トラバースへ突入",
        "現在進行できる10階層だけ進める",
        "10階層区切りで終了"
      ]
    });
  }

  return methods;
}

function makeTankHealerMethods(job, duty) {
  const methods = [
    {
      rank: 1,
      badge: "今日まだなら最優先",
      title: `${job.name_ja}で「コンテンツルーレット：レベリング」を1回`,
      minutes: 30,
      reason: "1日1回の経験値ボーナスを先に取る。",
      condition: "今日のレベリングルーレットが未消化なら選ぶ",
      steps: [
        `${job.name_ja}（Lv${job.level}）へジョブチェンジ`,
        "コンテンツファインダー → コンテンツルーレット → レベリング",
        "1回だけ申請してクリア"
      ]
    }
  ];

  if (duty) {
    methods.push({
      rank: 2,
      badge: "周回効率",
      title: `${job.name_ja}で「${duty.name}」を1周`,
      minutes: 25,
      reason: "タンク・ヒーラーはマッチングが比較的短く、現在レベルに近いIDをそのまま周回しやすい。",
      condition: `「${duty.name}」解放済みなら選ぶ`,
      steps: [
        `${job.name_ja}へジョブチェンジ`,
        `コンテンツファインダーで「${duty.name}」を選択`,
        "1回申請してクリア"
      ]
    });
    methods.push({
      rank: 3,
      badge: "待ち時間ゼロ",
      title: `${job.name_ja}で「${duty.name}」をコンテンツサポーター1周`,
      minutes: 35,
      reason: "マッチング状況に左右されたくない時の確実な方法。",
      condition: `「${duty.name}」解放済みなら選ぶ`,
      steps: [
        "メニュー → コンテンツ情報 → コンテンツサポーター",
        `「${duty.name}」を選択`,
        "サポートNPCで1周だけクリア"
      ]
    });
  }

  return methods;
}

function concreteCombatPlan(character, availableMinutes, energy) {
  const primary = pickPrimaryCombatJob(character);
  if (!primary) return null;

  const duty = dungeonForLevel(primary.level);
  const methods = DPS_ROLES.has(primary.role)
    ? makeDpsMethods(primary, duty)
    : makeTankHealerMethods(primary, duty);

  if (!methods.length) return null;

  const recommended = methods[0];
  return {
    planner_kind: "concrete-3ways-v0.7",
    notice: `Lv${primary.level} ${primary.name_ja}向けに、効率と始めやすさで3つまで具体化。#1を基本に、条件に合わなければ#2→#3。`,
    focus_job: { code: primary.code, name: primary.name_ja, level: primary.level, role: primary.role },
    methods,
    now: asNow(recommended),
    next: availableMinutes >= 60 && methods[1] ? {
      title: methods[1].title,
      minutes: methods[1].minutes,
      reason: `#1が終わってまだ遊べるなら#2。${methods[1].condition}`
    } : null,
    fallback: {
      title: methods[2]?.title || `${primary.name_ja}に着替えるだけ`,
      minutes: 2,
      reason: "気力が落ちたら、候補を探し直さず#3の入口まで進めばOK。"
    },
    skip_today: [
      "攻略サイトを何個も開いて効率比較する",
      "別ジョブの育成先をその場で考え直す",
      "候補を増やして迷う"
    ]
  };
}

export function makeConcretePlan(character, availableMinutes, energy, basePlan = null) {
  const combat = concreteCombatPlan(character, availableMinutes, energy);
  if (combat) return combat;
  return basePlan;
}

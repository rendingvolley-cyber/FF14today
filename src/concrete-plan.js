const LEVELING_DUNGEONS_90_100 = [
  { min: 91, max: 92, name: "濁流遡上 イフイカ・トゥム", level: 91 },
  { min: 93, max: 94, name: "山嶺登頂 ウォーコー・ゾーモー", level: 93 },
  { min: 95, max: 96, name: "遺産踏査 天深きセノーテ", level: 95 },
  { min: 97, max: 98, name: "外征前哨 ヴァンガード", level: 97 },
  { min: 99, max: 99, name: "魂魄工廠 オリジェニクス", level: 99 }
];

function pickPrimaryCombatJob(character) {
  return (character?.jobs || [])
    .filter(job => job.level !== null && job.level < 100 && !["crafter", "gatherer", "limited"].includes(job.role))
    .sort((a, b) => (b.level - a.level) || a.code.localeCompare(b.code))[0] || null;
}

function dungeonForLevel(level) {
  return LEVELING_DUNGEONS_90_100.find(duty => level >= duty.min && level <= duty.max) || null;
}

function concreteCombatPlan(character, availableMinutes, energy) {
  const primary = pickPrimaryCombatJob(character);
  if (!primary) return null;

  const duty = dungeonForLevel(primary.level);
  const job = primary.name_ja;
  const level = primary.level;

  if (duty && availableMinutes >= 25) {
    const mainMinutes = Math.min(35, availableMinutes);
    return {
      planner_kind: "concrete-v0.7",
      notice: "やることをコンテンツ名・回数・入口まで固定しています。迷ったら上からそのまま実行。",
      now: {
        title: `${job}で「${duty.name}」を1周`,
        minutes: mainMinutes,
        reason: `現在Lv${level}。Lv${duty.level}のレベリングダンジョンを1回だけ。DPSの待ち時間を避けるためコンテンツサポーター使用を優先。`,
        steps: [
          `${job}（Lv${level}）へジョブチェンジ`,
          `メニュー → コンテンツ情報 → コンテンツサポーターを開く`,
          `「黄金のレガシー」→「${duty.name}」を選ぶ`,
          `NPC編成で1回だけクリアする`,
          `クリアしたらそこで終了。続きはNEXTへ`
        ]
      },
      next: availableMinutes >= 60 ? {
        title: `${job}で「コンテンツルーレット：レベリング」を1回`,
        minutes: 30,
        reason: "NOWを終えたあとだけ。コンテンツファインダーから1回申請してクリア。今日のボーナス消化済みでも、次の候補を自分で探さずこれを実行。"
      } : null,
      fallback: {
        title: `${job}に着替えて「コンテンツルーレット：レベリング」を申請するだけ`,
        minutes: 2,
        reason: "気力が落ちたら、申請までをゴールにする。シャキったらそのまま1回だけ遊ぶ。"
      },
      skip_today: [
        "別ジョブの育成先を自分で比較する",
        "効率サイトを見て最適解を探す",
        "複数のルーレットを全部消化しようとする"
      ]
    };
  }

  if (availableMinutes >= 25) {
    return {
      planner_kind: "concrete-v0.7",
      notice: "短い判断で開始できるよう、最初の1コンテンツだけ固定しています。",
      now: {
        title: `${job}で「コンテンツルーレット：レベリング」を1回`,
        minutes: Math.min(35, availableMinutes),
        reason: `現在Lv${level}。まず1回だけレベリングルーレットを消化。`,
        steps: [
          `${job}（Lv${level}）へジョブチェンジ`,
          "メニュー → コンテンツファインダー → コンテンツルーレット",
          "「レベリング」を選んで1回申請",
          "1回クリアしたら終了"
        ]
      },
      next: null,
      fallback: { title: "コンテンツファインダーを開くところまで", minutes: 2, reason: "開始だけでOK。" },
      skip_today: ["他ジョブとの効率比較", "複数ルーレットの全消化"]
    };
  }

  return {
    planner_kind: "concrete-v0.7",
    notice: "15分枠では長いIDを無理に始めません。",
    now: {
      title: `${job}の装備更新とホットバー確認だけして終了`,
      minutes: Math.min(15, availableMinutes),
      reason: `Lv${level}。次回すぐIDへ入れる状態を作る短時間タスク。`,
      steps: [
        `${job}へジョブチェンジ`,
        "さいきょう装備を実行",
        "壊れかけ装備があれば修理",
        "次回はレベリングダンジョン1周から開始"
      ]
    },
    next: null,
    fallback: { title: "Lodestone同期だけ", minutes: 1, reason: "今日は情報更新だけで終了。" },
    skip_today: ["15分を超えるダンジョン"]
  };
}

export function makeConcretePlan(character, availableMinutes, energy, basePlan = null) {
  const combat = concreteCombatPlan(character, availableMinutes, energy);
  if (combat) return combat;
  return basePlan;
}

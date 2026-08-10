const LEVELING_DUNGEONS_80_100 = [
  { min: 80, max: 80, name: "偽造天界 グルグ火山", level: 79 },
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
const COMBAT_ROLES = new Set(["tank", "healer", "melee", "ranged", "caster"]);

export function isLevelingCombatJob(job) {
  return Boolean(job)
    && COMBAT_ROLES.has(job.role)
    && Number.isInteger(Number(job.level))
    && Number(job.level) >= 16
    && Number(job.level) < 100;
}

export function levelingCombatJobs(character) {
  return (character?.jobs || [])
    .filter(isLevelingCombatJob)
    .sort((a, b) => (b.level - a.level) || String(a.code).localeCompare(String(b.code)));
}

function findFocusedJob(character, code) {
  const wanted = String(code || "").trim().toUpperCase();
  if (!wanted) return null;
  return levelingCombatJobs(character).find(job => String(job.code).toUpperCase() === wanted) || null;
}

function dungeonForLevel(level) {
  return LEVELING_DUNGEONS_80_100.find(duty => level >= duty.min && level <= duty.max) || null;
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

function rouletteMethod(job, dailyKey, kind, minutes, reason) {
  return withJob({
    task_key: `roulette:${dailyKey}`,
    daily_key: dailyKey,
    badge: "日次ボーナス",
    title: `${job.name_ja}で「コンテンツルーレット：${kind}」を1回`,
    minutes,
    reason,
    condition: `目的：${job.name_ja} Lv${job.level}の経験値を、1日1回のボーナスで進める。`,
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
    badge: "日課後の高効率基準",
    title: `${job.name_ja}で「${duty.name}」を1周`,
    minutes: dps ? 35 : 25,
    reason: `選択中の${job.name_ja}はLv${job.level}。日次ボーナス消化後は、現在Lvで入れる最も高いレベル帯のレベリングID「${duty.name}」（Lv${duty.level}）を基準候補にします。`,
    condition: dps
      ? "目的：待ち時間のブレを避け、コンテンツサポーターで安定して経験値を積む。"
      : "目的：現在Lvで入れる最高帯のレベリングIDを1周し、経験値を積む。",
    steps: dps
      ? [`${job.name_ja}（Lv${job.level}）へジョブチェンジ`, `コンテンツサポーターで「${duty.name}」を選択`, "1周する", "終わったら「✓ 完了！」"]
      : [`${job.name_ja}（Lv${job.level}）へジョブチェンジ`, `コンテンツファインダーで「${duty.name}」を選択`, "1周する", "終わったら「✓ 完了！」"]
  }, job);
}

function fitToTime(methods, availableMinutes) {
  const minutes = Math.max(0, Number(availableMinutes) || 0);
  return methods.filter(method => Number(method.minutes || 0) <= minutes + 5);
}

function applyRepeats(methods, completionCounts) {
  const counts = completionCounts && typeof completionCounts === "object" ? completionCounts : {};
  return methods
    .map((method, baseIndex) => ({
      ...method,
      repeat_count: Math.max(0, Number(counts[method.task_key]) || 0),
      _base_index: baseIndex
    }))
    .sort((a, b) => (Number(a.repeat_count > 0) - Number(b.repeat_count > 0)) || (a.repeat_count - b.repeat_count) || (a._base_index - b._base_index))
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
    repeat_count: method.repeat_count || 0
  };
}

export function applyCombatJobFocus(plan, character, options = {}) {
  if (!plan || plan.selected_mode !== "efficient") return plan;
  const job = findFocusedJob(character, options.focusJobCode);
  if (!job) return plan;

  const completed = {
    leveling: Boolean(options.completedDaily?.leveling),
    alliance: Boolean(options.completedDaily?.alliance)
  };
  const methods = [];
  if (!completed.leveling) {
    methods.push(rouletteMethod(job, "leveling", "レベリング", 30, "選択中ジョブの育成で、まず1日1回のレベリングルーレット経験値ボーナスを回収します。"));
  }
  if (job.level >= 50 && !completed.alliance) {
    methods.push(rouletteMethod(job, "alliance", "アライアンスレイド", 35, "選択中ジョブがLv50以上なので、未消化なら1日1回のアライアンスルーレット経験値ボーナスを回収します。"));
  }
  const dungeon = repeatDungeonMethod(job, dungeonForLevel(job.level));
  if (dungeon) methods.push(dungeon);

  const journalMethods = (plan.methods || []).filter(method => method?.source_kind === "journal_screenshot");
  const fitted = applyRepeats(fitToTime(methods, options.availableMinutes), options.completionCounts);
  const combined = [...fitted, ...journalMethods]
    .filter((method, index, rows) => rows.findIndex(row => row.task_key === method.task_key) === index)
    .slice(0, 3)
    .map((method, index) => ({ ...method, rank: index + 1 }));

  if (!combined.length) {
    return {
      ...plan,
      planner_kind: "combat-job-focus-v1.7.1",
      session_complete: true,
      focus_job: focusFromJob(job),
      methods: [],
      now: null,
      next: null,
      notice: `${job.name_ja} Lv${job.level}を選択中。このレベル帯の日課後育成候補は、まだ報酬・場所まで確定できるデータが不足しています。別ジョブへ勝手に切り替えず、候補不足として扱います。`,
      fallback: { title: "別ジョブへ勝手に切り替えない", minutes: 0, reason: "選択したジョブを維持します。" },
      combat_job_focus: true
    };
  }

  const recommended = combined[0];
  return {
    ...plan,
    planner_kind: "combat-job-focus-v1.7.1",
    session_complete: false,
    focus_job: focusFromJob(job),
    methods: combined,
    now: asNow(recommended),
    next: combined[1] ? { title: combined[1].title, minutes: combined[1].minutes, reason: combined[1].reason } : null,
    fallback: combined[2] ? { title: combined[2].title, minutes: combined[2].minutes, reason: combined[2].reason } : plan.fallback,
    notice: `戦闘ジョブは「${job.name_ja} Lv${job.level}」を選択中。このジョブのレベル帯だけで#1〜#3を組み直しています。`,
    combat_job_focus: true
  };
}

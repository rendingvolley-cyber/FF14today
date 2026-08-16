function normalizeCode(value) {
  return String(value || "").trim().toUpperCase();
}

function findJob(character, code, role) {
  const wanted = normalizeCode(code);
  if (!wanted) return null;
  return (character?.jobs || []).find(job => normalizeCode(job?.code) === wanted && job?.role === role && job?.level !== null) || null;
}

function focusFromJob(job) {
  return job ? { code: job.code, name: job.name_ja, level: Number(job.level), role: job.role } : null;
}

function emptyFocusedPlan(plan, job, kind) {
  return {
    ...plan,
    planner_kind: `category-job-focus-${kind}-v1`,
    session_complete: true,
    focus_job: focusFromJob(job),
    methods: [],
    now: null,
    next: null,
    notice: `${job.name_ja} Lv${job.level}を選択中。このジョブ向けに対象・場所・報酬まで確認できる候補はまだ未整備です。別ジョブへ勝手に切り替えません。`,
    fallback: { title: "選択ジョブを維持", minutes: 0, reason: "根拠の薄い候補を水増ししません。" },
    category_job_focus: true
  };
}

function fit(methods, minutes) {
  const available = Math.max(0, Number(minutes) || 0);
  return methods.filter(method => Number(method.minutes || 0) <= available + 5).slice(0, 3).map((method, index) => ({ ...method, rank: index + 1 }));
}

function focusedPlan(plan, job, methods, kind, minutes) {
  const rows = fit(methods, minutes);
  if (!rows.length) return emptyFocusedPlan(plan, job, kind);
  return {
    ...plan,
    planner_kind: `category-job-focus-${kind}-v1`,
    session_complete: false,
    focus_job: focusFromJob(job),
    methods: rows,
    now: { ...rows[0] },
    next: rows[1] ? { title: rows[1].title, minutes: rows[1].minutes, reason: rows[1].reason } : null,
    fallback: rows[2] ? { title: rows[2].title, minutes: rows[2].minutes, reason: rows[2].reason } : plan?.fallback,
    notice: `${job.name_ja} Lv${job.level}を選択中。このジョブに紐づく根拠付き候補だけを表示しています。`,
    category_job_focus: true
  };
}

const CRAFT_SOCIETY_BANDS = [
  { id: "moogle", name: "モーグリ族", min: 50, max: 59, area: "ドラヴァニア雲海" },
  { id: "namazu", name: "ナマズオ族", min: 60, max: 69, area: "アジムステップ" },
  { id: "dwarf", name: "ドワーフ族", min: 70, max: 79, area: "レイクランド" },
  { id: "loporrit", name: "レポリット族", min: 80, max: 89, area: "嘆きの海" },
  { id: "yok_huy", name: "ヨカフイ族", min: 90, max: 99, area: "オルコ・パチャ" }
];

function craftSocietyMethods(job) {
  const level = Number(job.level);
  const society = CRAFT_SOCIETY_BANDS.find(row => level >= row.min && level <= row.max);
  if (!society) return [];
  const common = {
    daily_key: null,
    job_code: job.code,
    job_name: job.name_ja,
    job_level: level,
    job_role: job.role,
    repeat_count: 0
  };
  return [{
    ...common,
    task_key: `craft:${normalizeCode(job.code).toLowerCase()}:society:${society.id}`,
    badge: "友好部族・3件",
    title: `${society.name}のデイリーを${job.name_ja}で3件やる`,
    minutes: 20,
    reason: `${job.name_ja} Lv${level}は${society.name}の製作適正帯（Lv${society.min}〜${society.max}）。高Lv職を先に100へ押し切らず、低Lv側を追いつかせて装備帯を揃えるための経験値先として使います。`,
    condition: `解放済みなら実行。${society.area}の${society.name}デイリーを3件受注し、${job.name_ja}で報告する。未解放・友好度目的で使わない日はスキップ可。`,
    steps: [
      `${job.name_ja}（Lv${level}）へジョブチェンジ`,
      `${society.area}の${society.name}デイリー受注拠点へ移動`,
      "デイリーを3件受注して進める",
      `${job.name_ja}のまま3件報告する`,
      "終わったら「✓ 完了！」"
    ]
  }];
}

function alcMethods(job) {
  if (Number(job.level) < 90 || Number(job.level) > 91) return [];
  const common = { daily_key: null, job_code: job.code, job_name: job.name_ja, job_level: Number(job.level), job_role: job.role, repeat_count: 0 };
  const rows = [
    {
      ...common,
      task_key: "craft:alc90:leve:ginseng-angle-brush",
      badge: "ギルドリーヴ納品",
      title: "ギルドリーヴ用「ウコギ・アングルブラシ」をHQで1個作る",
      minutes: 20,
      reason: "Lv90錬金術師ギルドリーヴの納品候補。リーヴ権1枚で経験値を大きく進める目的で比較します。",
      condition: "目的：錬金術師の経験値をリーヴ1枚で進める。発行はトライヨラのギルドリーヴ窓口。",
      steps: [`${job.name_ja}（Lv${job.level}）へジョブチェンジ`, "製作手帳で「ウコギ・アングルブラシ」を開く", "HQを1個だけ製作する", "トライヨラのギルドリーヴ窓口で対象リーヴを受注して納品", "終わったら「✓ 完了！」"]
    },
    {
      ...common,
      task_key: "craft:alc90:leve:growth-formula-lambda",
      badge: "材料軽めのリーヴ",
      title: "ギルドリーヴ用「グロースフォーミュラ・ラムダ」をHQで3個作る",
      minutes: 18,
      reason: "Lv90錬金術師ギルドリーヴの別候補。材料と所要時間を比較する代替案です。",
      condition: "目的：錬金術師経験値をリーヴ納品で進める。",
      steps: [`${job.name_ja}（Lv${job.level}）へジョブチェンジ`, "製作手帳で「グロースフォーミュラ・ラムダ」を開く", "HQを3個だけ製作する", "トライヨラのギルドリーヴ窓口で対象リーヴを受注して納品", "終わったら「✓ 完了！」"]
    }
  ];
  if (Number(job.level) >= 91) rows.push({
    ...common,
    task_key: "craft:alc91:collectable:loboskin-grimoire",
    badge: "紫貨＋経験値",
    title: "収集品「収集用のシルバリオ・グリモア」を1個作って納品する",
    minutes: 20,
    reason: "Lv91錬金術師の収集品「収集用のシルバリオ・グリモア」。リーヴ権を使わず、経験値とクラフタースクリップ紫貨を同時に進める候補です。",
    condition: "目的：リーヴ権を温存しながら錬金術師を育成する。",
    steps: [`${job.name_ja}（Lv${job.level}）へジョブチェンジ`, "製作手帳 → スペシャルレシピ → 収集品で「収集用のシルバリオ・グリモア」を開く", "「収集用のシルバリオ・グリモア」を収集品として1個製作する", "収集品取引窓口へ1個納品する", "終わったら「✓ 完了！」"]
  });
  return rows;
}

function minerMethods(job) {
  if (Number(job.level) < 81) return [];
  const common = { daily_key: null, job_code: job.code, job_name: job.name_ja, job_level: Number(job.level), job_role: job.role, repeat_count: 0 };
  return [
    {
      ...common,
      task_key: "gather:min81:collectable:rarefied-raw-ametrine",
      badge: "時間限定・次窓あり",
      title: "ラヴィリンソスで「収集用のアメトリン原石」を1回採って納品する",
      minutes: 20,
      reason: "Lv81から扱える時間限定の採掘収集品。経験値とギャザラースクリップ紫貨を同時に進めます。",
      condition: "目的：時間限定ノードを逃さず、採掘師の経験値と紫貨を同時に得る。ET 00:00-02:00 / 12:00-14:00。",
      steps: [`${job.name_ja}（Lv${job.level}）へジョブチェンジ`, "ラヴィリンソス・プシケ送風塔付近へ移動", "ET 00:00-02:00 または 12:00-14:00 に採集", "収集品取引窓口へ納品", "終わったら「✓ 完了！」"]
    },
    {
      ...common,
      task_key: "gather:min81:collectable:rarefied-high-durium-ore",
      badge: "いつでも採れる収集品",
      title: "サベネア島で「収集用の輝翠銀鉱」を1回採って納品する",
      minutes: 15,
      reason: "時間窓待ちが不要で、採掘師の経験値とギャザラースクリップ紫貨を進められます。",
      condition: "目的：待ち時間なしで採掘師の経験値と紫貨を確実に積む。",
      steps: [`${job.name_ja}（Lv${job.level}）へジョブチェンジ`, "サベネア島「グレートワーク」へテレポ", "Lv85採掘ポイントへ移動", "「収集用の輝翠銀鉱」を収集品として採集", "収集品取引窓口へ納品して「✓ 完了！」"]
    }
  ];
}

function botanistMethods(job) {
  const level = Number(job.level);
  if (level < 81) return [];
  const common = { daily_key: null, job_code: job.code, job_name: job.name_ja, job_level: level, job_role: job.role, repeat_count: 0 };
  const rows = [
    {
      ...common,
      task_key: "gather:btn81:collectable:rarefied-thavnairian-perilla",
      badge: "いつでも採れる収集品",
      title: "サベネア島で「収集用のサベネアンペリラ」を1回採って納品する",
      minutes: 15,
      reason: "時間窓待ちがない園芸収集品。園芸師の経験値とギャザラースクリップを安定して進める常設候補です。",
      condition: "目的：待ち時間なしで園芸師の経験値とスクリップを進める。サベネア島イェドリマン周辺のLv85草刈場。",
      steps: [`${job.name_ja}（Lv${level}）へジョブチェンジ`, "サベネア島「イェドリマン」へテレポ", "X:24 Y:30付近のLv85草刈場へ移動", "「収集用のサベネアンペリラ」を収集品として採集", "収集品取引窓口へ納品して「✓ 完了！」"]
    }
  ];

  if (level >= 87) rows.push({
    ...common,
    task_key: "gather:btn87:collectable:rarefied-sykon",
    badge: "時間限定・Lv87",
    title: "エルピスで「収集用のシューコン」を1回採って納品する",
    minutes: 20,
    reason: "Lv87の園芸師に合う未知の収集品。経験値とギャザラースクリップを同時に進めます。",
    condition: "目的：Lv87帯の収集品で効率よく経験値を得る。ET 00:00-02:00 / 12:00-14:00、エルピス X:25 Y:5付近。",
    steps: [`${job.name_ja}（Lv${level}）へジョブチェンジ`, "エルピス「ポイエテーン・オイコス」方面へ移動", "ET 00:00-02:00 または 12:00-14:00 にX:25 Y:5付近で採集", "「収集用のシューコン」を収集品として確保", "収集品取引窓口へ納品して「✓ 完了！」"]
  });

  if (level >= 85) rows.push({
    ...common,
    task_key: "gather:btn85:collectable:rarefied-coconut",
    badge: "時間限定・Lv85",
    title: "サベネア島で「収集用のココナッツ」を1回採って納品する",
    minutes: 20,
    reason: "Lv85から採れる未知の園芸収集品。Lv87でも有効な経験値・スクリップ候補です。",
    condition: "目的：園芸師の経験値とスクリップを進める。ET 02:00-04:00 / 14:00-16:00、サベネア島 X:14 Y:14付近。",
    steps: [`${job.name_ja}（Lv${level}）へジョブチェンジ`, "サベネア島「デミールの遺烈郷」へテレポ", "ET 02:00-04:00 または 14:00-16:00 にX:14 Y:14付近で採集", "「収集用のココナッツ」を収集品として確保", "収集品取引窓口へ納品して「✓ 完了！」"]
  });

  if (level >= 81 && level < 85) rows.push({
    ...common,
    task_key: "gather:btn81:collectable:rarefied-palm-log",
    badge: "時間限定・Lv81",
    title: "サベネア島で「収集用のパーム原木」を1回採って納品する",
    minutes: 20,
    reason: "Lv81から採れる未知の園芸収集品。序盤の園芸レベリングとスクリップ獲得を兼ねます。",
    condition: "目的：園芸師の経験値とスクリップを進める。ET 02:00-04:00 / 14:00-16:00、サベネア島 X:14 Y:14付近。",
    steps: [`${job.name_ja}（Lv${level}）へジョブチェンジ`, "サベネア島「デミールの遺烈郷」へテレポ", "ET 02:00-04:00 または 14:00-16:00 にX:14 Y:14付近で採集", "「収集用のパーム原木」を収集品として確保", "収集品取引窓口へ納品して「✓ 完了！」"]
  });

  if (level >= 83 && rows.length < 3) rows.push({
    ...common,
    task_key: "gather:btn83:collectable:rarefied-red-pine-log",
    badge: "時間限定・Lv83",
    title: "ガレマルドで「収集用のレッドパイン原木」を1回採って納品する",
    minutes: 20,
    reason: "Lv83から採れる未知の園芸収集品。次の時限候補として経験値とスクリップを補います。",
    condition: "目的：園芸師の経験値とスクリップを進める。ET 04:00-06:00 / 16:00-18:00、ガレマルド X:35 Y:5付近。",
    steps: [`${job.name_ja}（Lv${level}）へジョブチェンジ`, "ガレマルド「テルティウム駅」方面へ移動", "ET 04:00-06:00 または 16:00-18:00 にX:35 Y:5付近で採集", "「収集用のレッドパイン原木」を収集品として確保", "収集品取引窓口へ納品して「✓ 完了！」"]
  });

  return rows;
}

export function applyCategoryJobFocus(plan, character, options = {}) {
  if (!plan) return plan;
  const mode = String(plan.selected_mode || options.mode || "");
  if (mode === "craft" && options.focusCraftJobCode) {
    const job = findJob(character, options.focusCraftJobCode, "crafter");
    if (!job) return plan;
    const concrete = normalizeCode(job.code) === "ALC" ? alcMethods(job) : [];
    const methods = concrete.length ? concrete : craftSocietyMethods(job);
    return focusedPlan(plan, job, methods, "craft", options.availableMinutes ?? plan.remaining_minutes ?? 60);
  }
  if (mode === "gather" && options.focusGatherJobCode) {
    const job = findJob(character, options.focusGatherJobCode, "gatherer");
    if (!job || normalizeCode(job.code) === "FSH") return plan;
    const code = normalizeCode(job.code);
    if (code === "MIN") return focusedPlan(plan, job, minerMethods(job), "gather", options.availableMinutes ?? plan.remaining_minutes ?? 60);
    if (code === "BTN") return focusedPlan(plan, job, botanistMethods(job), "gather", options.availableMinutes ?? plan.remaining_minutes ?? 60);
    return emptyFocusedPlan(plan, job, "gather");
  }
  return plan;
}

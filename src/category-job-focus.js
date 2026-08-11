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
    title: "Lv91錬金術師の収集品を1個作って納品する",
    minutes: 20,
    reason: "リーヴ権を使わず、経験値とクラフタースクリップ紫貨を同時に進める候補です。",
    condition: "目的：リーヴ権を温存しながら錬金術師を育成する。",
    steps: [`${job.name_ja}（Lv${job.level}）へジョブチェンジ`, "製作手帳 → スペシャルレシピ → 収集品を開く", "Lv91帯の錬金術師収集品を1個製作", "収集品取引窓口へ納品", "終わったら「✓ 完了！」"]
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

export function applyCategoryJobFocus(plan, character, options = {}) {
  if (!plan) return plan;
  const mode = String(plan.selected_mode || options.mode || "");
  if (mode === "craft" && options.focusCraftJobCode) {
    const job = findJob(character, options.focusCraftJobCode, "crafter");
    if (!job) return plan;
    if (normalizeCode(job.code) !== "ALC") return emptyFocusedPlan(plan, job, "craft");
    return focusedPlan(plan, job, alcMethods(job), "craft", options.availableMinutes ?? plan.remaining_minutes ?? 60);
  }
  if (mode === "gather" && options.focusGatherJobCode) {
    const job = findJob(character, options.focusGatherJobCode, "gatherer");
    if (!job || normalizeCode(job.code) === "FSH") return plan;
    if (normalizeCode(job.code) !== "MIN") return emptyFocusedPlan(plan, job, "gather");
    return focusedPlan(plan, job, minerMethods(job), "gather", options.availableMinutes ?? plan.remaining_minutes ?? 60);
  }
  return plan;
}

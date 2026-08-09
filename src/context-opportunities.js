const KNOWN_REQUIREMENTS = {
  "craft:alc90:leve:ginseng-angle-brush": {
    recommended_craftsmanship: 3366,
    source_label: "公式エオルゼアDBの製作成功目安"
  },
  "craft:alc90:leve:growth-formula-lambda": {
    recommended_craftsmanship: 3366,
    source_label: "公式エオルゼアDBの製作成功目安"
  },
  "craft:alc91:collectable:loboskin-grimoire": {
    recommended_craftsmanship: 3366,
    source_label: "公式エオルゼアDBの製作成功目安"
  }
};

const REPLACEMENTS = new Map([
  ["Ginseng Angle Brush", "ウコギ・アングルブラシ"],
  ["Big Brush, Big Dreams", "製作依頼：巨大な絵筆を試したい"],
  ["Growth Formula Lambda", "グロースフォーミュラ・ラムダ"],
  ["Fast-forwarding Flora", "製作依頼：新薬研究のための成長促進剤"],
  ["Rarefied Loboskin Grimoire", "収集用のシルバリオ・グリモア"],
  ["Rarefied Raw Ametrine", "収集用のアメトリン原石"],
  ["Rarefied High Durium Ore", "収集用の輝翠銀鉱"],
  ["Tuliyollal", "トライヨラ"],
  ["Labyrinthos", "ラヴィリンソス"],
  ["Thavnair", "サベネア島"],
  ["The Great Work", "デミールの遺烈郷"]
]);

function text(value, max = 240) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

function localizeText(value) {
  let output = String(value ?? "");
  for (const [from, to] of REPLACEMENTS) output = output.split(from).join(to);
  return output;
}

function localizeKnownMethod(method) {
  return {
    ...method,
    title: localizeText(method.title),
    reason: localizeText(method.reason),
    condition: localizeText(method.condition),
    steps: Array.isArray(method.steps) ? method.steps.map(localizeText) : method.steps
  };
}

function joinCondition(original, gearCheck) {
  const parts = [];
  const base = text(original, 500);
  if (base) parts.push(base);
  if (gearCheck) parts.push(`装備判定：${gearCheck}`);
  return parts.join("｜");
}

function craftingGearCheck(method, context) {
  const stats = context?.crafter_stats?.crafter_stats;
  if (!stats || typeof stats !== "object") return null;
  const craftsmanship = Number(stats.craftsmanship);
  const control = Number(stats.control);
  const cp = Number(stats.cp);
  const statText = [
    Number.isFinite(craftsmanship) ? `作業精度${craftsmanship}` : null,
    Number.isFinite(control) ? `加工精度${control}` : null,
    Number.isFinite(cp) ? `CP${cp}` : null
  ].filter(Boolean).join(" / ");
  const requirement = KNOWN_REQUIREMENTS[method.task_key];

  if (!requirement) {
    return statText
      ? `${statText}を画像から取得済み。候補側の必要値データが未登録なので合否は断定しません。`
      : "画像は読み取りましたが、主要能力値を確定できませんでした。";
  }

  if (!Number.isFinite(craftsmanship)) {
    return `${requirement.source_label}は作業精度${requirement.recommended_craftsmanship}。画像から作業精度を確定できませんでした。`;
  }
  const delta = craftsmanship - requirement.recommended_craftsmanship;
  if (delta >= 0) {
    return `${requirement.source_label}の作業精度${requirement.recommended_craftsmanship}をクリア（現在${craftsmanship}、+${delta}）。加工精度/CPは読み取れていても、候補別の安定HQ/収集価値ラインは未登録なので過剰判定しません。`;
  }
  return `${requirement.source_label}の作業精度${requirement.recommended_craftsmanship}を${Math.abs(delta)}下回っています（現在${craftsmanship}）。製作不能とは断定しませんが、安定性に不安があるため優先度を下げます。`;
}

function gatheringGearCheck(context) {
  const stats = context?.gatherer_stats?.gatherer_stats;
  if (!stats || typeof stats !== "object") return null;
  const gathering = Number(stats.gathering);
  const perception = Number(stats.perception);
  const gp = Number(stats.gp);
  const statText = [
    Number.isFinite(gathering) ? `獲得力${gathering}` : null,
    Number.isFinite(perception) ? `技術力${perception}` : null,
    Number.isFinite(gp) ? `GP${gp}` : null
  ].filter(Boolean).join(" / ");
  return statText
    ? `${statText}を画像から取得済み。現在の採集候補は必要獲得力/技術力の確定データをまだ持っていないため、「足りる」とは推測せず判定保留にします。`
    : "画像は読み取りましたが、主要能力値を確定できませんでした。";
}

function annotateGear(method, context) {
  const next = localizeKnownMethod(method);
  let check = null;
  if (next.job_role === "crafter") check = craftingGearCheck(next, context);
  if (next.job_role === "gatherer") check = gatheringGearCheck(context);
  if (check) next.condition = joinCondition(next.condition, check);
  return next;
}

function requirementPenalty(method, context) {
  const requirement = KNOWN_REQUIREMENTS[method.task_key];
  if (!requirement) return 0;
  const stats = context?.crafter_stats?.crafter_stats;
  const craftsmanship = Number(stats?.craftsmanship);
  if (Number.isFinite(craftsmanship) && craftsmanship < requirement.recommended_craftsmanship) return 20;
  return 0;
}

function bestJournalEntry(context) {
  const entries = context?.journal?.journal_entries;
  if (!Array.isArray(entries) || !entries.length) return null;
  return entries
    .filter(entry => entry?.title && Number(entry?.confidence || 0) >= 0.55)
    .map((entry, index) => ({
      ...entry,
      _score: (entry.deadline_text ? 4 : 0) + (entry.progress ? 2 : 0) + (entry.objective ? 1 : 0) - index * 0.01
    }))
    .sort((a, b) => b._score - a._score)[0] || null;
}

function journalMethod(context, availableMinutes) {
  const entry = bestJournalEntry(context);
  if (!entry) return null;
  const title = text(entry.title, 160);
  const objective = entry.objective ? text(entry.objective, 260) : null;
  const progress = entry.progress ? text(entry.progress, 100) : null;
  const location = entry.location ? text(entry.location, 140) : null;
  const deadline = entry.deadline_text ? text(entry.deadline_text, 100) : null;
  const minutes = Math.max(15, Math.min(30, Number(availableMinutes) || 20));
  const reasonBits = [
    `貼り付けたジャーナルに「${title}」が進行中として表示されています。`,
    deadline ? `画面上の期限表示は「${deadline}」。` : null,
    progress ? `現在表示は「${progress}」。` : null,
    "攻略サイトを開き直さず、いま抱えている進行中タスクを1段階だけ前へ進める候補です。"
  ].filter(Boolean);
  const steps = [
    location
      ? `ジャーナルで「${title}」を選択し、${location}をマップで確認して移動`
      : `ジャーナルで「${title}」を選択して目的地をマップ表示`,
    objective ? `表示されている目的「${objective}」を1段階進める` : "ジャーナルに表示されている次の目的を1段階だけ進める",
    "1段階進んだら「✓ 完了！」"
  ];
  return {
    task_key: `journal:${title}`.slice(0, 160),
    daily_key: null,
    badge: deadline ? "ジャーナル・期限表示あり" : "ジャーナルから追加",
    title: `「${title}」を1段階進める`,
    minutes,
    reason: reasonBits.join(" "),
    condition: "目的：いま抱えているジャーナル項目を、調べ直さずに具体的な1歩だけ進める。",
    steps,
    repeat_count: 0,
    source_kind: "journal_screenshot"
  };
}

function rerank(methods) {
  return methods.map((method, index) => ({ ...method, rank: index + 1 }));
}

export function applyDecisionContextToPlan(plan, context, mode, availableMinutes) {
  if (!plan || plan.session_complete || !Array.isArray(plan.methods)) return plan;

  let methods = plan.methods
    .map(method => annotateGear(method, context))
    .sort((a, b) => requirementPenalty(a, context) - requirementPenalty(b, context));

  const journal = journalMethod(context, availableMinutes);
  if (journal && Number(journal.minutes || 0) <= Number(availableMinutes || 0) + 5) {
    const withoutOldJournal = methods.filter(method => method.source_kind !== "journal_screenshot");
    if (withoutOldJournal.length >= 2) methods = [withoutOldJournal[0], withoutOldJournal[1], journal, ...withoutOldJournal.slice(2)];
    else methods = [...withoutOldJournal, journal];
  }

  methods = rerank(methods.slice(0, 3));
  const recommended = methods[0] || null;
  return {
    ...plan,
    methods,
    now: recommended ? {
      task_key: recommended.task_key,
      daily_key: recommended.daily_key,
      title: recommended.title,
      minutes: recommended.minutes,
      reason: recommended.reason,
      steps: recommended.steps,
      repeat_count: recommended.repeat_count || 0
    } : null,
    next: methods[1] ? { title: methods[1].title, minutes: methods[1].minutes, reason: "#1以外の有力候補。" } : null,
    fallback: methods[2] ? { title: methods[2].title, minutes: methods[2].minutes, reason: "さらに別方向の候補。" } : plan.fallback,
    context_used: {
      journal: Boolean(journal),
      crafter_stats: Boolean(context?.crafter_stats),
      gatherer_stats: Boolean(context?.gatherer_stats)
    }
  };
}

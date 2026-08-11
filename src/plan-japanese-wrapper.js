const LEVE_LOCALIZATION = Object.freeze({
  "craft:alc90:leve:ginseng-angle-brush": Object.freeze({
    title: "ギルドリーヴ用「ウコギ・アングルブラシ」をHQで1個作る",
    reason: "トライヨラのLv90錬金術師ギルドリーヴの納品物。1個納品で2,695,430 EXP＋約5,060ギル、HQ納品なら報酬が増えるため、目的のない製作より優先します。",
    condition: "目的：錬金術師の経験値をリーヴ1枚で大きく進める。トライヨラのギルドリーヴ発行NPC（X:13.7 Y:12.7）で受注・納品します。",
    steps: Object.freeze([
      "錬金術師へジョブチェンジ",
      "製作手帳で「ウコギ・アングルブラシ」を開く",
      "HQを1個だけ製作する",
      "トライヨラ（X:13.7 Y:12.7）のギルドリーヴ発行NPCでLv90錬金術師リーヴを受注して納品",
      "終わったら「✓ 完了！」"
    ])
  }),
  "craft:alc90:leve:growth-formula-lambda": Object.freeze({
    title: "ギルドリーヴ用「グロースフォーミュラ・ラムダ」をHQで3個作る",
    reason: "トライヨラのLv90錬金術師ギルドリーヴの納品物。3個納品で1,440,660 EXP＋約2,530ギル。ウコギ・アングルブラシよりEXP効率は低いものの、材料構成が単純な代替案です。",
    condition: "目的：リーヴ納品で錬金術師経験値を確実に進める。トライヨラのギルドリーヴ発行NPC（X:13.7 Y:12.7）で受注・納品します。",
    steps: Object.freeze([
      "錬金術師へジョブチェンジ",
      "製作手帳で「グロースフォーミュラ・ラムダ」を開く",
      "HQを3個だけ製作する",
      "トライヨラ（X:13.7 Y:12.7）のギルドリーヴ発行NPCでLv90錬金術師リーヴを受注して納品",
      "終わったら「✓ 完了！」"
    ])
  })
});

function localizeMethod(method) {
  if (!method || typeof method !== "object") return method;
  const localized = LEVE_LOCALIZATION[String(method.task_key || "")];
  if (!localized) return method;
  const jobPrefix = method.job_name && method.job_level != null
    ? `${method.job_name}（Lv${method.job_level}）へジョブチェンジ`
    : localized.steps[0];
  return {
    ...method,
    title: localized.title,
    reason: localized.reason,
    condition: localized.condition,
    steps: [jobPrefix, ...localized.steps.slice(1)]
  };
}

function replaceEnglishLeveText(value) {
  if (typeof value !== "string") return value;
  return value
    .replaceAll("Ginseng Angle Brush", "ウコギ・アングルブラシ")
    .replaceAll("Growth Formula Lambda", "グロースフォーミュラ・ラムダ")
    .replaceAll("Big Brush, Big Dreams", "Lv90錬金術師ギルドリーヴ")
    .replaceAll("Fast-forwarding Flora", "Lv90錬金術師ギルドリーヴ")
    .replaceAll("Tuliyollal", "トライヨラ")
    .replaceAll("Malihali", "ギルドリーヴ発行NPC");
}

export function localizeGuildlevePlan(plan) {
  if (!plan || typeof plan !== "object") return plan;
  const methods = Array.isArray(plan.methods) ? plan.methods.map(localizeMethod) : plan.methods;
  const now = localizeMethod(plan.now);
  const next = plan.next && typeof plan.next === "object"
    ? { ...plan.next, title: replaceEnglishLeveText(plan.next.title), reason: replaceEnglishLeveText(plan.next.reason) }
    : plan.next;
  const fallback = plan.fallback && typeof plan.fallback === "object"
    ? { ...plan.fallback, title: replaceEnglishLeveText(plan.fallback.title), reason: replaceEnglishLeveText(plan.fallback.reason) }
    : plan.fallback;
  return {
    ...plan,
    methods,
    now,
    next,
    fallback,
    notice: replaceEnglishLeveText(plan.notice)
  };
}

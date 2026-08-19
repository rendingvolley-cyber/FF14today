import { applyKnownGrandCompanyItemAlias } from "./gc-item-name-canonicalizer.js";

function normalizeText(value, max = 200) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

function nullableInt(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isInteger(n) && n >= 0 ? n : null;
}

function clampConfidence(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0;
}

export function sanitizeGrandCompanyAnalysis(parsed, model = null) {
  const dictionaryConstrained = parsed?.dictionary_constrained === true;
  const deliveries = (Array.isArray(parsed?.deliveries) ? parsed.deliveries : [])
    .slice(0, 50)
    .map((entry, index) => {
      const itemName = applyKnownGrandCompanyItemAlias(normalizeText(entry?.item_name, 160));
      return {
        row_index: index,
        class_or_job: entry?.class_or_job == null ? null : normalizeText(entry.class_or_job, 80),
        ...itemName,
        requested_quantity: nullableInt(entry?.requested_quantity),
        owned_quantity: nullableInt(entry?.owned_quantity),
        starred: Boolean(entry?.starred),
        bonus_text: entry?.bonus_text == null ? null : normalizeText(entry.bonus_text, 120),
        reward_text: entry?.reward_text == null ? null : normalizeText(entry.reward_text, 160),
        confidence: clampConfidence(entry?.confidence)
      };
    })
    .filter(entry => entry.item_name && (dictionaryConstrained || entry.confidence >= 0.65));

  const recognized = Boolean(parsed?.recognized) && deliveries.length > 0;
  return {
    page_type: recognized ? "grand_company_deliveries" : "unknown",
    confidence: clampConfidence(parsed?.confidence),
    model,
    grand_company_deliveries: recognized ? {
      company_name: parsed?.company_name == null ? null : normalizeText(parsed.company_name, 100),
      deliveries
    } : null,
    journal_entries: [],
    achievement_entries: [],
    crafter_stats: null,
    gatherer_stats: null
  };
}

export function decorateGrandCompanyDelivery(entry) {
  const requested = nullableInt(entry?.requested_quantity);
  const owned = nullableInt(entry?.owned_quantity);
  const readyNow = requested !== null && owned !== null && owned >= requested;
  const missingQuantity = requested !== null && owned !== null ? Math.max(0, requested - owned) : null;
  return {
    ...entry,
    requested_quantity: requested,
    owned_quantity: owned,
    ready_now: readyNow,
    missing_quantity: missingQuantity
  };
}

export function chooseGrandCompanyDelivery(deliveries) {
  const rows = (Array.isArray(deliveries) ? deliveries : [])
    .map((entry, index) => ({ ...decorateGrandCompanyDelivery(entry), _order: index }))
    .filter(entry => String(entry.item_name || "").trim());
  if (!rows.length) return null;

  const score = entry => {
    let value = 0;
    if (entry.ready_now) value += 1000;
    if (entry.starred) value += 200;
    if (entry.bonus_text) value += 40;
    return value;
  };

  rows.sort((a, b) => score(b) - score(a) || a._order - b._order);
  const best = { ...rows[0] };
  delete best._order;

  if (best.ready_now && best.starred) {
    best.recommendation_reason = "必要数をすでに所持していて、画面上にボーナス表示もあります。最初にこれを納品します。";
  } else if (best.ready_now) {
    best.recommendation_reason = "必要数をすでに所持しています。追加調達なしで納品できるので最初にこれを済ませます。";
  } else if (best.starred && best.missing_quantity !== null) {
    best.recommendation_reason = `画面上にボーナス表示があります。必要数まであと${best.missing_quantity}個なので、今日の最初の調達対象にします。`;
  } else if (best.starred) {
    best.recommendation_reason = "画面上にボーナス表示があります。必要数を確認して最初の調達対象にします。";
  } else if (best.missing_quantity !== null) {
    best.recommendation_reason = `今日の一覧から、必要数まであと${best.missing_quantity}個のこの品を先に確認します。`;
  } else {
    best.recommendation_reason = "今日の一覧で確認できた先頭候補です。必要数と所持数を画面で確認してから納品します。";
  }
  return best;
}

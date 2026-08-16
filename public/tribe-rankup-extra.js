export const TRIBE_DAILY_LIMIT = 12;
export const TRIBE_GROUP_SIZE = 3;

export function rankupBatchKey(societyId) {
  return `rankup:${String(societyId || "")}`;
}

function normalizedIds(values) {
  return [...new Set((Array.isArray(values) ? values : []).map(String).filter(Boolean))];
}

function baseBatch(group) {
  return {
    ...group,
    batch_key: String(group?.society_id || ""),
    rankup_extra: false
  };
}

function extraBatch(group) {
  return {
    ...group,
    batch_key: rankupBatchKey(group?.society_id),
    rankup_extra: true,
    conditional: false,
    reason: `${group?.society_name || "この友好部族"}がランクアップしたため、同じ日の残り受注枠から追加3件をこの部族へ振り替えています。`,
    rankup_label: "ランクアップ追加3件"
  };
}

export function buildEffectiveTribeGroups(baseGroups, rankupSocietyIds = [], doneKeys = [], dailyLimit = TRIBE_DAILY_LIMIT) {
  const maxGroups = Math.floor(Number(dailyLimit || TRIBE_DAILY_LIMIT) / TRIBE_GROUP_SIZE);
  const done = new Set(normalizedIds(doneKeys));
  const groups = (Array.isArray(baseGroups) ? baseGroups : []).slice(0, maxGroups).map(baseBatch);
  const extras = normalizedIds(rankupSocietyIds);

  for (const societyId of extras) {
    const source = (Array.isArray(baseGroups) ? baseGroups : []).find(group => String(group?.society_id || "") === societyId);
    if (!source) continue;
    const extra = extraBatch(source);
    if (groups.some(group => group.batch_key === extra.batch_key)) continue;

    if (groups.length < maxGroups) {
      groups.push(extra);
      continue;
    }

    let replacementIndex = -1;
    for (let index = groups.length - 1; index >= 0; index -= 1) {
      const candidate = groups[index];
      if (candidate.rankup_extra) continue;
      if (String(candidate.society_id || "") === societyId) continue;
      if (done.has(String(candidate.batch_key || candidate.society_id || ""))) continue;
      replacementIndex = index;
      break;
    }
    if (replacementIndex >= 0) groups.splice(replacementIndex, 1, extra);
  }

  return groups.slice(0, maxGroups).map((group, index) => ({ ...group, priority_rank: index + 1 }));
}

export function canAllocateRankupExtra({ baseGroups, rankupSocietyIds = [], doneKeys = [], societyId, dailyLimit = TRIBE_DAILY_LIMIT } = {}) {
  const id = String(societyId || "");
  if (!id) return false;
  const done = new Set(normalizedIds(doneKeys));
  if (!done.has(id)) return false;
  if (normalizedIds(rankupSocietyIds).includes(id)) return false;
  const base = Array.isArray(baseGroups) ? baseGroups : [];
  const maxGroups = Math.floor(Number(dailyLimit || TRIBE_DAILY_LIMIT) / TRIBE_GROUP_SIZE);
  if (!base.some(group => String(group?.society_id || "") === id)) return false;

  const current = buildEffectiveTribeGroups(base, rankupSocietyIds, doneKeys, dailyLimit);
  if (current.length < maxGroups) return true;
  return current.some(group => !group.rankup_extra && String(group.society_id || "") !== id && !done.has(String(group.batch_key || group.society_id || "")));
}

export function countCompletedTribeQuests(groups, doneKeys = []) {
  const done = new Set(normalizedIds(doneKeys));
  return (Array.isArray(groups) ? groups : []).reduce((sum, group) => {
    const key = String(group?.batch_key || group?.society_id || "");
    return sum + (done.has(key) ? Number(group?.quests || TRIBE_GROUP_SIZE) : 0);
  }, 0);
}

export function countPlannedTribeQuests(groups, dailyLimit = TRIBE_DAILY_LIMIT) {
  const total = (Array.isArray(groups) ? groups : []).reduce((sum, group) => sum + Number(group?.quests || TRIBE_GROUP_SIZE), 0);
  return Math.min(Number(dailyLimit || TRIBE_DAILY_LIMIT), total);
}

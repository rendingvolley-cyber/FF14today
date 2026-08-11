const XIVAPI_SEARCH = "https://v2.xivapi.com/api/search";

const JOB_NAME_TO_CODE = new Map(Object.entries({
  "剣術士": "GLA", "格闘士": "PGL", "斧術士": "MRD", "槍術士": "LNC", "弓術士": "ARC", "幻術士": "CNJ", "呪術士": "THM", "巴術士": "ACN", "双剣士": "ROG",
  "ナイト": "PLD", "モンク": "MNK", "戦士": "WAR", "竜騎士": "DRG", "吟遊詩人": "BRD", "白魔道士": "WHM", "黒魔道士": "BLM", "召喚士": "SMN", "学者": "SCH", "忍者": "NIN", "機工士": "MCH", "暗黒騎士": "DRK", "占星術師": "AST", "侍": "SAM", "赤魔道士": "RDM", "ガンブレイカー": "GNB", "踊り子": "DNC", "リーパー": "RPR", "賢者": "SGE", "ヴァイパー": "VPR", "ピクトマンサー": "PCT",
  "採掘師": "MIN", "園芸師": "BTN", "漁師": "FSH"
}));

const VALID_CODES = new Set([
  "GLA","PGL","MRD","LNC","ARC","CNJ","THM","ACN","ROG",
  "PLD","MNK","WAR","DRG","BRD","WHM","BLM","SMN","SCH","NIN","MCH","DRK","AST","SAM","RDM","GNB","DNC","RPR","SGE","VPR","PCT",
  "MIN","BTN","FSH"
]);

function normalizeText(value) {
  return String(value ?? "").normalize("NFKC").replace(/\s+/g, " ").trim();
}

export function retainerJobCode(jobName) {
  const normalized = normalizeText(jobName);
  const upper = normalized.toUpperCase();
  if (VALID_CODES.has(upper)) return upper;
  return JOB_NAME_TO_CODE.get(normalized) || null;
}

export function buildRetainerTaskSearchUrl(jobCode, level, cursor = "") {
  const code = String(jobCode || "").trim().toUpperCase();
  const lv = Math.max(1, Math.min(100, Number(level) || 1));
  if (!VALID_CODES.has(code)) return null;
  const url = new URL(XIVAPI_SEARCH);
  url.searchParams.set("language", "ja");
  url.searchParams.set("limit", "500");
  url.searchParams.set("fields", [
    "RetainerLevel",
    "MaxTime{min}",
    "Task.Item@as(raw)",
    "Task.Item.Name",
    "Task.Quantity[]"
  ].join(","));
  if (cursor) {
    url.searchParams.set("cursor", cursor);
  } else {
    url.searchParams.set("sheets", "RetainerTask");
    url.searchParams.set("query", `+IsRandom=false +ClassJobCategory.${code}=true +RetainerLevel<=${lv}`);
  }
  return url.toString();
}

function relationFields(value) {
  if (!value || typeof value !== "object") return {};
  return value.fields && typeof value.fields === "object" ? value.fields : value;
}

function rawItemId(taskFields) {
  const direct = taskFields?.["Item@as(raw)"];
  if (Number.isInteger(Number(direct)) && Number(direct) > 0) return Number(direct);
  const item = taskFields?.Item;
  const candidates = [item?.value, item?.row_id, item?.rowId, item?.id];
  for (const value of candidates) {
    const n = Number(value);
    if (Number.isInteger(n) && n > 0) return n;
  }
  return null;
}

function itemName(taskFields) {
  const item = relationFields(taskFields?.Item);
  return normalizeText(item?.Name || taskFields?.["Item.Name"] || "");
}

function conservativeQuantity(taskFields) {
  const values = Array.isArray(taskFields?.Quantity)
    ? taskFields.Quantity
    : Array.isArray(taskFields?.["Quantity[]"])
      ? taskFields["Quantity[]"]
      : [];
  const positive = values.map(Number).filter(value => Number.isFinite(value) && value > 0);
  return positive.length ? Math.min(...positive) : null;
}

export function parseRetainerTaskResults(data, context = {}) {
  const rows = Array.isArray(data?.results) ? data.results : [];
  const seen = new Set();
  const ventures = [];
  for (const row of rows) {
    const fields = row?.fields || {};
    const task = relationFields(fields.Task);
    const itemId = rawItemId(task);
    const name = itemName(task);
    if (!itemId || !name || seen.has(itemId)) continue;
    seen.add(itemId);
    ventures.push({
      item_id: itemId,
      item_name: name,
      quantity: conservativeQuantity(task),
      venture_level: Number.isFinite(Number(fields.RetainerLevel)) ? Number(fields.RetainerLevel) : null,
      duration_minutes: Number.isFinite(Number(fields["MaxTime{min}"])) ? Number(fields["MaxTime{min}"]) : null,
      retainer_name: context.retainer_name || null,
      retainer_job: context.job_name || null,
      retainer_level: Number.isFinite(Number(context.level)) ? Number(context.level) : null,
      source: "xivapi_retainer_level_band"
    });
  }
  return ventures;
}

export async function fetchRetainerLevelBandCandidates(context, fetchImpl = fetch) {
  const code = retainerJobCode(context?.job_name);
  const level = Number(context?.level);
  if (!code || !Number.isFinite(level) || level <= 0) return [];
  const all = [];
  let cursor = "";
  for (let page = 0; page < 4; page += 1) {
    const url = buildRetainerTaskSearchUrl(code, level, cursor);
    if (!url) break;
    let response;
    try {
      response = await fetchImpl(url, { headers: { "user-agent": "FF14Today/1.10" } });
    } catch {
      break;
    }
    if (!response?.ok) break;
    let data;
    try { data = await response.json(); }
    catch { break; }
    all.push(...parseRetainerTaskResults(data, context));
    cursor = String(data?.next || "");
    if (!cursor) break;
  }
  const deduped = new Map();
  for (const row of all) if (!deduped.has(row.item_id)) deduped.set(row.item_id, row);
  return [...deduped.values()];
}

import {
  extractSupplyDutyItems,
  relevantGrandCompanySupplyLevels
} from "./gc-supply-duty-band-validator.js";

export const GC_SUPPLY_DUTY_OCR_PARSER_VERSION = "supply-duty-v4-item-index-dictionary";

const XIVAPI_BASE = "https://v2.xivapi.com/api";
const VERIFY_TIMEOUT_MS = 4000;
const VERIFIED_CACHE_MS = 6 * 60 * 60 * 1000;
const FAILED_CACHE_MS = 60 * 1000;
const dictionaryCache = new Map();

function cleanName(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function normalizePageKind(value) {
  const kind = String(value || "").trim().toLowerCase();
  return kind === "crafting" || kind === "gathering" ? kind : null;
}

function uniqueSorted(values) {
  return [...new Set(values.map(cleanName).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, "ja"));
}

function cached(key) {
  const row = dictionaryCache.get(key);
  if (!row || row.expires_at <= Date.now()) {
    if (row) dictionaryCache.delete(key);
    return null;
  }
  return row.value;
}

function putCache(key, value, ok) {
  dictionaryCache.set(key, {
    value,
    expires_at: Date.now() + (ok ? VERIFIED_CACHE_MS : FAILED_CACHE_MS)
  });
}

async function fetchWithDeadline(fetchImpl, url, options = {}) {
  const controller = new AbortController();
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      controller.abort("gc_ocr_dictionary_timeout");
      reject(new Error("gc_ocr_dictionary_timeout"));
    }, VERIFY_TIMEOUT_MS);
  });
  try {
    return await Promise.race([
      fetchImpl(url, { ...options, signal: controller.signal }),
      timeout
    ]);
  } finally {
    clearTimeout(timer);
  }
}

export async function buildSupplyDutyOcrDictionary(jobs, pageKind, { fetchImpl = fetch } = {}) {
  const kind = normalizePageKind(pageKind);
  if (!kind) {
    return {
      ok: false,
      reason: "gc_page_kind_required",
      page_kind: null,
      levels: [],
      item_names: []
    };
  }

  const levels = relevantGrandCompanySupplyLevels(jobs, kind);
  if (!levels.length) {
    return {
      ok: false,
      reason: "job_levels_unavailable",
      page_kind: kind,
      levels: [],
      item_names: []
    };
  }

  const cacheKey = `${kind}:${levels.join(",")}`;
  const existing = cached(cacheKey);
  if (existing) return existing;

  const params = new URLSearchParams({
    rows: levels.join(","),
    fields: "SupplyData[].Item[].Name",
    language: "ja"
  });

  let response;
  try {
    response = await fetchWithDeadline(
      fetchImpl,
      `${XIVAPI_BASE}/sheet/GCSupplyDuty?${params.toString()}`,
      { cf: { cacheEverything: true, cacheTtl: 21600 } }
    );
  } catch {
    const value = {
      ok: false,
      reason: "xivapi_unreachable",
      page_kind: kind,
      levels,
      item_names: []
    };
    putCache(cacheKey, value, false);
    return value;
  }

  if (!response.ok) {
    const value = {
      ok: false,
      reason: `xivapi_http_${response.status}`,
      page_kind: kind,
      levels,
      item_names: []
    };
    putCache(cacheKey, value, false);
    return value;
  }

  let payload;
  try {
    payload = await response.json();
  } catch {
    const value = {
      ok: false,
      reason: "xivapi_json",
      page_kind: kind,
      levels,
      item_names: []
    };
    putCache(cacheKey, value, false);
    return value;
  }

  const itemNames = uniqueSorted(
    extractSupplyDutyItems(payload)
      .filter(item => levels.includes(Number(item.level)))
      .map(item => item.item_name)
  );

  const value = itemNames.length
    ? {
        ok: true,
        reason: null,
        page_kind: kind,
        levels,
        item_names: itemNames,
        dictionary_key: `${kind}|${levels.join(",")}|${itemNames.join("|")}`
      }
    : {
        ok: false,
        reason: "gc_supply_level_empty",
        page_kind: kind,
        levels,
        item_names: []
      };

  putCache(cacheKey, value, value.ok);
  return value;
}

export function buildSupplyDutyOcrPrompt(dictionary) {
  const itemNames = uniqueSorted(Array.isArray(dictionary?.item_names) ? dictionary.item_names : []);
  const levels = Array.isArray(dictionary?.levels) ? dictionary.levels : [];
  const pageKind = normalizePageKind(dictionary?.page_kind) || "unknown";
  const dictionaryText = itemNames.map((name, index) => `${index}: ${name}`).join("\n");

  return [
    "FINAL FANTASY XIV日本語クライアントのグランドカンパニー『調達任務』一覧をOCRしてください。",
    `今回の対象タブ: ${pageKind}。Lodestone同期済みジョブLv: ${levels.join(", ") || "不明"}。`,
    "最重要ルール: 品名を自由記述してはいけません。各行の表示文字を下のFF14公式データ由来候補と照合し、最も視覚的に一致する候補の item_index だけを返してください。",
    "候補にない文字列をOCR結果として作らないでください。英語への翻訳、Item 12345 のような内部ID風文字列、途中までの品名、推測した品名は禁止です。",
    "どの候補とも十分に一致しない行は、候補を無理に当てはめず deliveries から省略してください。",
    "候補は現在のジョブLvでFF14のGCSupplyDutyに登録されている調達品です。OCRではこの候補集合を文字辞書として使ってください。",
    "--- item_index 候補ここから ---",
    dictionaryText,
    "--- item_index 候補ここまで ---",
    "画面上部に『SUPPLY DUTY』または『調達任務』があり、『軍需品調達』『補給品調達』『希少品調達』のタブ、または『調達依頼品』『調達単位』『報酬経験値』『報酬軍票』『所持数』の列が見える画面は recognized=true としてください。",
    "deliveries は現在選択中のタブに見えている納品行だけを上から順番に抽出してください。",
    "requested_quantity は同じ行の『調達単位』の数値です。",
    "owned_quantity は『所持数』欄で現在所持している個数が1つの整数として明確に読める時だけ入れてください。曖昧なら null にし、合算や推測をしないでください。",
    "starred は金色の★が明確に見える行だけ true。",
    "『SUPPLY DUTY / 調達任務』ではない別画面、または候補辞書と照合して読める納品行が1件もない場合だけ recognized=false、deliveries=[] としてください。"
  ].join("\n");
}

export function grandCompanyDictionarySchema(dictionary) {
  const itemNames = uniqueSorted(Array.isArray(dictionary?.item_names) ? dictionary.item_names : []);
  if (!itemNames.length) throw new Error("gc_supply_dictionary_empty");
  return {
    type: "object",
    additionalProperties: false,
    properties: {
      recognized: { type: "boolean" },
      confidence: { type: "number", minimum: 0, maximum: 1 },
      deliveries: {
        type: "array",
        maxItems: 20,
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            item_index: { type: "integer", minimum: 0, maximum: itemNames.length - 1 },
            requested_quantity: { type: ["integer", "null"] },
            owned_quantity: { type: ["integer", "null"] },
            starred: { type: "boolean" },
            confidence: { type: "number", minimum: 0, maximum: 1 }
          },
          required: [
            "item_index",
            "requested_quantity",
            "owned_quantity",
            "starred",
            "confidence"
          ]
        }
      }
    },
    required: ["recognized", "confidence", "deliveries"]
  };
}

export function materializeSupplyDutyDictionaryNames(parsed, dictionary) {
  const itemNames = uniqueSorted(Array.isArray(dictionary?.item_names) ? dictionary.item_names : []);
  const deliveries = (Array.isArray(parsed?.deliveries) ? parsed.deliveries : [])
    .map(entry => {
      const index = Number(entry?.item_index);
      if (!Number.isInteger(index) || index < 0 || index >= itemNames.length) return null;
      return {
        ...entry,
        item_name: itemNames[index],
        class_or_job: null,
        bonus_text: null,
        reward_text: null
      };
    })
    .filter(Boolean);
  return {
    recognized: Boolean(parsed?.recognized) && deliveries.length > 0,
    confidence: parsed?.confidence,
    company_name: null,
    deliveries
  };
}

export function shouldReuseDictionaryOcrCache(analysis, dictionarySignature) {
  return Boolean(
    analysis &&
    typeof analysis === "object" &&
    analysis.parser_version === GC_SUPPLY_DUTY_OCR_PARSER_VERSION &&
    analysis.ocr_dictionary_signature === dictionarySignature
  );
}

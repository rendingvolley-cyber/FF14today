const WORLD = "Chocobo";
const MARKET_TIMEOUT_MS = 4000;

const REWARD_BY_TASK = Object.freeze({
  "craft:arm80:leve:armguards-maiming": Object.freeze({ baseGil: 4900, baseExp: 935000 }),
  "craft:arm80:leve:high-durium-nugget": Object.freeze({ baseGil: 2450, baseExp: 724620 }),
  "craft:arm82:leve:gauntlets-fending": Object.freeze({ baseGil: 4910, baseExp: 1051810 }),
  "craft:arm82:leve:armor-fending": Object.freeze({ baseGil: 4920, baseExp: 1582910 }),
  "craft:arm84:leve:bismuth-ingot": Object.freeze({ baseGil: 2470, baseExp: 933280 }),
  "craft:arm84:leve:bismuth-alembic": Object.freeze({ baseGil: 4960, baseExp: 1255600 }),
  "craft:arm86:leve:falling-dragon-helm": Object.freeze({ baseGil: 4980, baseExp: 1503270 }),
  "craft:arm86:leve:chocobo-frypan": Object.freeze({ baseGil: 5000, baseExp: 1443780 }),
  "craft:arm88:leve:casting-gloves": Object.freeze({ baseGil: 5020, baseExp: 1703250 }),
  "craft:arm88:leve:maiming-top": Object.freeze({ baseGil: 5040, baseExp: 2257300 }),
  "craft:arm90:leve:mountain-chromite-ingot": Object.freeze({ baseGil: 2530, baseExp: 1440660 }),
  "craft:arm90:leve:mountain-chromite-tower-shield": Object.freeze({ baseGil: 2530, baseExp: 1440660 }),
  "craft:arm92:leve:ruthenium-vambraces-maiming": Object.freeze({ baseGil: 5070, baseExp: 2148720 }),
  "craft:arm92:leve:ruthenium-sabatons-fending": Object.freeze({ baseGil: 5070, baseExp: 2148720 }),
  "craft:arm94:leve:cobalt-tungsten-ingot": Object.freeze({ baseGil: 2550, baseExp: 1902430 }),
  "craft:arm94:leve:cobalt-tungsten-alembic": Object.freeze({ baseGil: 5100, baseExp: 2454760 }),
  "craft:arm96:leve:gold-titanium-caster-helm": Object.freeze({ baseGil: 5140, baseExp: 3059520 }),
  "craft:arm96:leve:gold-titanium-fending-spike-armor": Object.freeze({ baseGil: 5140, baseExp: 4554260 }),
  "craft:arm98:leve:ra-kaznar-scouting-gloves": Object.freeze({ baseGil: 5180, baseExp: 3459540 }),
  "craft:arm98:leve:ra-kaznar-maiming-greaves": Object.freeze({ baseGil: 5180, baseExp: 3459540 })
});

function positiveInt(value) {
  const n = Math.floor(Number(value));
  return Number.isInteger(n) && n > 0 ? n : null;
}

function finiteMoney(value) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
}

export function leveRewardForTask(taskKey) {
  const row = REWARD_BY_TASK[String(taskKey || "").trim()];
  if (!row) return null;
  return {
    base_gil: row.baseGil,
    hq_gil: row.baseGil * 2,
    base_exp: row.baseExp,
    hq_exp: row.baseExp * 2,
    hq_multiplier: 2
  };
}

export function quoteMarketListings(listings, quantity, hq) {
  let remaining = positiveInt(quantity);
  if (!remaining) return null;
  const rows = (Array.isArray(listings) ? listings : [])
    .filter(row => Boolean(row?.hq) === Boolean(hq))
    .map(row => ({
      quantity: positiveInt(row?.quantity) || 0,
      unitPrice: finiteMoney(row?.pricePerUnit)
    }))
    .filter(row => row.quantity > 0 && row.unitPrice != null && row.unitPrice > 0)
    .sort((a, b) => a.unitPrice - b.unitPrice);
  let total = 0;
  for (const row of rows) {
    if (!remaining) break;
    const take = Math.min(remaining, row.quantity);
    total += take * row.unitPrice;
    remaining -= take;
  }
  return remaining === 0 ? Math.round(total) : null;
}

function marketItem(data, itemId) {
  if (Number(data?.itemID) === Number(itemId)) return data;
  return data?.items?.[String(itemId)] || data?.items?.[Number(itemId)] || null;
}

function marketAgeMinutes(item) {
  const uploaded = Number(item?.lastUploadTime || 0);
  if (!Number.isFinite(uploaded) || uploaded <= 0) return null;
  return Math.max(0, Math.round((Date.now() - uploaded) / 60000));
}

export function buildLeveRewardMarketComparison(taskKey, advice, marketData = null) {
  const reward = leveRewardForTask(taskKey);
  if (!reward) return null;
  const itemId = positiveInt(advice?.itemId);
  const quantity = positiveInt(advice?.requiredQuantity) || 1;
  const item = itemId ? marketItem(marketData, itemId) : null;
  const nqMarket = item ? quoteMarketListings(item.listings, quantity, false) : null;
  const hqMarket = item ? quoteMarketListings(item.listings, quantity, true) : null;
  const craftRaw = (advice?.routes || []).find(row => row?.key === "craft_raw" && row?.available);
  const craftRawGil = finiteMoney(craftRaw?.additionalGil ?? craftRaw?.gil);
  return {
    ...reward,
    item_id: itemId,
    required_quantity: quantity,
    world: WORLD,
    market_nq_gil: nqMarket,
    market_hq_gil: hqMarket,
    net_nq_buy_gil: nqMarket == null ? null : reward.base_gil - nqMarket,
    net_hq_buy_gil: hqMarket == null ? null : reward.hq_gil - hqMarket,
    craft_raw_gil: craftRawGil,
    net_hq_craft_gil: craftRawGil == null ? null : reward.hq_gil - craftRawGil,
    market_age_minutes: marketAgeMinutes(item),
    optional_item_rewards_included: false
  };
}

async function fetchFinishedItemMarket(itemId, fetchImpl) {
  if (!positiveInt(itemId)) return null;
  try {
    const response = await fetchImpl(`https://universalis.app/api/v2/${encodeURIComponent(WORLD)}/${Number(itemId)}?listings=100`, {
      headers: { "user-agent": "FF14Today/1.9 leve-reward-market-compare" },
      signal: AbortSignal.timeout(MARKET_TIMEOUT_MS),
      cf: { cacheEverything: true, cacheTtl: 60 }
    });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}

function json(data, status, headers) {
  const next = new Headers(headers || {});
  next.set("content-type", "application/json; charset=utf-8");
  next.set("cache-control", "no-store");
  next.set("x-content-type-options", "nosniff");
  return new Response(JSON.stringify(data, null, 2), { status, headers: next });
}

export async function augmentLeveRewardMarketResponse(request, response, { fetchImpl = fetch } = {}) {
  if (!response?.ok || !(response.headers.get("content-type") || "").includes("application/json")) return response;
  const url = new URL(request.url);
  const taskKey = String(url.searchParams.get("task_key") || "").trim();
  if (!leveRewardForTask(taskKey)) return response;
  let data;
  try { data = await response.clone().json(); }
  catch { return response; }
  const advice = data?.advice;
  if (!advice) return response;
  const marketData = await fetchFinishedItemMarket(advice.itemId, fetchImpl);
  const comparison = buildLeveRewardMarketComparison(taskKey, advice, marketData);
  if (!comparison) return response;
  return json({ ...data, leve_reward_market_comparison: comparison }, response.status, response.headers);
}

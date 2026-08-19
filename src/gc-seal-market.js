export const GC_SEAL_MARKET_CANDIDATES = Object.freeze([
  { name_en: "Coke", seal_cost: 200, exchange_quantity: 1 },
  { name_en: "Potash", seal_cost: 200, exchange_quantity: 1 },
  { name_en: "Aqueous Whetstone", seal_cost: 200, exchange_quantity: 1 },
  { name_en: "Peacock Ore", seal_cost: 200, exchange_quantity: 1 },
  { name_en: "Hardened Sap", seal_cost: 200, exchange_quantity: 1 },
  { name_en: "Petrified Log", seal_cost: 1500, exchange_quantity: 1 },
  { name_en: "Scheelite", seal_cost: 1500, exchange_quantity: 1 },
  { name_en: "Raziqsand", seal_cost: 1500, exchange_quantity: 1 },
  { name_en: "Saurian Skin", seal_cost: 1500, exchange_quantity: 1 },
  { name_en: "Cashmere Fleece", seal_cost: 1500, exchange_quantity: 1 },
  { name_en: "Emery", seal_cost: 1500, exchange_quantity: 1 }
]);

export const GC_SEAL_SELL_BATCH_QUANTITY = 300;
export const GC_SEAL_MAX_BATCH_DAYS = 3;
const MIN_DAILY_SALES = GC_SEAL_SELL_BATCH_QUANTITY / GC_SEAL_MAX_BATCH_DAYS;
const MIN_AVERAGE_SALE_PRICE = 100;
const MIN_GIL_PER_1000_SEALS = 1000;

function finiteNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function round1(value) {
  return Math.round(finiteNumber(value) * 10) / 10;
}

function valuePoints(gilPer1000Seals) {
  const value = finiteNumber(gilPer1000Seals);
  if (value < MIN_GIL_PER_1000_SEALS) return 0;
  if (value < 1500) return 5;
  if (value < 2500) return 9;
  if (value < 4000) return 13;
  if (value < 7000) return 17;
  return 20;
}

function sellThroughPoints(daysToSellBatch) {
  const days = finiteNumber(daysToSellBatch, Infinity);
  if (days <= 0.5) return 80;
  if (days <= 1) return 76;
  if (days <= 1.5) return 72;
  if (days <= 2) return 68;
  if (days <= GC_SEAL_MAX_BATCH_DAYS) return 60;
  return 0;
}

function salesPriority(velocity) {
  const value = finiteNumber(velocity);
  if (value >= 600) return "かなり売れる";
  if (value >= 300) return "非常に売れやすい";
  if (value >= MIN_DAILY_SALES) return "300個向き";
  return "300個には遅い";
}

export function scoreSealExchangeCandidate(input) {
  const sealCost = Math.max(1, finiteNumber(input?.seal_cost, 1));
  const exchangeQuantity = Math.max(1, finiteNumber(input?.exchange_quantity, 1));
  const averageSalePrice = Math.max(0, finiteNumber(input?.average_sale_price));
  const dailySaleVelocity = Math.max(0, finiteNumber(input?.daily_sale_velocity));
  const listedQuantity = Math.max(0, finiteNumber(input?.listed_quantity));
  const grossPerExchange = averageSalePrice * exchangeQuantity;
  const gilPer1000Seals = grossPerExchange / sealCost * 1000;
  const daysSupply = dailySaleVelocity > 0 ? listedQuantity / dailySaleVelocity : Infinity;
  const daysToSellBatch = dailySaleVelocity > 0 ? GC_SEAL_SELL_BATCH_QUANTITY / dailySaleVelocity : Infinity;
  const sellThrough = sellThroughPoints(daysToSellBatch);
  const value = valuePoints(gilPer1000Seals);
  return {
    score: round1(sellThrough + value),
    sell_through_score: round1(sellThrough),
    value_score: round1(value),
    sales_priority: salesPriority(dailySaleVelocity),
    sell_batch_quantity: GC_SEAL_SELL_BATCH_QUANTITY,
    estimated_days_to_sell_batch: Number.isFinite(daysToSellBatch) ? Math.round(daysToSellBatch * 100) / 100 : null,
    estimated_gross_per_exchange: Math.round(grossPerExchange),
    estimated_gil_per_1000_seals: Math.round(gilPer1000Seals),
    estimated_days_supply: Number.isFinite(daysSupply) ? round1(daysSupply) : null,
    velocity_floor_pass: dailySaleVelocity >= MIN_DAILY_SALES,
    price_floor_pass: averageSalePrice >= MIN_AVERAGE_SALE_PRICE,
    efficiency_floor_pass: gilPer1000Seals >= MIN_GIL_PER_1000_SEALS
  };
}

function sortRankedRows(rows) {
  return [...rows].sort((a, b) => b.daily_sale_velocity - a.daily_sale_velocity
    || b.estimated_gil_per_1000_seals - a.estimated_gil_per_1000_seals
    || b.average_sale_price - a.average_sale_price);
}

function recommendationStrength(row) {
  if (row.efficiency_floor_pass) return "strong";
  return "velocity_first";
}

export function rankSealExchangeRows(rows, limit = 5) {
  const max = Math.max(1, Number(limit) || 5);
  const scored = (Array.isArray(rows) ? rows : []).map(row => ({ ...row, ...scoreSealExchangeCandidate(row) }));

  // 300個を短期間で現金化する用途では、売れる速さを最優先のハード条件にする。
  // 単価や軍票効率が高くても、300個を3日以内に吸収できない品はランキングへ入れない。
  const liquid = scored.filter(row => row.velocity_floor_pass && row.price_floor_pass);

  return sortRankedRows(liquid)
    .slice(0, max)
    .map((row, index) => ({
      ...row,
      recommendation_strength: recommendationStrength(row),
      rank: index + 1
    }));
}

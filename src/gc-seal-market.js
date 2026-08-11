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

function finiteNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function round1(value) {
  return Math.round(finiteNumber(value) * 10) / 10;
}

function efficiencyPoints(gilPer1000Seals) {
  const value = finiteNumber(gilPer1000Seals);
  if (value <= 0) return 0;
  if (value < 500) return 5;
  if (value < 1000) return 12;
  if (value < 2500) return 22;
  if (value < 5000) return 32;
  if (value < 10000) return 40;
  return 45;
}

function demandPoints(velocity) {
  const value = finiteNumber(velocity);
  if (value <= 0) return 0;
  return Math.min(45, Math.log1p(value) * 12);
}

function scarcityPoints(daysSupply, listingRows) {
  if (finiteNumber(listingRows) >= 100) return 0;
  if (!Number.isFinite(daysSupply)) return 0;
  if (daysSupply <= 1) return 10;
  if (daysSupply <= 3) return 8;
  if (daysSupply <= 7) return 4;
  return 0;
}

export function scoreSealExchangeCandidate(input) {
  const sealCost = Math.max(1, finiteNumber(input?.seal_cost, 1));
  const exchangeQuantity = Math.max(1, finiteNumber(input?.exchange_quantity, 1));
  const averageSalePrice = Math.max(0, finiteNumber(input?.average_sale_price));
  const dailySaleVelocity = Math.max(0, finiteNumber(input?.daily_sale_velocity));
  const listedQuantity = Math.max(0, finiteNumber(input?.listed_quantity));
  const listingRows = Math.max(0, finiteNumber(input?.listing_rows_sampled));
  const grossPerExchange = averageSalePrice * exchangeQuantity;
  const gilPer1000Seals = grossPerExchange / sealCost * 1000;
  const daysSupply = dailySaleVelocity > 0 ? listedQuantity / dailySaleVelocity : Infinity;
  const score = efficiencyPoints(gilPer1000Seals)
    + demandPoints(dailySaleVelocity)
    + scarcityPoints(daysSupply, listingRows);
  return {
    score: round1(score),
    estimated_gross_per_exchange: Math.round(grossPerExchange),
    estimated_gil_per_1000_seals: Math.round(gilPer1000Seals),
    estimated_days_supply: Number.isFinite(daysSupply) ? round1(daysSupply) : null
  };
}

export function rankSealExchangeRows(rows, limit = 3) {
  return (Array.isArray(rows) ? rows : [])
    .filter(row => finiteNumber(row?.daily_sale_velocity) >= 0.2 && finiteNumber(row?.average_sale_price) > 0)
    .map(row => ({ ...row, ...scoreSealExchangeCandidate(row) }))
    .sort((a, b) => b.score - a.score
      || b.estimated_gil_per_1000_seals - a.estimated_gil_per_1000_seals
      || b.daily_sale_velocity - a.daily_sale_velocity)
    .slice(0, Math.max(1, Number(limit) || 3))
    .map((row, index) => ({ ...row, rank: index + 1 }));
}

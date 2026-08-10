import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  applyInventoryEvidenceToRoute,
  buildLeveCostAdvice,
  chooseRecommendedRoute,
  quotePriceBands
} from "../src/leve-cost-advisor.js";
import { collectReachableItemIds, leveTarget } from "../src/leve-cost-data.js";

const target = leveTarget("craft:alc90:leve:ginseng-angle-brush");
assert.equal(target.itemId, 41856);
assert.ok(collectReachableItemIds(target).includes(44053));
assert.ok(collectReachableItemIds(target).includes(13));

const prices = {
  41856: { nq: 15000, hq: 20000 },
  36238: { nq: 2000 },
  44019: { nq: 3000 },
  44058: { nq: 1000 },
  36239: { nq: 1000 },
  36165: { nq: 100 },
  36260: { nq: 500 },
  36263: { nq: 100 },
  44014: { nq: 100 },
  44053: { nq: 500 },
  36241: { nq: 200 },
  36257: { nq: 100 },
  36258: { nq: 200 },
  10: { nq: 10 },
  11: { nq: 10 },
  12: { nq: 10 },
  13: { nq: 10 }
};

const energetic = buildLeveCostAdvice(target, prices, {
  energy: 5,
  availableMinutes: 60,
  preferTraining: true
});
assert.equal(energetic.routes[0].key, "buy_finished");
assert.equal(energetic.routes[0].gil, 20000, "HQ finished price must be used");
assert.ok(energetic.routes.some(route => route.key === "buy_direct"));
assert.ok(energetic.routes.some(route => route.key === "mixed"));
assert.ok(energetic.routes.some(route => route.key === "craft_raw"));
assert.equal(energetic.recommendedKey, "mixed", "high energy should favor the cheapest mixed craft route in this fixture");

const lowEnergy = buildLeveCostAdvice(target, prices, {
  energy: 1,
  availableMinutes: 10,
  preferTraining: true
});
assert.equal(lowEnergy.recommendedKey, "buy_finished", "low energy should favor the fastest route when it fits");

const noFinishedHq = structuredClone(prices);
noFinishedHq[41856] = { nq: 5000, hq: null };
const withoutHq = buildLeveCostAdvice(target, noFinishedHq, { energy: 1, availableMinutes: 60 });
assert.equal(withoutHq.routes.find(route => route.key === "buy_finished").available, false);
assert.notEqual(withoutHq.recommendedKey, "buy_finished");

const growth = buildLeveCostAdvice(
  leveTarget("craft:alc90:leve:growth-formula-lambda"),
  {
    44049: { hq: 4000 },
    43979: { nq: 100 },
    44068: { nq: 200 },
    13: { nq: 10 }
  },
  { energy: 3, availableMinutes: 30 }
);
assert.equal(growth.requiredQuantity, 3);
assert.ok(growth.routes.length >= 2);
assert.equal(growth.routes.find(route => route.key === "buy_finished").gil, 12000);

const manual = chooseRecommendedRoute([
  { key: "cheap", available: true, gil: 1000, estimatedMinutes: 20, craftCount: 2 },
  { key: "fast", available: true, gil: 5000, estimatedMinutes: 2, craftCount: 0 }
], { energy: 1, availableMinutes: 30, preferTraining: false });
assert.equal(manual.key, "fast");

const heldIngredientRoute = applyInventoryEvidenceToRoute({
  key: "synthetic",
  label: "synthetic",
  available: true,
  gil: 9000,
  additionalGil: 9000,
  inventoryOpportunityGil: 0,
  inventoryUsed: [],
  inventoryEvidenceApplied: false,
  estimatedMinutes: 3,
  craftCount: 0,
  purchases: [{
    itemId: 44019,
    itemName: "Ginseng Lumber",
    quantity: 3,
    hq: false,
    unitPrice: 3000,
    total: 9000,
    pricingMode: "unit_fallback",
    fallbackUnitPrice: 3000,
    priceBands: []
  }],
  crafts: [],
  missingPriceItemIds: []
}, {
  44019: { quantity: 2, hq_quantity: null }
});
assert.equal(heldIngredientRoute.gil, 9000, "effective cost must preserve the market value of held items");
assert.equal(heldIngredientRoute.additionalGil, 3000, "cash outlay must only include the missing unit");
assert.equal(heldIngredientRoute.inventoryOpportunityGil, 6000, "held items must keep their opportunity value");
assert.equal(heldIngredientRoute.purchases[0].heldQuantity, 2);
assert.equal(heldIngredientRoute.purchases[0].buyQuantity, 1);

const hqRoute = {
  key: "hq",
  label: "hq",
  available: true,
  gil: 20000,
  additionalGil: 20000,
  inventoryOpportunityGil: 0,
  inventoryUsed: [],
  inventoryEvidenceApplied: false,
  estimatedMinutes: 2,
  craftCount: 0,
  purchases: [{
    itemId: 41856,
    itemName: "Ginseng Angle Brush",
    quantity: 1,
    hq: true,
    unitPrice: 20000,
    total: 20000,
    pricingMode: "unit_fallback",
    fallbackUnitPrice: 20000,
    priceBands: []
  }],
  crafts: [],
  missingPriceItemIds: []
};
const unknownQuality = applyInventoryEvidenceToRoute(hqRoute, {
  41856: { quantity: 1, hq_quantity: null }
});
assert.equal(unknownQuality.additionalGil, 20000, "unknown quality inventory must not satisfy an HQ-only purchase");
assert.equal(unknownQuality.inventoryOpportunityGil, 0);
const knownHq = applyInventoryEvidenceToRoute(hqRoute, {
  41856: { quantity: 1, hq_quantity: 1 }
});
assert.equal(knownHq.additionalGil, 0);
assert.equal(knownHq.inventoryOpportunityGil, 20000);

const adviceWithHeldHq = buildLeveCostAdvice(target, prices, {
  energy: 1,
  availableMinutes: 10,
  preferTraining: true,
  inventory: { 41856: { quantity: 1, hq_quantity: 1 } }
});
assert.equal(adviceWithHeldHq.recommendedKey, "buy_finished");
assert.equal(adviceWithHeldHq.routes.find(route => route.key === "buy_finished").additionalGil, 0);
assert.match(adviceWithHeldHq.recommendationReason, /追加支出は約0G/);

const stackQuote = quotePriceBands([
  { quantity: 1, unitPrice: 1000 },
  { quantity: 2, unitPrice: 2000 }
], 3);
assert.equal(stackQuote.complete, true);
assert.equal(stackQuote.total, 5000, "three items must consume the expensive second listing after the first cheap unit");
assert.equal(Math.round(stackQuote.averageUnitPrice), 1667);
assert.equal(quotePriceBands([{ quantity: 2, unitPrice: 1000 }], 3).complete, false, "insufficient listing quantity must not be treated as fully purchasable");

const stackAwareGrowth = buildLeveCostAdvice(
  leveTarget("craft:alc90:leve:growth-formula-lambda"),
  {
    44049: {
      hq: 1000,
      nqOffers: [],
      hqOffers: [
        { quantity: 1, unitPrice: 1000 },
        { quantity: 2, unitPrice: 2000 }
      ]
    },
    43979: { nq: 100 },
    44068: { nq: 200 },
    13: { nq: 10 }
  },
  { energy: 1, availableMinutes: 30 }
);
const stackFinished = stackAwareGrowth.routes.find(route => route.key === "buy_finished");
assert.equal(stackFinished.gil, 5000, "finished-item route must sum listing quantities, not multiply the cheapest unit price");
assert.equal(stackFinished.purchases[0].pricingMode, "listing_quantity");

const stackWithHeld = buildLeveCostAdvice(
  leveTarget("craft:alc90:leve:growth-formula-lambda"),
  {
    44049: {
      hq: 1000,
      nqOffers: [],
      hqOffers: [
        { quantity: 1, unitPrice: 1000 },
        { quantity: 2, unitPrice: 2000 }
      ]
    },
    43979: { nq: 100 },
    44068: { nq: 200 },
    13: { nq: 10 }
  },
  {
    energy: 1,
    availableMinutes: 30,
    inventory: { 44049: { quantity: 2, hq_quantity: 2 } }
  }
);
const heldStackFinished = stackWithHeld.routes.find(route => route.key === "buy_finished");
assert.equal(heldStackFinished.gil, 5000, "effective cost must remain the full replacement cost");
assert.equal(heldStackFinished.additionalGil, 1000, "with two held HQ items, only the cheapest one remaining unit should be bought");
assert.equal(heldStackFinished.inventoryOpportunityGil, 4000, "held items take the marginal replacement value of the remaining listing curve");

const insufficientGrowth = buildLeveCostAdvice(
  leveTarget("craft:alc90:leve:growth-formula-lambda"),
  {
    44049: {
      hq: 1000,
      nqOffers: [],
      hqOffers: [{ quantity: 2, unitPrice: 1000 }]
    },
    43979: { nq: 100 },
    44068: { nq: 200 },
    13: { nq: 10 }
  },
  { energy: 1, availableMinutes: 30 }
);
assert.equal(insufficientGrowth.routes.find(route => route.key === "buy_finished").available, false, "not enough listed HQ quantity must disable the buy-finished route");

const uiSource = readFileSync(new URL("../public/leve-cost-advice.js", import.meta.url), "utf8");
assert.doesNotMatch(uiSource, /MutationObserver/, "Leve Cost UI must not use MutationObserver after the boot-loop incident");
assert.match(uiSource, /setInterval\(queueRefresh,\s*1000\)/, "Leve Cost UI must use bounded polling");
assert.match(uiSource, /panel\.dataset\.loading/, "Leve Cost UI must suppress duplicate in-flight requests");
assert.match(uiSource, /x-profile-token/, "Leve Cost API must receive the same browser profile token as screenshot evidence");
assert.match(uiSource, /ff14today:context-saved/, "inventory screenshot save must invalidate the cached leve comparison immediately");
assert.match(uiSource, /追加支出/, "UI must expose cash outlay separately");
assert.match(uiSource, /実質コスト/, "UI must expose opportunity-cost-inclusive cost separately");

console.log("leve-cost-advisor tests: ok");

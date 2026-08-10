import assert from "node:assert/strict";
import { buildLeveCostAdvice, chooseRecommendedRoute } from "../src/leve-cost-advisor.js";
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

console.log("leve-cost-advisor tests: ok");

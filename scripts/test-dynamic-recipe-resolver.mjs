import assert from "node:assert/strict";
import {
  collectGraphItemIds,
  normalizeDynamicTargetInput,
  parseRecipeRow,
  resolveDynamicCraftTarget
} from "../src/dynamic-recipe-resolver.js";
import { buildDynamicLeveCostAdvice } from "../src/dynamic-leve-cost-advisor.js";

function response(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() { return structuredClone(body); }
  };
}

const calls = [];
async function fakeFetch(rawUrl) {
  const url = new URL(rawUrl);
  calls.push(url.toString());
  if (url.pathname === "/api/search" && url.searchParams.get("sheets") === "Item") {
    return response({
      results: [{
        row_id: 9000,
        fields: { Name: "Dynamic Widget", "Name@lang(ja)": "動的ウィジェット" }
      }]
    });
  }
  if (url.pathname === "/api/search" && url.searchParams.get("sheets") === "Recipe") {
    const query = url.searchParams.get("query") || "";
    const itemId = Number(query.match(/ItemResult=(\d+)/)?.[1] || 0);
    const rowMap = { 9000: 5000, 9001: 5001 };
    return response({ results: rowMap[itemId] ? [{ row_id: rowMap[itemId] }] : [] });
  }
  if (url.pathname === "/api/sheet/Recipe/5000") {
    return response({
      row_id: 5000,
      fields: {
        ItemResult: { value: 9000, fields: { Name: "Dynamic Widget" } },
        AmountResult: 1,
        Ingredient: [
          { fields: { Item: { value: 9001, fields: { Name: "Dynamic Ingot" } }, Amount: 2 } },
          { fields: { Item: { value: 9002, fields: { Name: "Dynamic Crystal" } }, Amount: 3 } }
        ]
      }
    });
  }
  if (url.pathname === "/api/sheet/Recipe/5001") {
    return response({
      row_id: 5001,
      fields: {
        ItemResult: { value: 9001, fields: { Name: "Dynamic Ingot" } },
        AmountResult: 2,
        Ingredient: [
          { fields: { Item: { value: 9003, fields: { Name: "Dynamic Ore" } }, Amount: 4 } }
        ]
      }
    });
  }
  if (url.pathname === "/api/sheet/Item") {
    return response({
      rows: [
        { row_id: 9000, fields: { Name: "Dynamic Widget", "Name@lang(ja)": "動的ウィジェット" } },
        { row_id: 9001, fields: { Name: "Dynamic Ingot", "Name@lang(ja)": "動的インゴット" } },
        { row_id: 9002, fields: { Name: "Dynamic Crystal", "Name@lang(ja)": "動的クリスタル" } },
        { row_id: 9003, fields: { Name: "Dynamic Ore", "Name@lang(ja)": "動的鉱石" } }
      ]
    });
  }
  throw new Error(`unexpected URL ${url}`);
}

const flat = parseRecipeRow({
  row_id: 42,
  fields: {
    ItemResult: { value: 7000 },
    AmountResult: 2,
    ItemIngredient0: { value: 7001 },
    AmountIngredient0: 3,
    ItemIngredient1: { value: 7002 },
    AmountIngredient1: 4
  }
}, 7000);
assert.equal(flat.outputQuantity, 2);
assert.deepEqual(flat.ingredients.map(row => [row.itemId, row.amount]), [[7001, 3], [7002, 4]]);

assert.throws(
  () => normalizeDynamicTargetInput({ taskKey: "open:proxy", itemName: "X", requiredQuantity: 1 }),
  /task_key/
);
assert.throws(
  () => normalizeDynamicTargetInput({ taskKey: "craft:dynamic:test", itemName: "X", requiredQuantity: 100 }),
  /1〜99/
);

const resolved = await resolveDynamicCraftTarget({
  taskKey: "craft:dynamic:fixture",
  itemName: "Dynamic Widget",
  requiredQuantity: 2,
  hqRequired: true
}, { fetchImpl: fakeFetch });

assert.equal(resolved.target.itemId, 9000);
assert.equal(resolved.target.requiredQuantity, 2);
assert.equal(resolved.target.hqRequired, true);
assert.deepEqual(resolved.recipeGraph[9000].ingredients, [[9001, 2], [9002, 3]]);
assert.deepEqual(resolved.recipeGraph[9001].ingredients, [[9003, 4]]);
assert.equal(resolved.recipeGraph[9001].outputQuantity, 2);
assert.equal(resolved.itemNames[9003], "Dynamic Ore");
assert.deepEqual(new Set(collectGraphItemIds(9000, resolved.recipeGraph)), new Set([9000, 9001, 9002, 9003]));
assert.ok(calls.some(url => url.includes("/api/sheet/Item?")), "item names should be batched after graph resolution");

const prices = {
  9000: { hqOffers: [{ quantity: 2, unitPrice: 10000 }], nqOffers: [] },
  9001: { nqOffers: [{ quantity: 4, unitPrice: 1200 }], hqOffers: [] },
  9002: { nqOffers: [{ quantity: 6, unitPrice: 100 }], hqOffers: [] },
  9003: { nqOffers: [{ quantity: 8, unitPrice: 150 }], hqOffers: [] }
};
const advice = buildDynamicLeveCostAdvice(
  resolved.target,
  resolved.recipeGraph,
  resolved.itemNames,
  prices,
  { energy: 4, availableMinutes: 60, preferTraining: true }
);
assert.equal(advice.dynamicRecipeGraph, true);
assert.equal(advice.itemName, "Dynamic Widget");
assert.ok(advice.routes.some(route => route.key === "buy_finished" && route.gil === 20000));
assert.ok(advice.routes.some(route => route.crafts.some(craft => craft.itemName === "Dynamic Widget")));
assert.ok(advice.routes.some(route => route.purchases.some(purchase => purchase.itemName === "Dynamic Ore")));
assert.ok(advice.recommendedKey);

console.log("dynamic recipe resolver tests: ok");

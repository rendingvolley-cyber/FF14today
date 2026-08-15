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

let retryAttempts = 0;
const retryCalls = [];
async function retryFetch(rawUrl) {
  const url = new URL(rawUrl);
  retryCalls.push(url.toString());
  if (url.pathname === "/api/search" && url.searchParams.get("sheets") === "Item") {
    retryAttempts += 1;
    if (retryAttempts < 3) throw new Error("temporary network failure");
    return response({ results: [{ row_id: 9100, fields: { Name: "Retry Widget", "Name@lang(ja)": "再試行ウィジェット" } }] });
  }
  if (url.pathname === "/api/search" && url.searchParams.get("sheets") === "Recipe") {
    return response({ results: [{ row_id: 5100 }] });
  }
  if (url.pathname === "/api/sheet/Recipe/5100") {
    return response({ row_id: 5100, fields: { ItemResult: { value: 9100 }, AmountResult: 1, ItemIngredient0: { value: 9101 }, AmountIngredient0: 1 } });
  }
  if (url.pathname === "/api/sheet/Item") {
    return response({ rows: [{ row_id: 9100, fields: { Name: "Retry Widget" } }, { row_id: 9101, fields: { Name: "Retry Ore" } }] });
  }
  throw new Error(`unexpected URL ${url}`);
}
const retried = await resolveDynamicCraftTarget({
  taskKey: "craft:dynamic:retry",
  itemName: "再試行ウィジェット",
  requiredQuantity: 1
}, { fetchImpl: retryFetch });
assert.equal(retried.target.itemId, 9100);
assert.equal(retryAttempts, 3, "temporary XIVAPI failures should be retried before giving up");
const firstRetryQuery = new URL(retryCalls[0]).searchParams.get("query") || "";
assert.match(firstRetryQuery, /^Name@ja=/, "Japanese item labels should query the Japanese field first");

let nestedAttempts = 0;
async function partialFetch(rawUrl) {
  const url = new URL(rawUrl);
  if (url.pathname === "/api/search" && url.searchParams.get("sheets") === "Item") {
    return response({ results: [{ row_id: 9200, fields: { Name: "Partial Widget", "Name@lang(ja)": "部分ウィジェット" } }] });
  }
  if (url.pathname === "/api/search" && url.searchParams.get("sheets") === "Recipe") {
    const itemId = Number((url.searchParams.get("query") || "").match(/ItemResult=(\d+)/)?.[1] || 0);
    if (itemId === 9200) return response({ results: [{ row_id: 5200 }] });
    if (itemId === 9201) {
      nestedAttempts += 1;
      throw new Error("nested XIVAPI outage");
    }
    return response({ results: [] });
  }
  if (url.pathname === "/api/sheet/Recipe/5200") {
    return response({ row_id: 5200, fields: { ItemResult: { value: 9200 }, AmountResult: 1, ItemIngredient0: { value: 9201 }, AmountIngredient0: 2 } });
  }
  if (url.pathname === "/api/sheet/Item") {
    return response({ rows: [{ row_id: 9200, fields: { Name: "Partial Widget" } }, { row_id: 9201, fields: { Name: "Partial Ore" } }] });
  }
  throw new Error(`unexpected URL ${url}`);
}
const partial = await resolveDynamicCraftTarget({
  taskKey: "craft:dynamic:partial",
  itemName: "Partial Widget",
  requiredQuantity: 1
}, { fetchImpl: partialFetch });
assert.deepEqual(partial.recipeGraph[9200].ingredients, [[9201, 2]]);
assert.equal(partial.recipeGraph[9201], undefined, "a failed nested recipe should become a buyable leaf instead of killing the whole delivery");
assert.equal(nestedAttempts, 3);
assert.match(partial.source, /partial/);
assert.ok(partial.warnings.some(warning => warning === "xivapi_partial:9201:xivapi_unreachable"));

let nameAttempts = 0;
async function namesFailFetch(rawUrl) {
  const url = new URL(rawUrl);
  if (url.pathname === "/api/search" && url.searchParams.get("sheets") === "Item") {
    return response({ results: [{ row_id: 9300, fields: { Name: "Names Widget", "Name@lang(ja)": "名称ウィジェット" } }] });
  }
  if (url.pathname === "/api/search" && url.searchParams.get("sheets") === "Recipe") {
    const itemId = Number((url.searchParams.get("query") || "").match(/ItemResult=(\d+)/)?.[1] || 0);
    return response({ results: itemId === 9300 ? [{ row_id: 5300 }] : [] });
  }
  if (url.pathname === "/api/sheet/Recipe/5300") {
    return response({ row_id: 5300, fields: { ItemResult: { value: 9300 }, AmountResult: 1, ItemIngredient0: { value: 9301 }, AmountIngredient0: 1 } });
  }
  if (url.pathname === "/api/sheet/Item") {
    nameAttempts += 1;
    throw new Error("name batch unavailable");
  }
  throw new Error(`unexpected URL ${url}`);
}
const namesPartial = await resolveDynamicCraftTarget({
  taskKey: "craft:dynamic:names-partial",
  itemName: "Names Widget",
  requiredQuantity: 1
}, { fetchImpl: namesFailFetch });
assert.equal(namesPartial.target.itemId, 9300);
assert.equal(nameAttempts, 3);
assert.ok(namesPartial.warnings.includes("item_names_partial:xivapi_unreachable"));
assert.match(namesPartial.source, /partial/);

let hardFailAttempts = 0;
await assert.rejects(
  () => resolveDynamicCraftTarget({
    taskKey: "craft:dynamic:hard-fail",
    itemName: "Hard Fail Widget",
    requiredQuantity: 1
  }, {
    fetchImpl: async () => {
      hardFailAttempts += 1;
      throw new Error("offline");
    }
  }),
  error => error?.code === "xivapi_unreachable"
);
assert.equal(hardFailAttempts, 3, "root item resolution should fail only after the retry budget is exhausted");

console.log("dynamic recipe resolver tests: ok");

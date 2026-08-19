import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  aggregateMaterialRequirements,
  directMaterialRequirements,
  rawMaterialRequirements
} from "../src/gc-material-requirements.js";

const resolvedA = {
  target: { itemId: 100, requiredQuantity: 2 },
  itemNames: {
    100: "完成品A",
    200: "中間材B",
    300: "原料C",
    400: "原料D"
  },
  recipeGraph: {
    100: { outputQuantity: 1, ingredients: [[200, 2], [300, 1]] },
    200: { outputQuantity: 3, ingredients: [[400, 2]] }
  }
};

assert.deepEqual(directMaterialRequirements(resolvedA), [
  { item_id: 300, item_name: "原料C", quantity: 2 },
  { item_id: 200, item_name: "中間材B", quantity: 4 }
]);
assert.deepEqual(rawMaterialRequirements(resolvedA), [
  { item_id: 300, item_name: "原料C", quantity: 2 },
  { item_id: 400, item_name: "原料D", quantity: 4 }
]);

const resolvedB = {
  target: { itemId: 101, requiredQuantity: 1 },
  itemNames: { 101: "完成品B", 300: "原料C", 500: "原料E" },
  recipeGraph: {
    101: { outputQuantity: 1, ingredients: [[300, 3], [500, 5]] }
  }
};

const deliveries = [
  { direct_materials: directMaterialRequirements(resolvedA), raw_materials: rawMaterialRequirements(resolvedA) },
  { direct_materials: directMaterialRequirements(resolvedB), raw_materials: rawMaterialRequirements(resolvedB) }
];
assert.deepEqual(aggregateMaterialRequirements(deliveries, "direct_materials"), [
  { item_id: 300, item_name: "原料C", quantity: 5 },
  { item_id: 500, item_name: "原料E", quantity: 5 },
  { item_id: 200, item_name: "中間材B", quantity: 4 }
]);
assert.deepEqual(aggregateMaterialRequirements(deliveries, "raw_materials"), [
  { item_id: 300, item_name: "原料C", quantity: 5 },
  { item_id: 400, item_name: "原料D", quantity: 4 },
  { item_id: 500, item_name: "原料E", quantity: 5 }
]);

const entry = readFileSync(new URL("../src/gc-top3-entry.js", import.meta.url), "utf8");
const outerEntry = readFileSync(new URL("../src/hunt-entry.js", import.meta.url), "utf8");
const index = readFileSync(new URL("../public/index.html", import.meta.url), "utf8");
const ui = readFileSync(new URL("../public/gc-material-requirements.js", import.meta.url), "utf8");
assert.match(entry, /\/api\/grand-company\/recipe-materials/);
assert.match(entry, /gc-material-requirements-v2-20260819/);
assert.match(entry, /gc_recipe_material_price_independent:\s*true/);
assert.doesNotMatch(entry, /prepend\(`<script type="module" src="\/gc-material-requirements/);
assert.doesNotMatch(outerEntry, /grandCompanyMaterialRequirements/);
assert.match(index, /gc-material-requirements\.js\?v=gc-material-requirements-v2-20260819/);
assert.match(ui, /製作に必要な素材一覧/);
assert.match(ui, /相場が取れなくても素材数は残します/);
assert.match(ui, /レシピ素材/);
assert.match(ui, /原材料まで展開/);
assert.match(ui, /data-gc-material-requirements-panel/);

console.log("GC recipe material requirements: ok");

export const LEVE_TARGETS = Object.freeze({
  "craft:alc90:leve:ginseng-angle-brush": Object.freeze({
    taskKey: "craft:alc90:leve:ginseng-angle-brush",
    itemId: 41856,
    itemName: "Ginseng Angle Brush",
    requiredQuantity: 1,
    hqRequired: true
  }),
  "craft:alc90:leve:growth-formula-lambda": Object.freeze({
    taskKey: "craft:alc90:leve:growth-formula-lambda",
    itemId: 44049,
    itemName: "Growth Formula Lambda",
    requiredQuantity: 3,
    hqRequired: true
  })
});

export const ITEM_NAMES = Object.freeze({
  10: "Wind Crystal",
  11: "Earth Crystal",
  12: "Lightning Crystal",
  13: "Water Crystal",
  36165: "Manganese Ore",
  36238: "Enchanted Manganese Ink",
  36239: "Moon Gel",
  36241: "Eblan Alumen",
  36257: "Mousse Flesh",
  36258: "Lunatender Blossom",
  36260: "Petalouda Scales",
  36263: "Ambrosial Water",
  41856: "Ginseng Angle Brush",
  43979: "Royal Maple Sap",
  44014: "Ginseng Log",
  44019: "Ginseng Lumber",
  44049: "Growth Formula Lambda",
  44053: "Silver Lobo Hide",
  44058: "Silver Lobo Leather",
  44068: "Poison Frog Secretions"
});

// Patch 7.0 recipe facts from the public XIV data tables. Keep this small and
// explicit: only recipes reachable from the leve targets above are included.
export const RECIPE_GRAPH = Object.freeze({
  41856: Object.freeze({
    outputQuantity: 1,
    ingredients: Object.freeze([
      [36238, 1], [44019, 3], [44058, 1], [36239, 1], [13, 8], [12, 7]
    ])
  }),
  36238: Object.freeze({
    outputQuantity: 1,
    ingredients: Object.freeze([
      [36165, 4], [36260, 1], [36263, 1], [13, 8]
    ])
  }),
  44019: Object.freeze({
    outputQuantity: 1,
    ingredients: Object.freeze([
      [44014, 5], [10, 8]
    ])
  }),
  44058: Object.freeze({
    outputQuantity: 1,
    ingredients: Object.freeze([
      [44053, 4], [36241, 1], [11, 8]
    ])
  }),
  36239: Object.freeze({
    outputQuantity: 1,
    ingredients: Object.freeze([
      [36257, 3], [36258, 1], [13, 8]
    ])
  }),
  44049: Object.freeze({
    outputQuantity: 1,
    ingredients: Object.freeze([
      [43979, 4], [44068, 2], [13, 8]
    ])
  })
});

export function leveTarget(taskKey) {
  return LEVE_TARGETS[String(taskKey || "").trim()] || null;
}

export function itemName(itemId) {
  return ITEM_NAMES[Number(itemId)] || `Item ${Number(itemId)}`;
}

export function collectReachableItemIds(target) {
  if (!target) return [];
  const seen = new Set();
  const visit = itemId => {
    const id = Number(itemId);
    if (!Number.isInteger(id) || seen.has(id)) return;
    seen.add(id);
    const recipe = RECIPE_GRAPH[id];
    if (!recipe) return;
    for (const [ingredientId] of recipe.ingredients) visit(ingredientId);
  };
  visit(target.itemId);
  return [...seen];
}

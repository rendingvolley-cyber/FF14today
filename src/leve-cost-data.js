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
  }),
  "craft:arm80:leve:armguards-maiming": Object.freeze({
    taskKey: "craft:arm80:leve:armguards-maiming",
    itemId: 34107,
    itemName: "High Durium Armguards of Maiming",
    requiredQuantity: 1,
    hqRequired: false
  }),
  "craft:arm80:leve:high-durium-nugget": Object.freeze({
    taskKey: "craft:arm80:leve:high-durium-nugget",
    itemId: 36168,
    itemName: "High Durium Nugget",
    requiredQuantity: 3,
    hqRequired: false
  })
});

export const ITEM_NAMES = Object.freeze({
  9: "Ice Crystal",
  10: "Wind Crystal",
  11: "Earth Crystal",
  12: "Lightning Crystal",
  13: "Water Crystal",
  5113: "Silver Ore",
  27757: "Dwarven Cotton",
  34107: "High Durium Armguards of Maiming",
  36162: "High Durium Sand",
  36165: "Manganese Ore",
  36168: "High Durium Nugget",
  36238: "Enchanted Manganese Ink",
  36239: "Moon Gel",
  36241: "Eblan Alumen",
  36247: "Gaja Leather",
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

// Verified static recipe facts for leve targets where a deterministic graph is
// useful. High Durium Nugget deliberately uses the Armorer recipe (Ice Crystal),
// because the same item also has a Blacksmith recipe with Fire Crystal and the
// generic dynamic resolver correctly refuses to guess between different graphs.
export const RECIPE_GRAPH = Object.freeze({
  34107: Object.freeze({
    outputQuantity: 1,
    ingredients: Object.freeze([
      [36168, 2], [36247, 1], [27757, 1], [9, 8], [11, 7]
    ])
  }),
  36168: Object.freeze({
    outputQuantity: 1,
    ingredients: Object.freeze([
      [36162, 5], [5113, 1], [9, 8]
    ])
  }),
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

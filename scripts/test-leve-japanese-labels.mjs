import assert from "node:assert/strict";
import worker from "../src/leve-cost-wrapper.js";

const ITEM_IDS = [41856, 36238, 44019, 44058, 36239, 13, 12, 36165, 36260, 36263, 44014, 10, 44053, 36241, 11, 36257, 36258];
const japanese = Object.fromEntries(ITEM_IDS.map(id => [id, `日本語アイテム${id}`]));

const originalFetch = globalThis.fetch;
globalThis.fetch = async input => {
  const url = new URL(typeof input === "string" ? input : input.url);
  if (url.hostname === "universalis.app") {
    const items = {};
    for (const id of ITEM_IDS) {
      items[id] = {
        itemID: id,
        lastUploadTime: Date.now(),
        listings: [
          { pricePerUnit: 100 + (id % 17), quantity: 999, hq: false },
          { pricePerUnit: 200 + (id % 17), quantity: 999, hq: true }
        ]
      };
    }
    return new Response(JSON.stringify({ items }), { status: 200, headers: { "content-type": "application/json" } });
  }
  if (url.hostname === "v2.xivapi.com" && url.pathname === "/api/sheet/Item") {
    assert.equal(url.searchParams.get("language"), "ja");
    assert.equal(url.searchParams.get("fields"), "Name");
    const rows = String(url.searchParams.get("rows") || "")
      .split(",")
      .map(Number)
      .filter(Number.isInteger)
      .map(id => ({ row_id: id, fields: { Name: japanese[id] || `日本語アイテム${id}` } }));
    return new Response(JSON.stringify({ rows }), { status: 200, headers: { "content-type": "application/json" } });
  }
  throw new Error(`unexpected fetch: ${url}`);
};

try {
  const request = new Request("https://ff14.today/api/leve/cost-advice?task_key=craft:alc90:leve:ginseng-angle-brush&energy=3&available_minutes=60");
  const response = await worker.fetch(request, {});
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.item_name_locale, "ja");
  assert.equal(payload.advice.itemName, japanese[41856]);

  const labels = [];
  for (const route of payload.advice.routes || []) {
    for (const row of route.purchases || []) labels.push(row.itemName);
    for (const row of route.crafts || []) labels.push(row.itemName);
    for (const row of route.inventoryUsed || []) labels.push(row.itemName);
  }
  assert(labels.length > 0);
  assert(labels.every(label => /^日本語アイテム\d+$/.test(label)), `non-Japanese fallback label found: ${labels.join(", ")}`);
  assert(!labels.includes("Ginseng Angle Brush"));
  assert(!labels.includes("Enchanted Manganese Ink"));
  console.log("leve Japanese item labels: ok");
} finally {
  globalThis.fetch = originalFetch;
}

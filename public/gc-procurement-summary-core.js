export function deliveryKey(row) {
  return `${row?.page_kind || ""}:${row?.row_index ?? ""}:${row?.item_name || ""}`;
}

function nonNegative(value) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export function aggregateSelectedDeliveries(deliveries, selectedKeys) {
  const selected = new Set((selectedKeys || []).map(String));
  const rows = (deliveries || []).filter(row => selected.has(deliveryKey(row)));
  const materials = new Map();
  const totals = {
    finishedBuy: { value: 0, known: 0 },
    craftRaw: { value: 0, known: 0 },
    recommended: { value: 0, known: 0 }
  };

  for (const row of rows) {
    const p = row?.procurement || {};
    for (const [bucket, value] of [
      ["finishedBuy", p?.market_buy?.gil],
      ["craftRaw", p?.craft_raw?.gil],
      ["recommended", p?.recommended_route?.gil]
    ]) {
      const cost = nonNegative(value);
      if (cost != null) {
        totals[bucket].value += cost;
        totals[bucket].known += 1;
      }
    }

    for (const material of p?.craft_raw?.materials || []) {
      const quantity = Math.max(0, Number(material?.quantity) || 0);
      if (!quantity) continue;
      const key = String(material?.item_id || material?.item_name || "material");
      const current = materials.get(key) || {
        item_id: material?.item_id || null,
        item_name: material?.item_name || "素材",
        quantity: 0,
        total_gil: 0,
        priced: true
      };
      current.quantity += quantity;
      const cost = nonNegative(material?.total_gil);
      if (cost == null) current.priced = false;
      else current.total_gil += cost;
      materials.set(key, current);
    }
  }

  const total = bucket => rows.length && totals[bucket].known === rows.length ? Math.round(totals[bucket].value) : null;
  return {
    selected_count: rows.length,
    finished_buy_gil: total("finishedBuy"),
    craft_raw_gil: total("craftRaw"),
    recommended_gil: total("recommended"),
    materials: [...materials.values()]
      .map(row => ({
        ...row,
        quantity: Math.round(row.quantity),
        total_gil: row.priced ? Math.round(row.total_gil) : null
      }))
      .sort((a, b) => String(a.item_name).localeCompare(String(b.item_name), "ja"))
  };
}

function price(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? `${Math.round(n).toLocaleString("ja-JP")}G` : "—";
}

export function marketLine(market) {
  if (!market) return "相場未取得";
  return `最安 ${price(market.min_nq)} / 出品平均 ${price(market.listing_average_nq)} / 売買平均 ${price(market.sale_average_nq)}`;
}

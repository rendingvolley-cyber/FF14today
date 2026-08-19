import { fetchMarketSnapshots, resolveItemIdByName } from "./procurement-market.js";

const WORLD = "Chocobo";
const RESOLVE_CONCURRENCY = 4;

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff"
    }
  });
}

async function mapLimit(values, limit, worker) {
  const results = new Array(values.length);
  let next = 0;
  const runners = Array.from({ length: Math.min(limit, Math.max(1, values.length)) }, async () => {
    while (next < values.length) {
      const index = next++;
      results[index] = await worker(values[index], index);
    }
  });
  await Promise.all(runners);
  return results;
}

function cloneForPath(request, pathname) {
  const url = new URL(request.url);
  url.pathname = pathname;
  url.search = "";
  const headers = new Headers();
  const token = request.headers.get("x-profile-token");
  if (token) headers.set("x-profile-token", token);
  return new Request(url.toString(), { method: "GET", headers });
}

export function aggregateProcurement(deliveries, selectedKeys) {
  const selected = new Set((selectedKeys || []).map(String));
  const rows = (deliveries || []).filter(row => selected.has(`${row.page_kind || ""}:${row.row_index}:${row.item_name || ""}`));
  const materials = new Map();
  let finishedBuyGil = 0;
  let craftRawGil = 0;
  let recommendedGil = 0;
  let finishedBuyKnown = 0;
  let craftRawKnown = 0;
  let recommendedKnown = 0;

  for (const row of rows) {
    const procurement = row?.procurement || {};
    const finished = Number(procurement?.market_buy?.gil);
    if (Number.isFinite(finished) && finished >= 0) { finishedBuyGil += finished; finishedBuyKnown += 1; }
    const raw = Number(procurement?.craft_raw?.gil);
    if (Number.isFinite(raw) && raw >= 0) { craftRawGil += raw; craftRawKnown += 1; }
    const recommended = Number(procurement?.recommended_route?.gil);
    if (Number.isFinite(recommended) && recommended >= 0) { recommendedGil += recommended; recommendedKnown += 1; }

    for (const material of procurement?.craft_raw?.materials || []) {
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
      const cost = Number(material?.total_gil);
      if (Number.isFinite(cost) && cost >= 0) current.total_gil += cost;
      else current.priced = false;
      materials.set(key, current);
    }
  }

  return {
    selected_count: rows.length,
    finished_buy_gil: finishedBuyKnown === rows.length && rows.length ? Math.round(finishedBuyGil) : null,
    craft_raw_gil: craftRawKnown === rows.length && rows.length ? Math.round(craftRawGil) : null,
    recommended_gil: recommendedKnown === rows.length && rows.length ? Math.round(recommendedGil) : null,
    materials: [...materials.values()]
      .map(row => {
        const quantity = Math.round(row.quantity);
        const totalGil = row.priced ? Math.round(row.total_gil) : null;
        return {
          ...row,
          quantity,
          total_gil: totalGil,
          unit_gil: totalGil == null || quantity <= 0 ? null : Math.round(totalGil / quantity)
        };
      })
      .sort((a, b) => String(a.item_name).localeCompare(String(b.item_name), "ja"))
  };
}

export async function grandCompanyProcurementSummaryResponse(request, env, app) {
  const costResponse = await app.fetch(cloneForPath(request, "/api/grand-company/delivery-costs"), env);
  if (!costResponse.ok || !(costResponse.headers.get("content-type") || "").includes("application/json")) return costResponse;
  let data;
  try { data = await costResponse.json(); }
  catch { return costResponse; }

  const deliveries = Array.isArray(data?.deliveries) ? data.deliveries : [];
  if (!deliveries.length) return json({ ...data, market_details: true, market_world: WORLD });

  const ids = await mapLimit(deliveries, RESOLVE_CONCURRENCY, async row => {
    try { return await resolveItemIdByName(row?.item_name); }
    catch { return null; }
  });

  let snapshots = {};
  const validIds = ids.filter(Boolean);
  if (validIds.length) {
    try { snapshots = await fetchMarketSnapshots(validIds, { world: WORLD }); }
    catch {}
  }

  const enriched = deliveries.map((row, index) => ({
    ...row,
    market: ids[index] ? snapshots[ids[index]] || { item_id: ids[index] } : null
  }));

  return json({
    ...data,
    world: data?.world || WORLD,
    market_world: WORLD,
    market_details: true,
    market_price_labels: {
      min_nq: "現在最安",
      listing_average_nq: "現在出品平均",
      sale_average_nq: "最近の売買平均"
    },
    deliveries: enriched
  }, costResponse.status);
}

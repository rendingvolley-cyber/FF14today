import app from "./combat-job-wrapper.js";
import { buildLeveCostAdvice } from "./leve-cost-advisor.js";
import { collectReachableItemIds, leveTarget } from "./leve-cost-data.js";

const WORLD = "Chocobo";

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

function currentItemMap(data) {
  if (data?.items && typeof data.items === "object") return data.items;
  if (data?.itemID) return { [String(data.itemID)]: data };
  return {};
}

function priceSnapshot(item) {
  const listings = Array.isArray(item?.listings) ? item.listings : [];
  let nq = Infinity;
  let hq = Infinity;
  for (const listing of listings) {
    const price = Number(listing?.pricePerUnit);
    if (!Number.isFinite(price) || price <= 0) continue;
    if (listing?.hq) hq = Math.min(hq, price);
    else nq = Math.min(nq, price);
  }
  return {
    nq: Number.isFinite(nq) ? Math.round(nq) : null,
    hq: Number.isFinite(hq) ? Math.round(hq) : null
  };
}

function newestUploadAgeMinutes(itemMap) {
  const times = Object.values(itemMap)
    .map(item => Number(item?.lastUploadTime || 0))
    .filter(value => Number.isFinite(value) && value > 0);
  if (!times.length) return null;
  const newest = Math.max(...times);
  return Math.max(0, Math.round((Date.now() - newest) / 60000));
}

async function fetchMarketPrices(itemIds) {
  const ids = [...new Set(itemIds.map(Number).filter(Number.isInteger))].slice(0, 100);
  if (!ids.length) return { prices: {}, ageMinutes: null };
  const response = await fetch(
    `https://universalis.app/api/v2/${encodeURIComponent(WORLD)}/${ids.join(",")}?listings=100`,
    { headers: { "user-agent": "FF14Today/1.8.1 leve-cost-advisor" } }
  );
  if (!response.ok) throw new Error(`Universalis HTTP ${response.status}`);
  const data = await response.json();
  const map = currentItemMap(data);
  const prices = {};
  for (const itemId of ids) prices[itemId] = priceSnapshot(map[String(itemId)] || map[itemId]);
  return { prices, ageMinutes: newestUploadAgeMinutes(map) };
}

function clampEnergy(value) {
  const n = Math.round(Number(value) || 3);
  return Math.max(1, Math.min(5, n));
}

function clampMinutes(value) {
  const n = Math.round(Number(value) || 60);
  return Math.max(5, Math.min(240, n));
}

async function handleCostAdvice(url) {
  const taskKey = String(url.searchParams.get("task_key") || "").trim();
  const target = leveTarget(taskKey);
  if (!target) return json({ error: "このリーヴはまだ調達比較の対象外です。" }, 404);
  const energy = clampEnergy(url.searchParams.get("energy"));
  const availableMinutes = clampMinutes(url.searchParams.get("available_minutes"));
  let market;
  try {
    market = await fetchMarketPrices(collectReachableItemIds(target));
  } catch (error) {
    return json({
      error: "Chocobo市場の比較データを取得できませんでした。",
      detail: error.message
    }, 502);
  }
  const advice = buildLeveCostAdvice(target, market.prices, {
    energy,
    availableMinutes,
    preferTraining: true
  });
  if (!advice) return json({ error: "レシピ比較を生成できませんでした。" }, 422);
  return json({
    ok: true,
    world: WORLD,
    source: "Universalis",
    market_age_minutes: market.ageMinutes,
    energy,
    available_minutes: availableMinutes,
    advice
  });
}

function rewriteHtml(response) {
  if (!response.ok || !(response.headers.get("content-type") || "").includes("text/html")) return response;
  return new HTMLRewriter()
    .on("head", {
      element(element) {
        element.append('<link rel="stylesheet" href="/leve-cost-advice.css"><script src="/leve-cost-advice.js" type="module"></script>', { html: true });
      }
    })
    .on(".version", {
      element(element) {
        element.setInnerContent("v1.8.1 · LEVE COST");
      }
    })
    .transform(response);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/api/leve/cost-advice" && request.method === "GET") {
      return handleCostAdvice(url);
    }

    const response = await app.fetch(request, env);
    if (url.pathname === "/api/health" && request.method === "GET" && response.ok) {
      let data;
      try { data = await response.clone().json(); }
      catch { return response; }
      return json({
        ...data,
        version: "1.8.1",
        leve_cost_advisor: true,
        leve_cost_market_world: WORLD,
        leve_cost_routes: ["buy_finished", "buy_direct", "mixed", "craft_raw"]
      }, response.status);
    }
    if (request.method === "GET" && (response.headers.get("content-type") || "").includes("text/html")) {
      return rewriteHtml(response);
    }
    return response;
  }
};

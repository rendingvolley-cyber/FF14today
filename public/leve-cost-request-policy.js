const LEVE_COST_PATH = "/api/leve/cost-advice";
export const LEVE_COST_TIMEOUT_MS = 12000;

const STATIC_TASK_BY_ITEM = new Map([
  ["ハイダリウム・スレイヤーアームガード", "craft:arm80:leve:armguards-maiming"],
  ["High Durium Armguards of Maiming", "craft:arm80:leve:armguards-maiming"],
  ["ハイダリウムナゲット", "craft:arm80:leve:high-durium-nugget"],
  ["High Durium Nugget", "craft:arm80:leve:high-durium-nugget"]
]);

const STATIC_TASK_KEYS = new Set(STATIC_TASK_BY_ITEM.values());

export function rewriteLeveCostUrl(rawUrl, baseUrl = "https://ff14-today.invalid/") {
  const url = new URL(String(rawUrl || ""), baseUrl);
  if (url.pathname !== LEVE_COST_PATH) return url.toString();

  const currentTaskKey = String(url.searchParams.get("task_key") || "");
  const itemName = String(url.searchParams.get("item_name") || "").trim();
  const staticTaskKey = STATIC_TASK_KEYS.has(currentTaskKey)
    ? currentTaskKey
    : STATIC_TASK_BY_ITEM.get(itemName) || "";

  if (!staticTaskKey) return url.toString();

  url.searchParams.set("task_key", staticTaskKey);
  url.searchParams.delete("dynamic");
  url.searchParams.delete("item_name");
  url.searchParams.delete("quantity");
  url.searchParams.delete("hq_required");
  return url.toString();
}

export function installLeveCostRequestPolicy(targetWindow = window) {
  if (!targetWindow?.fetch || targetWindow.__ff14TodayLeveCostPolicyInstalled) return;
  targetWindow.__ff14TodayLeveCostPolicyInstalled = true;
  const previousFetch = targetWindow.fetch.bind(targetWindow);

  targetWindow.fetch = async function leveCostPolicyFetch(input, init = {}) {
    const rawUrl = typeof input === "string" ? input : input?.url || "";
    let url;
    try { url = new URL(rawUrl, targetWindow.location?.href || "https://ff14-today.invalid/"); }
    catch { return previousFetch(input, init); }

    if (url.pathname !== LEVE_COST_PATH) return previousFetch(input, init);

    const rewritten = rewriteLeveCostUrl(url.toString(), targetWindow.location?.href || undefined);
    const nextInput = typeof input === "string" ? rewritten : new Request(rewritten, input);
    const existingSignal = init?.signal || (typeof input !== "string" ? input?.signal : null);
    if (existingSignal) return previousFetch(nextInput, init);

    const controller = new AbortController();
    const timer = targetWindow.setTimeout(() => controller.abort(), LEVE_COST_TIMEOUT_MS);
    try {
      return await previousFetch(nextInput, { ...init, signal: controller.signal });
    } catch (error) {
      if (controller.signal.aborted) throw new Error("価格・素材情報の取得がタイムアウトしました");
      throw error;
    } finally {
      targetWindow.clearTimeout(timer);
    }
  };
}

if (typeof window !== "undefined") installLeveCostRequestPolicy(window);

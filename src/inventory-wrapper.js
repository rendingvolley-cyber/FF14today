import app from "./retainer-first-wrapper.js";
import { sanitizeInventoryAnalysis } from "./inventory-context.js";
import {
  loadInventoryEvidence,
  profileHashFromRequest,
  resolveInventoryRows,
  storeInventoryRows
} from "./inventory-store.js";

const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash";
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

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

function inventorySchema() {
  return {
    type: "object",
    additionalProperties: false,
    properties: {
      recognized: { type: "boolean" },
      confidence: { type: "number", minimum: 0, maximum: 1 },
      items: {
        type: "array",
        maxItems: 60,
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            item_name: { type: "string" },
            quantity: { type: ["integer", "null"], minimum: 0 },
            hq_quantity: { type: ["integer", "null"], minimum: 0 },
            confidence: { type: "number", minimum: 0, maximum: 1 }
          },
          required: ["item_name", "quantity", "hq_quantity", "confidence"]
        }
      }
    },
    required: ["recognized", "confidence", "items"]
  };
}

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, Math.min(i + chunkSize, bytes.length)));
  }
  return btoa(binary);
}

async function analyzeInventoryImage(file, bytes, env) {
  if (!env.GEMINI_API_KEY) return null;
  const model = env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL;
  const prompt = [
    "FINAL FANTASY XIVのスクリーンショットが、プレイヤーの所持品または製作画面などで素材名と現在の所持数を確認できる画面か判定してください。",
    "該当しなければ recognized=false、items=[]。",
    "画面に文字として見えている事実だけ抽出してください。ゲーム知識、レシピ知識、外部データから品名や数量を補完しないでください。",
    "item_nameは画面に見える正式な表示名をそのまま記録してください。日本語表示なら日本語のままにしてください。",
    "quantityはその品の現在所持数として明確に読める数値だけを記録してください。必要数、製作数、販売数など別の数値と混同しないでください。",
    "HQ数量が明確に別表示されている場合だけhq_quantityに記録し、品質を判断できなければnullにしてください。",
    "アイコンだけで名前を推測しないでください。文字や数値が怪しい行はconfidenceを下げてください。"
  ].join("\n");

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-goog-api-key": env.GEMINI_API_KEY
      },
      body: JSON.stringify({
        contents: [{
          role: "user",
          parts: [
            { text: prompt },
            { inline_data: { mime_type: file.type, data: arrayBufferToBase64(bytes) } }
          ]
        }],
        generationConfig: {
          temperature: 0.05,
          responseMimeType: "application/json",
          responseJsonSchema: inventorySchema()
        }
      })
    }
  );
  if (!response.ok) return null;
  const data = await response.json();
  const text = (data?.candidates?.[0]?.content?.parts || [])
    .map(part => typeof part.text === "string" ? part.text : "")
    .join("")
    .trim();
  if (!text) return null;
  let parsed;
  try { parsed = JSON.parse(text); }
  catch { return null; }
  return sanitizeInventoryAnalysis(parsed, model);
}

async function fallbackInventoryImage(request, response, env) {
  if (!response.ok || !(response.headers.get("content-type") || "").includes("application/json")) return response;
  let data;
  try { data = await response.clone().json(); }
  catch { return response; }
  if (data?.analysis?.page_type !== "unknown") return response;

  const profileHash = await profileHashFromRequest(request);
  if (!profileHash) return response;
  let form;
  try { form = await request.formData(); }
  catch { return response; }
  const file = form.get("image");
  if (!(file instanceof File) || !ALLOWED_IMAGE_TYPES.has(file.type) || file.size <= 0 || file.size > MAX_IMAGE_BYTES) return response;

  const bytes = await file.arrayBuffer();
  const analysis = await analyzeInventoryImage(file, bytes, env);
  if (!analysis || analysis.page_type !== "inventory_items") return response;
  const resolvedRows = await resolveInventoryRows(analysis.inventory_items.items);
  const savedCount = await storeInventoryRows(env, profileHash, resolvedRows);
  return json({
    ...data,
    duplicate: false,
    analysis: {
      ...analysis,
      inventory_items: {
        ...analysis.inventory_items,
        relevant_items: resolvedRows
      }
    },
    inventory_context_saved: savedCount,
    image_saved: false
  }, response.status);
}

async function handleInventoryItems(request, env) {
  const profileHash = await profileHashFromRequest(request);
  if (!profileHash) return json({ error: "profile token required" }, 401);
  const evidence = await loadInventoryEvidence(env, profileHash);
  return json({
    ok: true,
    observed_at: evidence.observedAt,
    item_count: evidence.rows.length,
    items: evidence.rows
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/api/context/image" && request.method === "POST") {
      const response = await app.fetch(request.clone(), env);
      return fallbackInventoryImage(request, response, env);
    }
    if (url.pathname === "/api/inventory/items" && request.method === "GET") {
      return handleInventoryItems(request, env);
    }

    const response = await app.fetch(request, env);
    if (url.pathname === "/api/health" && request.method === "GET" && response.ok) {
      let data;
      try { data = await response.clone().json(); }
      catch { return response; }
      return json({
        ...data,
        leve_inventory_screenshot_evidence: true,
        leve_inventory_today_only_context: true
      }, response.status);
    }
    return response;
  }
};

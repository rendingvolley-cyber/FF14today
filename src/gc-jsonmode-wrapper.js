import app from "./gc-supply-duty-dictionary-recognition-wrapper.js";
import { chooseGrandCompanyDelivery, decorateGrandCompanyDelivery } from "./grand-company-deliveries.js";
import { canonicalizeGrandCompanyDeliveries } from "./gc-item-name-canonicalizer.js";
import { validateGrandCompanySupplyDutyDeliveries } from "./gc-supply-duty-band-validator.js";
import {
  gcAnalysisBudgetToken,
  mergeGcPagePayloads,
  nextGcPageKind,
  normalizeGcPageKind
} from "./gc-two-page.js";

const LODESTONE_ID = "3091607";
let schemaReady = null;

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

async function sha256Hex(value) {
  const bytes = typeof value === "string" ? new TextEncoder().encode(value) : value;
  const buffer = bytes instanceof ArrayBuffer
    ? bytes
    : bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, "0")).join("");
}

async function profileHash(request) {
  const token = request.headers.get("x-profile-token") || "";
  if (!/^[A-Za-z0-9_-]{43,128}$/.test(token)) return null;
  return sha256Hex(token);
}

function japanDateKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  const get = type => parts.find(part => part.type === type)?.value || "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

async function ensureSchema(env) {
  if (!schemaReady) {
    schemaReady = env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS grand_company_delivery_pages (
        profile_hash TEXT NOT NULL,
        delivery_date TEXT NOT NULL,
        page_kind TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        confidence REAL NOT NULL,
        observed_at TEXT NOT NULL,
        source TEXT NOT NULL DEFAULT 'clipboard_image',
        PRIMARY KEY (profile_hash, delivery_date, page_kind)
      )
    `).run().catch(error => {
      schemaReady = null;
      throw error;
    });
  }
  return schemaReady;
}

async function readPages(env, hash) {
  await ensureSchema(env);
  const result = await env.DB.prepare(`
    SELECT page_kind, payload_json, confidence, observed_at
    FROM grand_company_delivery_pages
    WHERE profile_hash=? AND delivery_date=?
    ORDER BY CASE page_kind WHEN 'crafting' THEN 0 ELSE 1 END
  `).bind(hash, japanDateKey()).all();
  const pages = { crafting: null, gathering: null };
  for (const row of result?.results || []) {
    const kind = normalizeGcPageKind(row?.page_kind);
    if (!kind) continue;
    try {
      const payload = JSON.parse(row.payload_json);
      pages[kind] = {
        ...payload,
        page_kind: kind,
        observed_at: payload?.observed_at || row.observed_at,
        confidence: Number(payload?.confidence ?? row.confidence ?? 0)
      };
    } catch {}
  }
  return pages;
}

async function loadCurrentJobs(request, env) {
  try {
    const stateUrl = new URL("/api/state", request.url);
    stateUrl.searchParams.set("lodestone_id", LODESTONE_ID);
    stateUrl.searchParams.set("planner_mode", "efficient");
    const headers = new Headers();
    const token = request.headers.get("x-profile-token");
    if (token) headers.set("x-profile-token", token);
    const response = await app.fetch(new Request(stateUrl, { method: "GET", headers }), env);
    if (!response.ok || !(response.headers.get("content-type") || "").includes("application/json")) return [];
    const data = await response.json();
    return Array.isArray(data?.character?.jobs) ? data.character.jobs : [];
  } catch {
    return [];
  }
}

async function canonicalizePages(pages, jobs) {
  const next = { crafting: pages?.crafting || null, gathering: pages?.gathering || null };
  for (const kind of ["crafting", "gathering"]) {
    const page = pages?.[kind];
    if (!page) continue;
    const canonical = await canonicalizeGrandCompanyDeliveries(page.deliveries);
    next[kind] = {
      ...page,
      deliveries: await validateGrandCompanySupplyDutyDeliveries(canonical, {
        jobs,
        pageKind: kind
      })
    };
  }
  return next;
}

function statusFromPages(pages) {
  return {
    crafting: Boolean(pages?.crafting?.deliveries?.length),
    gathering: Boolean(pages?.gathering?.deliveries?.length)
  };
}

async function explicitPageKind(request) {
  const contentType = request.headers.get("content-type") || "";
  if (!contentType.includes("multipart/form-data")) return null;
  try {
    const form = await request.clone().formData();
    if (String(form.get("workflow_context") || "").trim() !== "grand-company") return null;
    return normalizeGcPageKind(form.get("gc_page_kind"));
  } catch {
    return null;
  }
}

async function pageKindForUpload(request, env, hash) {
  const explicit = await explicitPageKind(request);
  const pages = await readPages(env, hash);
  return nextGcPageKind(statusFromPages(pages), explicit);
}

function requestWithGcBudgetToken(request, kind) {
  const token = gcAnalysisBudgetToken(request.headers.get("x-profile-token"), kind);
  if (!token) return request;
  const headers = new Headers(request.headers);
  headers.set("x-profile-token", token);
  return new Request(request, { headers });
}

async function storePage(env, hash, kind, payload, confidence) {
  await ensureSchema(env);
  const observedAt = new Date().toISOString();
  const value = {
    ...payload,
    page_kind: kind,
    observed_at: payload?.observed_at || observedAt,
    confidence: Number(payload?.confidence ?? confidence ?? 0)
  };
  await env.DB.prepare(`
    INSERT INTO grand_company_delivery_pages (
      profile_hash, delivery_date, page_kind, payload_json, confidence, observed_at, source
    ) VALUES (?, ?, ?, ?, ?, ?, 'clipboard_image')
    ON CONFLICT(profile_hash, delivery_date, page_kind) DO UPDATE SET
      payload_json=excluded.payload_json,
      confidence=excluded.confidence,
      observed_at=excluded.observed_at,
      source=excluded.source
  `).bind(
    hash,
    japanDateKey(),
    kind,
    JSON.stringify(value),
    Number(value.confidence || 0),
    value.observed_at
  ).run();
  return value;
}

function deliveryResponse(pages) {
  const merged = mergeGcPagePayloads(pages);
  const decorated = merged.deliveries.map(decorateGrandCompanyDelivery);
  const crafting = decorated.filter(row => row.page_kind === "crafting");
  const gathering = decorated.filter(row => row.page_kind === "gathering");
  const pageStatus = {
    crafting: crafting.length > 0,
    gathering: gathering.length > 0
  };
  const missingPages = [
    ...(pageStatus.crafting ? [] : ["crafting"]),
    ...(pageStatus.gathering ? [] : ["gathering"])
  ];
  const observed = [pages?.crafting?.observed_at, pages?.gathering?.observed_at].filter(Boolean).sort().at(-1) || null;
  const company = pages?.crafting?.company_name || pages?.gathering?.company_name || null;
  const verified = decorated.filter(row => row.gc_supply_level_verified === true);
  const unverifiedCount = decorated.length - verified.length;
  return {
    ok: true,
    setup_required: decorated.length === 0,
    company_name: company,
    observed_at: observed,
    page_status: pageStatus,
    missing_pages: missingPages,
    gc_supply_level_validation: true,
    gc_supply_level_unverified_count: unverifiedCount,
    pages: {
      crafting: pages?.crafting ? { page_kind: "crafting", observed_at: pages.crafting.observed_at, count: crafting.length } : null,
      gathering: pages?.gathering ? { page_kind: "gathering", observed_at: pages.gathering.observed_at, count: gathering.length } : null
    },
    crafting_deliveries: crafting,
    gathering_deliveries: gathering,
    deliveries: decorated,
    recommended: chooseGrandCompanyDelivery(verified),
    message: unverifiedCount
      ? `${unverifiedCount}件は現在のジョブLvに対応するFF14調達品データと一致しないため、品名を確定表示していません。`
      : missingPages.length
        ? `未登録のページがあります：${missingPages.includes("crafting") ? "製作" : ""}${missingPages.length === 2 ? "・" : ""}${missingPages.includes("gathering") ? "採集" : ""}`
        : "製作ページと採集ページを登録済みです。表示品名は現在のジョブLvのFF14調達品データと照合済みです。"
  };
}

async function handleGetDeliveries(request, env) {
  const hash = await profileHash(request);
  if (!hash) return app.fetch(request, env);
  const [pages, jobs] = await Promise.all([
    readPages(env, hash),
    loadCurrentJobs(request, env)
  ]);
  const canonicalPages = await canonicalizePages(pages, jobs);
  return json(deliveryResponse(canonicalPages));
}

async function handleGcImage(request, env) {
  const hash = await profileHash(request);
  if (!hash) return app.fetch(request, env);
  const kind = await pageKindForUpload(request, env, hash);
  const response = await app.fetch(requestWithGcBudgetToken(request, kind), env);
  if (!response.ok) return response;
  let data;
  try { data = await response.clone().json(); }
  catch { return response; }
  const payload = data?.analysis?.grand_company_deliveries;
  if (data?.analysis?.page_type !== "grand_company_deliveries" || !payload?.deliveries?.length) return response;

  const stored = await storePage(env, hash, kind, payload, data.analysis.confidence);
  const pages = await readPages(env, hash);
  const pageStatus = statusFromPages(pages);
  return json({
    ...data,
    analysis: {
      ...data.analysis,
      grand_company_deliveries: stored
    },
    grand_company_page_kind: kind,
    grand_company_page_status: pageStatus,
    grand_company_pages_complete: pageStatus.crafting && pageStatus.gathering
  }, response.status);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/api/grand-company/deliveries" && request.method === "GET") {
      return handleGetDeliveries(request, env);
    }
    if (url.pathname === "/api/context/image" && request.method === "POST") {
      return handleGcImage(request, env);
    }
    const response = await app.fetch(request, env);
    if (url.pathname === "/api/health" && request.method === "GET" && response.ok) {
      let data;
      try { data = await response.clone().json(); }
      catch { return response; }
      return json({
        ...data,
        gc_two_page_delivery_context: true,
        gc_item_name_canonicalization: true,
        gc_supply_level_validation: true,
        gc_supply_level_source: "XIVAPI GCSupplyDuty"
      }, response.status);
    }
    return response;
  }
};

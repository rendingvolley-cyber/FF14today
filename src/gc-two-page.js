export const GC_PAGE_KINDS = Object.freeze(["crafting", "gathering"]);

export function normalizeGcPageKind(value) {
  const kind = String(value || "").trim().toLowerCase();
  return GC_PAGE_KINDS.includes(kind) ? kind : null;
}

export function gcAnalysisBudgetToken(token, kind) {
  const base = String(token || "").trim();
  const pageKind = normalizeGcPageKind(kind);
  if (!/^[A-Za-z0-9_-]{43,128}$/.test(base) || !pageKind) return null;
  const suffix = pageKind === "crafting" ? "_gc_crafting" : "_gc_gathering";
  return `${base.slice(0, 128 - suffix.length)}${suffix}`;
}

export function nextGcPageKind(status = {}, explicit = null) {
  const requested = normalizeGcPageKind(explicit);
  if (requested) return requested;
  if (!status?.crafting) return "crafting";
  if (!status?.gathering) return "gathering";
  return "crafting";
}

export function mergeGcPagePayloads(pages = {}) {
  const crafting = Array.isArray(pages?.crafting?.deliveries) ? pages.crafting.deliveries : [];
  const gathering = Array.isArray(pages?.gathering?.deliveries) ? pages.gathering.deliveries : [];
  let rowIndex = 0;
  const tag = (row, pageKind, pageRowIndex) => ({
    ...row,
    page_kind: pageKind,
    page_row_index: Number.isInteger(Number(row?.row_index)) ? Number(row.row_index) : pageRowIndex,
    row_index: rowIndex++
  });
  const craftingRows = crafting.map((row, index) => tag(row, "crafting", index));
  const gatheringRows = gathering.map((row, index) => tag(row, "gathering", index));
  return {
    crafting: craftingRows,
    gathering: gatheringRows,
    deliveries: [...craftingRows, ...gatheringRows],
    page_status: {
      crafting: craftingRows.length > 0,
      gathering: gatheringRows.length > 0
    },
    missing_pages: [
      ...(craftingRows.length ? [] : ["crafting"]),
      ...(gatheringRows.length ? [] : ["gathering"])
    ]
  };
}

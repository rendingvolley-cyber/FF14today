function number(value) {
  if (value == null || String(value).trim() === "") return null;
  const n = Number(String(value).replace(/,/g, ""));
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function knownPrice(value) {
  return value != null && Number.isFinite(Number(value)) && Number(value) >= 0;
}

export function parseMaterialSummary(text) {
  const source = String(text || "").replace(/^.*?(?:必要素材(?: 合算)?|製作素材)\s*[:：]\s*/, "").trim();
  if (!source || /追加購入素材なし|購入素材なし|リーヴを選ぶ|製作納品を選ぶ/.test(source)) return [];
  return source
    .split(/\s*\/\s*/)
    .map(part => {
      const match = part.trim().match(/^(.+?)\s*[×x]\s*([\d,]+)(?:\s*（約([\d,]+)G）)?$/);
      if (!match) return null;
      const quantity = number(match[2]);
      const totalGil = number(match[3]);
      if (!match[1].trim() || !quantity) return null;
      return {
        item_name: match[1].trim(),
        quantity,
        total_gil: totalGil,
        estimated_unit_gil: totalGil == null ? null : Math.round(totalGil / quantity)
      };
    })
    .filter(Boolean);
}

export function shoppingListText(rows, { title = "マケボ購入リスト" } = {}) {
  const items = Array.isArray(rows) ? rows.filter(row => row?.item_name && Number(row?.quantity) > 0) : [];
  if (!items.length) return `${title}\n追加購入素材なし`;
  const lines = items.map(row => {
    const qty = Math.round(Number(row.quantity));
    const cost = knownPrice(row.total_gil) ? ` / 概算 ${Math.round(Number(row.total_gil)).toLocaleString("ja-JP")}G` : "";
    return `${row.item_name} ×${qty}${cost}`;
  });
  const total = items.every(row => knownPrice(row.total_gil))
    ? items.reduce((sum, row) => sum + Number(row.total_gil), 0)
    : null;
  if (total != null) lines.push(`合計概算 ${Math.round(total).toLocaleString("ja-JP")}G`);
  return `${title}\n${lines.join("\n")}`;
}

import { parseMaterialSummary, shoppingListText } from "./procurement-shopping-list-core.js";

function knownPrice(value) {
  return value != null && Number.isFinite(Number(value)) && Number(value) >= 0;
}

function gil(value) {
  return knownPrice(value) ? `${Math.round(Number(value)).toLocaleString("ja-JP")}G` : "—";
}

function hashText(value) {
  let hash = 2166136261;
  for (const char of String(value || "")) { hash ^= char.codePointAt(0); hash = Math.imul(hash, 16777619); }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function ensureStyles() {
  if (document.getElementById("procurementShoppingListStyles")) return;
  const style = document.createElement("style");
  style.id = "procurementShoppingListStyles";
  style.textContent = `
    .procurement-shopping{margin-top:9px;border:1px solid #dce7f2;border-radius:10px;background:#fff;padding:9px}
    .procurement-shopping-head{display:flex;justify-content:space-between;gap:8px;align-items:center;margin-bottom:7px}
    .procurement-shopping-head strong{font-size:.78rem;color:#355a7b}.procurement-shopping-head button{border:1px solid #cddbea;background:#f7fbff;color:#2b66a3;border-radius:8px;padding:5px 8px;font-size:.7rem;font-weight:800;cursor:pointer}
    .procurement-shopping-row{display:grid;grid-template-columns:minmax(0,1fr) auto auto auto;gap:8px;align-items:center;padding:6px 0;border-top:1px solid #edf2f7;font-size:.72rem}
    .procurement-shopping-row:first-of-type{border-top:0}.procurement-shopping-name{font-weight:800;color:#405b75}.procurement-shopping-qty{font-weight:900;color:#123f69}.procurement-shopping-unit,.procurement-shopping-sub{color:#6b8094;white-space:nowrap}.procurement-shopping-total{margin-top:7px;padding-top:7px;border-top:1px solid #e7edf4;text-align:right;font-size:.74rem;font-weight:900;color:#234e75}
    .procurement-shopping-empty{font-size:.72rem;color:#70869b}.procurement-shopping-note{margin-top:5px;font-size:.66rem;color:#8999aa}
    @media(max-width:620px){.procurement-shopping-row{grid-template-columns:minmax(0,1fr) auto}.procurement-shopping-unit,.procurement-shopping-sub{grid-column:1 / -1;text-align:right}}
  `;
  document.head.append(style);
}

function sourceBlocks() {
  return [
    ...document.querySelectorAll(".craft-procurement-combined-materials"),
    ...document.querySelectorAll(".gc-procurement-materials")
  ];
}

function titleFor(block) {
  return block.classList.contains("gc-procurement-materials") ? "双蛇党｜マケボ購入リスト" : "生産｜マケボ購入リスト";
}

function render(block) {
  const rows = parseMaterialSummary(block.textContent || "");
  let panel = block.nextElementSibling?.matches?.("[data-procurement-shopping]") ? block.nextElementSibling : null;
  if (!panel) {
    panel = document.createElement("section");
    panel.className = "procurement-shopping";
    panel.setAttribute("data-procurement-shopping", "");
    block.insertAdjacentElement("afterend", panel);
  }

  const signature = hashText(JSON.stringify(rows));
  if (panel.dataset.shoppingHash === signature) return;
  panel.dataset.shoppingHash = signature;

  if (!rows.length) {
    panel.innerHTML = `<div class="procurement-shopping-empty">素材を選ぶと、ここにマケボで買う数量をまとめます。</div>`;
    return;
  }

  const title = titleFor(block);
  const totalKnown = rows.every(row => knownPrice(row.total_gil));
  const total = totalKnown ? rows.reduce((sum, row) => sum + Number(row.total_gil), 0) : null;
  const rowHtml = rows.map(row => `
    <div class="procurement-shopping-row">
      <span class="procurement-shopping-name">${row.item_name}</span>
      <span class="procurement-shopping-qty">×${Math.round(row.quantity)}</span>
      <span class="procurement-shopping-unit">目安単価 ${gil(row.estimated_unit_gil)}</span>
      <span class="procurement-shopping-sub">小計 ${gil(row.total_gil)}</span>
    </div>
  `).join("");
  panel.innerHTML = `
    <div class="procurement-shopping-head"><strong>${title}</strong><button type="button" data-copy-procurement-shopping>買い物リストをコピー</button></div>
    ${rowHtml}
    <div class="procurement-shopping-total">素材合計 ${total == null ? "価格一部未取得" : `約${gil(total)}`}</div>
    <div class="procurement-shopping-note">数量は選択したタスク分を合算。価格はChocoboの取得済み相場からの概算です。</div>
  `;
  panel.querySelector("[data-copy-procurement-shopping]")?.addEventListener("click", async event => {
    const button = event.currentTarget;
    const text = shoppingListText(rows, { title });
    try {
      await navigator.clipboard.writeText(text);
      button.textContent = "コピーしました";
      setTimeout(() => { if (button.isConnected) button.textContent = "買い物リストをコピー"; }, 1400);
    } catch {
      button.textContent = "コピーできませんでした";
      setTimeout(() => { if (button.isConnected) button.textContent = "買い物リストをコピー"; }, 1800);
    }
  });
}

function reconcile() {
  ensureStyles();
  for (const block of sourceBlocks()) render(block);
}

function boot() {
  ensureStyles();
  let queued = false;
  const observer = new MutationObserver(() => {
    if (queued) return;
    queued = true;
    setTimeout(() => { queued = false; reconcile(); }, 0);
  });
  observer.observe(document.body, { childList: true, subtree: true, characterData: true });
  for (const delay of [400, 1000, 2200]) setTimeout(reconcile, delay);
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
else boot();

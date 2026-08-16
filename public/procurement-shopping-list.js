import { parseMaterialSummary, shoppingListText } from "./procurement-shopping-list-core.js";

function knownPrice(value) {
  return value != null && Number.isFinite(Number(value)) && Number(value) >= 0;
}

function gil(value) {
  return knownPrice(value) ? `${Math.round(Number(value)).toLocaleString("ja-JP")}G` : "—";
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
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
    .procurement-shopping{margin-top:9px;border:1px solid #dce7f2;border-radius:12px;background:#fff;padding:10px}
    .procurement-shopping-head{display:flex;justify-content:space-between;gap:8px;align-items:center;margin-bottom:8px}
    .procurement-shopping-head strong{font-size:.8rem;color:#355a7b}.procurement-shopping-head button{border:1px solid #cddbea;background:#f7fbff;color:#2b66a3;border-radius:8px;padding:5px 8px;font-size:.7rem;font-weight:800;cursor:pointer}
    .procurement-shopping-table{width:100%;border-collapse:collapse;table-layout:fixed;font-size:.72rem;color:#536c86}
    .procurement-shopping-table th{padding:6px 7px;background:#f4f8fc;color:#5f7891;text-align:right;font-size:.66rem;font-weight:850;border-bottom:1px solid #dfe8f1;white-space:nowrap}
    .procurement-shopping-table th:first-child{text-align:left;width:43%}.procurement-shopping-table th:nth-child(2){width:14%}.procurement-shopping-table th:nth-child(3){width:22%}.procurement-shopping-table th:nth-child(4){width:21%}
    .procurement-shopping-table td{padding:7px;border-bottom:1px solid #edf2f7;text-align:right;vertical-align:middle}.procurement-shopping-table tbody tr:last-child td{border-bottom:0}
    .procurement-shopping-table td:first-child{text-align:left;font-weight:800;color:#405b75;overflow-wrap:anywhere}.procurement-shopping-qty{font-weight:900;color:#123f69}.procurement-shopping-unit,.procurement-shopping-sub{white-space:nowrap}
    .procurement-shopping-total{margin-top:8px;padding-top:8px;border-top:1px solid #e7edf4;text-align:right;font-size:.76rem;font-weight:900;color:#234e75}
    .procurement-shopping-empty{font-size:.72rem;color:#70869b}.procurement-shopping-note{margin-top:5px;font-size:.66rem;color:#8999aa;line-height:1.5}
    @media(max-width:620px){.procurement-shopping{padding:8px}.procurement-shopping-table{font-size:.67rem}.procurement-shopping-table th,.procurement-shopping-table td{padding:6px 4px}.procurement-shopping-table th{font-size:.6rem}.procurement-shopping-head{align-items:flex-start}.procurement-shopping-head button{font-size:.65rem;padding:5px 6px}}
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

function selectedCraftMarketAge() {
  const ages = [...document.querySelectorAll("#taskBoardGrid .task-select-card")]
    .filter(card => card.querySelector('input[type="checkbox"]')?.checked)
    .map(card => card.querySelector(".craft-procurement-age")?.textContent?.match(/相場\s*(\d+)\s*分前/)?.[1])
    .map(Number)
    .filter(Number.isFinite);
  return ages.length ? Math.max(...ages) : null;
}

function marketAgeFor(block) {
  const direct = Number(block.dataset.marketAgeMinutes);
  if (Number.isFinite(direct) && direct >= 0) return Math.round(direct);
  if (block.classList.contains("craft-procurement-combined-materials")) return selectedCraftMarketAge();
  return null;
}

function render(block) {
  const rows = parseMaterialSummary(block.textContent || "");
  const ageMinutes = marketAgeFor(block);
  let panel = block.nextElementSibling?.matches?.("[data-procurement-shopping]") ? block.nextElementSibling : null;
  if (!panel) {
    panel = document.createElement("section");
    panel.className = "procurement-shopping";
    panel.setAttribute("data-procurement-shopping", "");
    block.insertAdjacentElement("afterend", panel);
  }

  const signature = hashText(JSON.stringify({ rows, ageMinutes }));
  if (panel.dataset.shoppingHash === signature) return;
  panel.dataset.shoppingHash = signature;
  block.hidden = true;

  if (!rows.length) {
    panel.innerHTML = `<div class="procurement-shopping-empty">素材を選ぶと、ここにマケボで買う数量と相場目安をまとめます。</div>`;
    return;
  }

  const title = titleFor(block);
  const totalKnown = rows.every(row => knownPrice(row.total_gil));
  const total = totalKnown ? rows.reduce((sum, row) => sum + Number(row.total_gil), 0) : null;
  const rowHtml = rows.map(row => `
    <tr>
      <td>${escapeHtml(row.item_name)}</td>
      <td class="procurement-shopping-qty">×${Math.round(row.quantity)}</td>
      <td class="procurement-shopping-unit">${gil(row.estimated_unit_gil)}</td>
      <td class="procurement-shopping-sub">${gil(row.total_gil)}</td>
    </tr>
  `).join("");
  const ageText = ageMinutes == null
    ? "価格更新時刻は取得できた相場データのみ反映します。"
    : `価格データは最も古いもので約${ageMinutes}分前です。`;
  panel.innerHTML = `
    <div class="procurement-shopping-head"><strong>${title}</strong><button type="button" data-copy-procurement-shopping>買い物リストをコピー</button></div>
    <table class="procurement-shopping-table">
      <thead><tr><th>素材</th><th>必要数</th><th>相場目安/個</th><th>小計</th></tr></thead>
      <tbody>${rowHtml}</tbody>
    </table>
    <div class="procurement-shopping-total">素材合計 ${total == null ? "価格一部未取得" : `約${gil(total)}`}</div>
    <div class="procurement-shopping-note">Chocoboの取得済み相場から概算。${ageText} 同じ素材は選択したタスクをまたいで合算しています。</div>
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

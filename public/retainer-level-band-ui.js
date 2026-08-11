(() => {
  const EXPECTED = "リテイナー一覧（名前・ジョブ/クラス・Lvが見える画面）";

  function patchCopy() {
    const root = document.getElementById("retainerAdvice");
    if (!root) return;
    const subtitle = root.querySelector(".retainer-advice-sub");
    if (subtitle) subtitle.textContent = "リテイナー一覧のジョブ/クラスとLvから派遣可能品を絞り、Chocobo市場で売れ筋を比較します。";

    const setup = root.querySelector(".retainer-setup");
    if (!setup) return;
    const text = setup.textContent || "";
    if (/調達依頼一覧|アイテム候補が複数行|1人を開/.test(text)) {
      setup.innerHTML = `<strong>最初の1回だけ：</strong>${EXPECTED}を1枚Ctrl+Vしてください。<br>各リテイナーのLv帯から派遣可能品を自動で絞るので、調達依頼の候補ページを何枚も貼る必要はありません。`;
    }
  }

  function showOverviewSaved(analysis) {
    const rows = analysis?.retainer_overview?.retainers || [];
    if (!rows.length) return;
    const labels = rows.slice(0, 4).map(row => [row.retainer_name, row.job_name, row.level != null ? `Lv${row.level}` : null].filter(Boolean).join(" · ")).filter(Boolean);
    const status = document.getElementById("contextInboxStatus");
    if (status) {
      status.textContent = `リテイナー${rows.length}人のジョブ/クラスとLvを保存しました${labels.length ? `（${labels.join(" / ")}${rows.length > labels.length ? " / …" : ""}）` : ""}。Lv帯から派遣候補を作って市場比較します。`;
      status.dataset.kind = "success";
    }
    const tab = document.querySelector("[data-retainer-open]");
    tab?.click();
    const refresh = document.querySelector("[data-retainer-refresh]");
    if (refresh && !refresh.disabled) refresh.click();
    setTimeout(patchCopy, 100);
    setTimeout(patchCopy, 800);
  }

  window.addEventListener("ff14today:context-saved", event => {
    if (event.detail?.pageType === "retainer_overview") showOverviewSaved(event.detail.analysis);
  });

  document.addEventListener("click", event => {
    if (event.target.closest("[data-retainer-open],[data-retainer-refresh]")) {
      setTimeout(patchCopy, 50);
      setTimeout(patchCopy, 800);
    }
  });

  function boot() {
    patchCopy();
    setTimeout(patchCopy, 300);
    setTimeout(patchCopy, 1200);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
  else boot();
})();

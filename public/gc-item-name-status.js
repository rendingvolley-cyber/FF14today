(() => {
  const statusByName = new Map();
  let applyQueued = false;

  function ensureStyles() {
    if (document.getElementById("gcItemNameStatusStyles")) return;
    const style = document.createElement("style");
    style.id = "gcItemNameStatusStyles";
    style.textContent = `
      .gc-item-name-status{display:inline-flex;align-items:center;border-radius:999px;padding:2px 5px;font-size:8px;font-weight:900;white-space:nowrap}
      .gc-item-name-status.corrected{background:#eaf6ef;color:#2e7251}
      .gc-item-name-status.unverified{background:#fff3df;color:#8a6122}
    `;
    document.head.append(style);
  }

  function queueApply() {
    if (applyQueued) return;
    applyQueued = true;
    requestAnimationFrame(() => {
      applyQueued = false;
      applyStatuses();
    });
  }

  function rememberRows(rows, { replace = false } = {}) {
    if (replace) statusByName.clear();
    for (const row of Array.isArray(rows) ? rows : []) {
      const name = String(row?.item_name || "").trim();
      if (!name) continue;
      statusByName.set(name, {
        verified: row?.item_name_verified,
        resolution: String(row?.item_name_resolution || ""),
        raw: String(row?.item_name_raw || "").trim()
      });
    }
    queueApply();
  }

  function applyStatuses() {
    ensureStyles();
    for (const strong of document.querySelectorAll("[data-gc-delivery-item]")) {
      const name = String(strong.textContent || "").trim();
      const host = strong.parentElement;
      if (!host) continue;
      host.querySelectorAll("[data-gc-item-name-status]").forEach(node => node.remove());
      const status = statusByName.get(name);
      if (!status) continue;

      let text = "";
      let kind = "";
      let title = "";
      if (status.raw && status.raw !== name) {
        text = "名称補正";
        kind = "corrected";
        title = `画像読取「${status.raw}」をFF14の確認済み名称「${name}」へ補正しました。`;
      } else if (status.verified === false) {
        text = "名称未確認";
        kind = "unverified";
        title = "FF14 Itemデータとの完全一致をまだ確認できていません。画像の読み取り名をそのまま表示しています。";
      }
      if (!text) continue;

      const badge = document.createElement("span");
      badge.className = `gc-item-name-status ${kind}`;
      badge.setAttribute("data-gc-item-name-status", "");
      badge.textContent = text;
      badge.title = title;
      host.append(badge);
    }
  }

  const previousFetch = window.fetch.bind(window);
  window.fetch = async (...args) => {
    const response = await previousFetch(...args);
    try {
      const input = args[0];
      const rawUrl = typeof input === "string" ? input : input?.url || "";
      const url = new URL(rawUrl, location.href);
      if (response.ok && (url.pathname === "/api/grand-company/deliveries" || url.pathname === "/api/grand-company/delivery-costs")) {
        const data = await response.clone().json();
        rememberRows(data?.deliveries, { replace: url.pathname === "/api/grand-company/deliveries" });
      }
    } catch {}
    return response;
  };

  const observer = new MutationObserver(queueApply);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", queueApply, { once: true });
  else queueApply();
})();

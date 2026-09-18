(() => {
  "use strict";

  const STORAGE_KEY = "ff14-today.mahjong-hanchan.v1";
  const rankPoints = [20, 10, -10, -20];

  const form = document.getElementById("scoreForm");
  const scoreInputs = [2, 3, 4].map(rank => document.getElementById("score" + rank));
  const score1 = document.getElementById("score1");
  const resultBody = document.getElementById("resultBody");
  const resultTotal = document.getElementById("resultTotal");
  const message = document.getElementById("message");
  const saveButton = document.getElementById("saveButton");
  const clearButton = document.getElementById("clearButton");
  const statsGrid = document.getElementById("statsGrid");
  const historyList = document.getElementById("historyList");
  const clearHistoryButton = document.getElementById("clearHistoryButton");

  let currentRows = null;
  let storageAvailable = true;

  const pointText = value => Math.round(value).toLocaleString("ja-JP") + "点";
  const resultText = value => (value > 0 ? "+" : "") + Number(value).toFixed(1);
  const escapeHtml = value => {
    const el = document.createElement("div");
    el.textContent = String(value ?? "");
    return el.innerHTML;
  };

  function safeId() {
    if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
    return String(Date.now()) + "-" + Math.random().toString(36).slice(2);
  }

  function loadHistory() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      storageAvailable = false;
      return [];
    }
  }

  function writeHistory(records) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
      storageAvailable = true;
      return true;
    } catch {
      storageAvailable = false;
      message.textContent = "このブラウザでは履歴を保存できません。";
      return false;
    }
  }

  function readScores() {
    const values = scoreInputs.map(input => input.value.trim());
    if (values.some(value => value === "")) return null;
    const lower = values.map(Number);
    if (lower.some(value => !Number.isFinite(value))) return null;
    return [100000 - lower[0] - lower[1] - lower[2], ...lower];
  }

  function buildRows(scores) {
    const names = [1, 2, 3, 4].map(rank => {
      const value = document.getElementById("name" + rank).value.trim();
      return value || (rank + "位");
    });

    return scores.map((points, index) => {
      const base = (points - 30000) / 1000;
      const rankPoint = rankPoints[index];
      const oka = index === 0 ? 20 : 0;
      return {
        rank: index + 1,
        name: names[index],
        points,
        base,
        rankPoint,
        oka,
        final: base + rankPoint + oka
      };
    });
  }

  function renderResult(rows) {
    resultBody.innerHTML = rows.map(row =>
      "<tr>" +
      "<td><strong>" + row.rank + "位</strong></td>" +
      "<td>" + escapeHtml(row.name) + "</td>" +
      '<td class="num">' + pointText(row.points) + "</td>" +
      '<td class="num">' + resultText(row.base) + "</td>" +
      '<td class="num">' + resultText(row.rankPoint) + "</td>" +
      '<td class="num">' + resultText(row.oka) + "</td>" +
      '<td class="num final">' + resultText(row.final) + "</td>" +
      "</tr>"
    ).join("");

    resultTotal.textContent = resultText(rows.reduce((sum, row) => sum + row.final, 0));
  }

  function calculate() {
    const scores = readScores();
    currentRows = null;
    saveButton.disabled = true;

    if (!scores) {
      score1.textContent = "—";
      message.textContent = "2位・3位・4位を入力してください。";
      resultBody.innerHTML = '<tr><td colspan="7" class="muted">点数を入力するとここに結果が出ます。</td></tr>';
      resultTotal.textContent = "0.0";
      return null;
    }

    score1.textContent = pointText(scores[0]);
    const rankOrderOk = scores[0] >= scores[1] && scores[1] >= scores[2] && scores[2] >= scores[3];

    if (scores.some(score => score < 0)) {
      message.textContent = "入力された点数を確認してください。持ち点がマイナスになっています。";
    } else if (!rankOrderOk) {
      message.textContent = "注意：点数と順位の並びが一致していません。保存する前に確認してください。";
    } else {
      message.textContent = "1位は " + pointText(scores[0]) + " です。保存すると半荘履歴に追加されます。";
    }

    const rows = buildRows(scores);
    renderResult(rows);

    if (scores.every(score => score >= 0) && rankOrderOk) {
      currentRows = rows;
      saveButton.disabled = !storageAvailable;
    }
    return rows;
  }

  function formatSavedAt(value) {
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return "日時不明";
    return new Intl.DateTimeFormat("ja-JP", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit"
    }).format(date);
  }

  function renderStats(records) {
    const stats = new Map();

    for (const record of records) {
      for (const player of record.players || []) {
        const name = String(player.name || "").trim() || "名前なし";
        if (!stats.has(name)) {
          stats.set(name, { name, games: 0, rankSum: 0, firsts: 0, total: 0 });
        }
        const row = stats.get(name);
        row.games += 1;
        row.rankSum += Number(player.rank) || 0;
        if (Number(player.rank) === 1) row.firsts += 1;
        row.total += Number(player.final) || 0;
      }
    }

    const rows = [...stats.values()].sort((a, b) =>
      b.games - a.games || b.total - a.total || a.name.localeCompare(b.name, "ja")
    );

    if (!rows.length) {
      statsGrid.innerHTML = '<p class="empty-history">まだ保存データがありません。</p>';
      return;
    }

    statsGrid.innerHTML = rows.map(row => {
      const avg = row.games ? row.rankSum / row.games : 0;
      return '<article class="stat-card">' +
        "<strong>" + escapeHtml(row.name) + "</strong>" +
        "<span>半荘 " + row.games + "回</span>" +
        "<span>平均順位 " + avg.toFixed(2) + "位</span>" +
        "<span>トップ " + row.firsts + "回</span>" +
        "<span>累計 " + resultText(row.total) + "</span>" +
        "</article>";
    }).join("");
  }

  function renderHistory() {
    const records = loadHistory();
    renderStats(records);

    clearHistoryButton.disabled = records.length === 0;

    if (!records.length) {
      historyList.innerHTML = '<p class="empty-history">まだ半荘が保存されていません。</p>';
      return;
    }

    historyList.innerHTML = records.slice().reverse().map(record => {
      const players = Array.isArray(record.players) ? record.players : [];
      return '<article class="history-item">' +
        '<div class="history-meta">' +
          '<div class="history-date">' + escapeHtml(formatSavedAt(record.savedAt)) + "</div>" +
          '<button class="delete-record" type="button" data-record-id="' + escapeHtml(record.id) + '">削除</button>' +
        "</div>" +
        '<div class="history-players">' +
          players.map(player =>
            '<div class="history-player">' +
              "<strong>" + escapeHtml(player.rank + "位 " + player.name) + "</strong>" +
              "<span>" + pointText(Number(player.points) || 0) + " / " + resultText(Number(player.final) || 0) + "</span>" +
            "</div>"
          ).join("") +
        "</div>" +
      "</article>";
    }).join("");
  }

  function saveCurrentHanchan() {
    calculate();
    if (!currentRows) {
      message.textContent = "順位と点数を確認してから保存してください。";
      return;
    }

    const records = loadHistory();
    records.push({
      id: safeId(),
      savedAt: new Date().toISOString(),
      players: currentRows.map(row => ({ ...row }))
    });

    if (!writeHistory(records)) return;

    message.textContent = "この半荘を保存しました。履歴と累計成績を更新しました。";
    renderHistory();

    scoreInputs.forEach(input => {
      input.value = "";
    });
    calculate();
    scoreInputs[0].focus();
  }

  function deleteRecord(id) {
    const records = loadHistory();
    const next = records.filter(record => record.id !== id);
    if (next.length === records.length) return;
    if (!writeHistory(next)) return;
    renderHistory();
  }

  scoreInputs.forEach(input => input.addEventListener("input", calculate));
  [1, 2, 3, 4].forEach(rank => {
    document.getElementById("name" + rank).addEventListener("input", calculate);
  });

  form.addEventListener("submit", event => {
    event.preventDefault();
    calculate();
  });

  saveButton.addEventListener("click", saveCurrentHanchan);

  clearButton.addEventListener("click", () => {
    scoreInputs.forEach(input => {
      input.value = "";
    });
    calculate();
    scoreInputs[0].focus();
  });

  historyList.addEventListener("click", event => {
    const button = event.target.closest("[data-record-id]");
    if (!button) return;
    deleteRecord(button.dataset.recordId);
  });

  clearHistoryButton.addEventListener("click", () => {
    if (!confirm("保存した半荘履歴をすべて削除しますか？")) return;
    if (!writeHistory([])) return;
    renderHistory();
    message.textContent = "半荘履歴をすべて削除しました。";
  });

  try {
    localStorage.setItem(STORAGE_KEY + ".check", "1");
    localStorage.removeItem(STORAGE_KEY + ".check");
  } catch {
    storageAvailable = false;
    saveButton.disabled = true;
    message.textContent = "このブラウザでは履歴保存を利用できません。点数計算は利用できます。";
  }

  calculate();
  renderHistory();
})();

const ISLAND_RANK_KEY = "ff14_today_island_rank_v1";
const ISLAND_ANIMALS_KEY = "ff14_today_island_animals_v1";
const ISLAND_DAILY_PREFIX = "ff14_today_island_daily_v1_";
const ISLAND_RANK_DONE_PREFIX = "ff14_today_island_rank_done_v1_";

const WORKSHOP_PER_BUILDING = {
  twigs: 9,
  logs: 8,
  vines: 7
};

const RANKS = {
  3: {
    title: "開拓工房を2棟動かす",
    tasks: [
      "開拓用ストーンハンマーを製作する",
      "開拓工房Iを2棟建築する",
      "ねこみみさんへ報告する",
      "余った時間で不足素材だけ採集する"
    ],
    materials: ["無人島の原木×20", "無人島のパームリーフ×20", "無人島の石灰岩×10", "無人島のつる×10", "無人島の砂×10"],
    tool: "開拓用ストーンハンマー：無人島のパーム原木×2 / 無人島のつる×4 / 無人島の石材×3"
  },
  4: {
    title: "拠点と放牧地を拡張",
    tasks: [
      "アイランドホールIIへ改築する",
      "耕作地・放牧地を拡張する",
      "魔法人形用の開拓装備で土地を拡張する",
      "ランドマークを1つ建築する",
      "放牧地が10枠になったら追加5匹は後日捕獲する"
    ],
    materials: ["無人島のパーム原木×35", "無人島の石灰岩×35", "無人島のつる×25", "無人島の銅鉱×20", "無人島の原木×15", "無人島のパームリーフ×5"],
    tool: "新しい自分用採集ツールなし"
  },
  5: {
    title: "3棟目の工房とグラナリー",
    tasks: [
      "開拓用シャベルを製作する",
      "土地を拡張する",
      "3棟目の開拓工房を建築する",
      "グラナリーオフィスを建築する",
      "グラナリーを派遣してR8用希少素材を先取りする"
    ],
    materials: ["無人島のパーム原木×35", "無人島の原木×35", "無人島の石灰岩×30", "無人島の銅鉱×20", "無人島の粘土×20", "無人島のつる×15", "無人島のパームリーフ×10", "無人島の砂錫×10", "無人島の草葉×5", "無人島の砂×5"],
    tool: "開拓用シャベル：無人島のつる×3 / 無人島の銅鉱×4 / 無人島の原木×3"
  },
  6: {
    title: "工房IIへ改築",
    tasks: [
      "開拓用カッパーサイズを製作する",
      "開拓工房3棟をIIへ改築する",
      "グラナリーオフィスをIIへ改築する",
      "改築EXPを回収後、不足EXPだけ採集する"
    ],
    materials: ["無人島の原木×60", "無人島の石灰岩×45", "無人島の麻×40", "無人島の粘土×20", "無人島のパーム原木×15", "無人島の銅鉱×15", "無人島の砂錫×5"],
    tool: "開拓用カッパーサイズ：無人島の銅鉱×4 / 無人島の原木×3 / 無人島の粘土×3"
  },
  7: {
    title: "ホールIIIと2棟目グラナリー",
    tasks: [
      "アイランドホールIIIへ改築する",
      "耕作地・放牧地を最大拡張する",
      "2棟目のグラナリーオフィスを建築する",
      "ランドマークを追加する",
      "R8用ガーネット原石9・スプルース原木6を確認する"
    ],
    materials: ["無人島の石灰岩×60", "無人島の原木×55", "無人島の粘土×30", "無人島の銅鉱×27", "無人島のパームリーフ×26", "無人島の麻×26", "無人島のパーム原木×22", "無人島の砂錫×22", "無人島の綿花×10", "無人島のつる×11", "無人島の砂×5", "無人島の二枚貝×3"],
    tool: "開拓用ブロンズギグ：無人島の銅鉱×3 / 無人島の原木×3 / 無人島の砂錫×3 / 無人島の麻×3"
  },
  8: {
    title: "工房III・グラナリーIII",
    tasks: [
      "開拓用ブロンズピックを製作する",
      "開拓工房3棟をIIIへ改築する",
      "グラナリーオフィス2棟をIIIへ改築する",
      "固定EXPを取り切ってから不足分を採集する"
    ],
    materials: ["無人島の鉄鉱×75", "無人島の原木×65", "無人島の花崗岩×60", "無人島の粘土×30", "無人島の麻×20", "無人島のガーネット原石×9", "無人島のスプルース原木×6"],
    tool: "開拓用ブロンズピック：無人島の銅鉱×4 / 無人島の原木×3 / 無人島の砂錫×4 / 無人島の綿花×3"
  },
  9: {
    title: "土地拡張と灯台",
    tasks: [
      "土地を拡張する",
      "ランドマーク『灯台』を建築する",
      "ねこみみさんの関連クエストを進める",
      "R10用の開拓用アイアンハチェット素材を準備する"
    ],
    materials: ["無人島の花崗岩×30", "無人島の麻×20", "無人島の粘土×20", "無人島の鉄鉱×10", "無人島の原木×10", "無人島のクォーツ×10", "無人島の銀鉱×3"],
    tool: "次の開拓用アイアンハチェット：無人島の原木×3 / 無人島の鉄鉱×2 / 無人島のクォーツ×3"
  },
  10: {
    title: "フライング解放",
    tasks: [
      "フライング解放条件を完了する",
      "工房を止めない",
      "採集EXPは時間が取れる日にだけまとめて稼ぐ"
    ],
    materials: [],
    tool: "開拓用アイアンハチェットを未作成なら製作する"
  },
  11: {
    title: "短時間日課でR12へ",
    tasks: [
      "工房・畑・放牧地・グラナリーを優先する",
      "R12までの採集EXPは余裕がある日にまとめる"
    ],
    materials: [],
    tool: "新しい採集ツールなし"
  },
  12: {
    title: "とんがり山の洞窟を解放",
    tasks: [
      "ねこみみさんのクエストを最優先する",
      "魔法人形用の砕岩装備を製作する",
      "とんがり山の洞窟を解放する",
      "固定報酬を全回収してから採集する"
    ],
    materials: ["無人島の原木×20", "無人島のつる×10", "無人島の花崗岩×10", "無人島の極彩色の花×10", "無人島のパーム原木×10", "無人島の鉄鉱×10", "無人島のクォーツ×10", "無人島の天然樹脂×10", "無人島のウッドオパール×10", "無人島のアリッサム×5"],
    tool: "このランクはクエスト用の魔法人形装備を優先"
  },
  13: {
    title: "ホールIV・グラナリーIV",
    tasks: [
      "開拓用スチールハンマーを製作する",
      "アイランドホールIVへ改築する",
      "グラナリーオフィス2棟をIVへ改築する",
      "R14用に石炭・大理石・幻影石を多めに採集する"
    ],
    materials: ["無人島のパーム原木×45", "無人島の石炭×40", "無人島の幻影石×30", "無人島の大理石×20", "無人島の霊銀鉱×20", "無人島の鉄鉱×15", "無人島の草葉×10"],
    tool: "開拓用スチールハンマー：無人島の原木×3 / 無人島の鉄鉱×3 / 無人島のウッドオパール×3 / 無人島の石炭×4"
  },
  14: {
    title: "工房IVからR15へ",
    tasks: [
      "開拓工房3棟をIVへ改築する",
      "完成EXPをすべて回収する",
      "R15までの採集は余裕がある日にまとめる"
    ],
    materials: ["無人島の石炭×45", "無人島の大理石×45", "無人島の原木×30", "無人島の鉄鉱×30", "無人島の幻影石×30"],
    tool: "新しい採集ツールなし"
  },
  15: {
    title: "R15到達",
    tasks: [
      "ランク15到達で今回の目標達成",
      "続ける場合だけ4棟目の開拓工房・追加ランドマークへ進む"
    ],
    materials: [],
    tool: "R15で止めるなら追加採集不要"
  }
};

function jstDateKey(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(date);
}

function getRank() {
  const stored = Number(localStorage.getItem(ISLAND_RANK_KEY));
  return Number.isInteger(stored) && stored >= 3 && stored <= 15 ? stored : 3;
}

function setRank(rank) {
  localStorage.setItem(ISLAND_RANK_KEY, String(rank));
}

function getAnimals() {
  const stored = Number(localStorage.getItem(ISLAND_ANIMALS_KEY));
  if (Number.isInteger(stored) && stored >= 0) return stored;
  localStorage.setItem(ISLAND_ANIMALS_KEY, "5");
  return 5;
}

function dailyKey(id) {
  return `${ISLAND_DAILY_PREFIX}${jstDateKey()}_${id}`;
}

function rankDoneKey(rank, index) {
  return `${ISLAND_RANK_DONE_PREFIX}${rank}_${index}`;
}

function workshopCount(rank) {
  if (rank <= 4) return 2;
  if (rank <= 14) return 3;
  return 4;
}

function routineRoot() {
  return document.getElementById("retainerAdvice");
}

function normalizeTabs() {
  const root = routineRoot();
  const tabs = root?.querySelector(".retainer-flow-tabs");
  const gc = root?.querySelector("[data-gc-open]");
  const tribe = root?.querySelector("[data-tribe-open]");
  const island = root?.querySelector("[data-island-open]");
  const plan = root?.querySelector("[data-plan-open]");
  if (!tabs || !island || !plan) return;

  if (gc) tabs.append(gc);
  if (tribe) tabs.append(tribe);
  tabs.append(island);
  tabs.append(plan);

  gc?.querySelector(".retainer-flow-step")?.replaceChildren("1");
  tribe?.querySelector(".retainer-flow-step")?.replaceChildren("2");
  island.querySelector(".retainer-flow-step")?.replaceChildren("3");
  plan.querySelector(".retainer-flow-step")?.replaceChildren("4");
}

function setIslandSelected() {
  const root = routineRoot();
  if (!root) return;
  root.querySelectorAll("[data-gc-content],[data-tribe-content],[data-island-content]").forEach(node => {
    node.hidden = !node.matches("[data-island-content]");
  });
  root.querySelectorAll("[data-gc-open],[data-tribe-open],[data-island-open],[data-plan-open]").forEach(tab => {
    const active = tab.matches("[data-island-open]");
    tab.classList.toggle("active", active);
    tab.setAttribute("aria-selected", active ? "true" : "false");
  });
}

function renderRankContent(content) {
  const rank = getRank();
  const info = RANKS[rank];
  const animals = getAnimals();
  const buildings = workshopCount(rank);
  const dailyMaterials = {
    twigs: WORKSHOP_PER_BUILDING.twigs * buildings,
    logs: WORKSHOP_PER_BUILDING.logs * buildings,
    vines: WORKSHOP_PER_BUILDING.vines * buildings
  };

  const select = content.querySelector("[data-island-rank]");
  if (select) select.value = String(rank);
  const animalStatus = content.querySelector("[data-island-animals]");
  if (animalStatus) animalStatus.textContent = `飼育 ${animals}匹`;
  const title = content.querySelector("[data-island-rank-title]");
  if (title) title.textContent = `R${rank}｜${info.title}`;

  const taskList = content.querySelector("[data-island-rank-tasks]");
  if (taskList) {
    taskList.replaceChildren(...info.tasks.map((task, index) => {
      const label = document.createElement("label");
      label.className = "island-rank-task";
      const input = document.createElement("input");
      input.type = "checkbox";
      input.checked = localStorage.getItem(rankDoneKey(rank, index)) === "1";
      input.addEventListener("change", () => {
        if (input.checked) localStorage.setItem(rankDoneKey(rank, index), "1");
        else localStorage.removeItem(rankDoneKey(rank, index));
        updateTabStatus();
      });
      const span = document.createElement("span");
      span.textContent = task;
      label.append(input, span);
      return label;
    }));
  }

  const materialList = content.querySelector("[data-island-materials]");
  if (materialList) {
    materialList.replaceChildren(...(info.materials.length ? info.materials : ["このランクの固定建築素材なし"]).map(text => {
      const span = document.createElement("span");
      span.className = "island-material-chip";
      span.textContent = text;
      return span;
    }));
  }
  const tool = content.querySelector("[data-island-tool]");
  if (tool) tool.textContent = info.tool;

  const workshopLabel = content.querySelector("[data-island-workshop-count]");
  if (workshopLabel) workshopLabel.textContent = `工房${buildings}棟`;
  const twigs = content.querySelector("[data-island-twigs]");
  const logs = content.querySelector("[data-island-logs]");
  const vines = content.querySelector("[data-island-vines]");
  if (twigs) twigs.textContent = String(dailyMaterials.twigs);
  if (logs) logs.textContent = String(dailyMaterials.logs);
  if (vines) vines.textContent = String(dailyMaterials.vines);

  updateTabStatus();
}

function updateTabStatus() {
  const root = routineRoot();
  const status = root?.querySelector("[data-island-tab-status]");
  if (!status) return;
  const rank = getRank();
  const tasks = RANKS[rank]?.tasks || [];
  const done = tasks.filter((_, index) => localStorage.getItem(rankDoneKey(rank, index)) === "1").length;
  status.textContent = `R${rank} · ${done}/${tasks.length}`;
}

function bindDailyChecks(content) {
  content.querySelectorAll("[data-island-daily]").forEach(input => {
    const id = input.getAttribute("data-island-daily");
    input.checked = localStorage.getItem(dailyKey(id)) === "1";
    input.addEventListener("change", () => {
      if (input.checked) localStorage.setItem(dailyKey(id), "1");
      else localStorage.removeItem(dailyKey(id));
    });
  });
}

function ensureIslandStep() {
  const root = routineRoot();
  const tabs = root?.querySelector(".retainer-flow-tabs");
  const planTab = root?.querySelector("[data-plan-open]");
  if (!root || !tabs || !planTab) return false;

  let tab = root.querySelector("[data-island-open]");
  if (!tab) {
    tab = document.createElement("button");
    tab.type = "button";
    tab.className = "retainer-flow-tab";
    tab.setAttribute("data-island-open", "");
    tab.setAttribute("role", "tab");
    tab.setAttribute("aria-selected", "false");
    tab.setAttribute("aria-controls", "islandSanctuaryContent");
    tab.innerHTML = '<span class="retainer-flow-step">3</span><span>無人島</span><small data-island-tab-status>R3</small>';
    tabs.insertBefore(tab, planTab);
  }

  let content = root.querySelector("[data-island-content]");
  if (!content) {
    content = document.createElement("div");
    content.id = "islandSanctuaryContent";
    content.className = "retainer-advice island-sanctuary";
    content.setAttribute("data-island-content", "");
    content.hidden = true;
    content.innerHTML = `
      <div class="retainer-advice-head island-head">
        <div>
          <div class="retainer-advice-title"><span class="retainer-advice-icon">島</span><span>無人島を毎日15分だけ進める</span></div>
          <p class="retainer-advice-sub">日課を先に終えて、残り6分だけランク進行。長い採集EXP周回とレア動物探しは余裕がある日に回します。</p>
        </div>
        <div class="island-head-controls">
          <label>現在ランク
            <select data-island-rank>${Object.keys(RANKS).map(rank => `<option value="${rank}">R${rank}</option>`).join("")}</select>
          </label>
          <span class="island-animal-pill" data-island-animals>飼育 5匹</span>
        </div>
      </div>

      <div class="island-15min-grid">
        <label class="island-daily-card"><input type="checkbox" data-island-daily="pasture"><span><b>0–2分｜放牧地</b><small>落とし物回収 → 餌</small></span></label>
        <label class="island-daily-card"><input type="checkbox" data-island-daily="farm"><span><b>2–4分｜耕作地</b><small>収穫 → 種 → 水やり</small></span></label>
        <label class="island-daily-card"><input type="checkbox" data-island-daily="workshop"><span><b>4–7分｜開拓工房</b><small>結果確認 → 翌日分を予約</small></span></label>
        <label class="island-daily-card"><input type="checkbox" data-island-daily="granary"><span><b>7–9分｜グラナリー</b><small>R5以降：回収 → 再派遣</small></span></label>
      </div>

      <div class="island-columns">
        <section class="island-block">
          <div class="island-section-head"><div><p class="label">残り6分</p><h3 data-island-rank-title></h3></div><span class="island-rank-priority">上から1〜2個だけ</span></div>
          <div class="island-rank-tasks" data-island-rank-tasks></div>
        </section>

        <section class="island-block island-workshop-block">
          <div class="island-section-head"><div><p class="label">翌日分の目安</p><h3>工房24時間スターター</h3></div><span class="island-workshop-pill" data-island-workshop-count></span></div>
          <p class="island-workshop-route">アイルウッドネックレス 4h → アイルウッドチェア 6h → ネックレス 4h → チェア 6h → ネックレス 4h</p>
          <div class="island-workshop-mats">
            <div><strong data-island-twigs></strong><span>無人島の小枝</span></div>
            <div><strong data-island-logs></strong><span>無人島の原木</span></div>
            <div><strong data-island-vines></strong><span>無人島のつる</span></div>
          </div>
          <p class="island-fineprint">利益最大化より、短時間で工房を止めないことを優先した固定スターターです。</p>
        </section>
      </div>

      <details class="island-material-details">
        <summary>このランクの進行素材を見る</summary>
        <div class="island-material-list" data-island-materials></div>
        <p class="island-tool" data-island-tool></p>
      </details>
    `;
    const tribeContent = root.querySelector("[data-tribe-content]");
    if (tribeContent) tribeContent.insertAdjacentElement("afterend", content);
    else tabs.insertAdjacentElement("afterend", content);

    bindDailyChecks(content);
    content.querySelector("[data-island-rank]")?.addEventListener("change", event => {
      const rank = Number(event.currentTarget.value);
      if (!RANKS[rank]) return;
      setRank(rank);
      renderRankContent(content);
    });
  }

  if (root.dataset.islandRoutineBound !== "1") {
    root.dataset.islandRoutineBound = "1";
    root.addEventListener("click", event => {
      const button = event.target?.closest?.("button");
      if (!button) return;
      if (button.matches("[data-island-open]")) {
        setTimeout(() => setIslandSelected(), 0);
      } else if (button.matches("[data-gc-open],[data-tribe-open],[data-plan-open]")) {
        setTimeout(() => {
          const islandContent = root.querySelector("[data-island-content]");
          if (islandContent) islandContent.hidden = true;
        }, 0);
      }
    });
  }

  renderRankContent(content);
  normalizeTabs();
  return true;
}

function boot(attempt = 0) {
  if (ensureIslandStep()) {
    const root = routineRoot();
    const tabs = root?.querySelector(".retainer-flow-tabs");
    if (tabs) {
      const observer = new MutationObserver(() => normalizeTabs());
      observer.observe(tabs, { childList: true, subtree: true });
      setTimeout(() => observer.disconnect(), 8000);
    }
    return;
  }
  if (attempt < 80) setTimeout(() => boot(attempt + 1), 100);
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => boot(), { once: true });
else boot();

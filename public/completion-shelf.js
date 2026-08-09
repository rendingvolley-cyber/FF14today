(() => {
  const status = document.getElementById("statusMessage");
  const emptyState = document.getElementById("emptyState");
  const planContent = document.getElementById("planContent");
  const methodList = document.getElementById("methodList");
  const planKind = document.getElementById("planKind");
  const planner = document.getElementById("planner");
  const dailyChecklist = document.getElementById("dailyChecklist");
  const planButton = document.getElementById("planButton");
  const sessionRemaining = document.getElementById("sessionRemaining");

  if (!status || !emptyState || !planContent || !methodList || !planner) return;

  let handledText = "";

  function returnToChoiceShelf() {
    const remainingText = sessionRemaining?.textContent || "残り時間を引き継ぎます";
    const big = emptyState.querySelector(".big");
    const copy = emptyState.querySelector("p:last-child");

    planContent.classList.add("hidden");
    emptyState.classList.remove("hidden");
    methodList.replaceChildren();

    if (big) big.textContent = "1個完了。次は何する？";
    if (copy) copy.textContent = `${remainingText}。同じことを続けても、製作・採集・発見へ寄ってもOK。`;
    if (planKind) planKind.textContent = "CHOOSE";

    document.querySelectorAll("#modeChoices button[data-mode]").forEach(button => {
      button.classList.remove("active");
    });

    if (dailyChecklist) dailyChecklist.classList.add("hidden");
    if (planButton) {
      planButton.disabled = true;
      planButton.textContent = "上の入口を1つ選んでね";
    }

    status.textContent = "✓ 完了を記録しました。次は上の4つから、今ちょっと気になる入口を選んでOK。";
    planner.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  const observer = new MutationObserver(() => {
    const text = status.textContent.trim();
    if (!text || text === handledText) return;
    handledText = text;

    if (text.startsWith("✓ 「") && text.includes("完了")) {
      returnToChoiceShelf();
    }
  });

  observer.observe(status, { childList: true, subtree: true, characterData: true });
})();

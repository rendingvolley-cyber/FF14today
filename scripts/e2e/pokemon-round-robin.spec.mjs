import { test, expect } from "@playwright/test";

const KEY = "pokemon-round-robin-v5-six";
const LEGACY_KEY = "pokemon-round-robin-v4";
const LEGACY_BACKUP_KEY = "pokemon-round-robin-pre-six-backup";

test.describe("Pokémon six-player round-robin", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/pokemon-round-robin.html");
    await page.evaluate(({ key, legacyKey, backupKey }) => {
      localStorage.removeItem(key);
      localStorage.removeItem(legacyKey);
      localStorage.removeItem(backupKey);
      localStorage.removeItem("pokemon-round-robin-v3");
      localStorage.removeItem("pokemon-round-robin-v2");
    }, { key: KEY, legacyKey: LEGACY_KEY, backupKey: LEGACY_BACKUP_KEY });
    await page.reload();
  });

  test("is six players only with exactly 15 round-robin matches", async ({ page }) => {
    await expect(page.locator("#progress")).toHaveText("0/15");
    await expect(page.locator("#playerInputs input")).toHaveCount(6);
    await expect(page.locator("#playerCount")).toHaveValue("6");
    await expect(page.locator("#playerCount")).toBeDisabled();
    await expect(page.locator("#scheduleCount")).toHaveText("残り 15 / 全15");
    await expect(page.locator("#matrix tr")).toHaveCount(7);
    await expect(page.locator("#matrix tr").first().locator("th")).toHaveCount(7);
    await expect(page.locator("#recommended .match")).toHaveCount(3);

    const saved = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), KEY);
    expect(saved.players).toHaveLength(6);
    expect(saved.players).toEqual(["プレイヤー1","プレイヤー2","プレイヤー3","プレイヤー4","プレイヤー5","プレイヤー6"]);
    expect(saved.matchOrder).toHaveLength(15);
    expect(new Set(saved.matchOrder).size).toBe(15);
  });

  test("random match order makes five disjoint three-match rounds and drives suggestions", async ({ page }) => {
    const settings = page.locator("details.setup");
    await settings.locator("summary").click();
    await expect(page.locator("#matchOrderStatus")).toHaveText("標準順");

    const before = await page.evaluate(key => JSON.parse(localStorage.getItem(key)).matchOrder, KEY);
    await page.evaluate(() => { Math.random = () => 0; });
    await page.locator("#shuffleMatchesButton").click();

    await expect(page.locator("#matchOrderStatus")).toHaveText("ランダム順");
    const saved = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), KEY);
    expect(saved.matchOrder).toHaveLength(15);
    expect(new Set(saved.matchOrder).size).toBe(15);
    expect(saved.matchOrder).not.toEqual(before);

    for (let i = 0; i < 15; i += 3) {
      const players = new Set(saved.matchOrder.slice(i, i + 3).flatMap(key => key.split("-").map(Number)));
      expect(players.size).toBe(6);
    }

    const suggestedKeys = await page.locator("#recommended .match").evaluateAll(nodes => nodes.map(node => node.dataset.matchKey));
    expect(suggestedKeys).toEqual(saved.matchOrder.slice(0, 3));

    const scheduleKeys = await page.locator("#schedule .match").evaluateAll(nodes => nodes.map(node => node.dataset.matchKey));
    expect(scheduleKeys).toEqual(saved.matchOrder);
  });

  test("start -> result -> finished match disappears and next candidates update", async ({ page }) => {
    const firstCard = page.locator("#recommended .match").first();
    await expect(firstCard).toBeVisible();
    const winnerName = await firstCard.locator(".player").first().innerText();

    await firstCard.locator("button.start").click();

    const activeCard = page.locator("#recommended .match.playing").first();
    await expect(activeCard).toBeVisible();
    await expect(activeCard).toContainText("対戦中");
    await expect(activeCard.locator(".player").first()).toHaveText(winnerName);

    await activeCard.locator(".player").first().click();

    await expect(page.locator("#progress")).toHaveText("1/15");
    await expect(page.locator("#recommended .match.playing")).toHaveCount(0);
    await expect(page.locator("#recommended .match.done")).toHaveCount(0);
    await expect(page.locator("#recommended .match").first()).toBeVisible();

    const saved = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), KEY);
    expect(saved.players).toHaveLength(6);
    expect(Object.keys(saved.results)).toHaveLength(1);
    expect(saved.active).toEqual([]);

    await expect(page.locator("#matrix td.win")).toHaveCount(1);
    await expect(page.locator("#matrix td.loss")).toHaveCount(1);
  });

  test("matrix W/L can correct the winner or return the match to unplayed", async ({ page }) => {
    const firstCard = page.locator("#recommended .match").first();
    const playerA = await firstCard.locator(".player").nth(0).innerText();
    const playerB = await firstCard.locator(".player").nth(1).innerText();

    await firstCard.locator("button.start").click();
    await page.locator("#recommended .match.playing .player").first().click();
    await expect(page.locator("#progress")).toHaveText("1/15");

    await page.locator("#matrix td.win").first().click();
    const editor = page.locator("#resultEditor");
    await expect(editor).toBeVisible();
    await expect(page.locator("#resultMatchLabel")).toContainText(playerA);
    await expect(page.locator("#resultMatchLabel")).toContainText(playerB);
    await expect(page.locator("#resultPlayerA")).toHaveClass(/current-winner/);

    await page.locator("#resultPlayerB").click();
    await expect(editor).toBeHidden();
    await expect(page.locator("#progress")).toHaveText("1/15");

    const playerBRow = page.locator("#standings tr").filter({ hasText: playerB });
    await expect(playerBRow.locator("td").nth(2)).toHaveText("1");
    let saved = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), KEY);
    expect(saved.results["0-1"]).toBe("1");

    await page.locator("#matrix td.win").first().click();
    await expect(editor).toBeVisible();
    await expect(page.locator("#resultPlayerB")).toHaveClass(/current-winner/);
    await page.locator("#resultClear").click();

    await expect(editor).toBeHidden();
    await expect(page.locator("#progress")).toHaveText("0/15");
    await expect(page.locator("#matrix td.win")).toHaveCount(0);
    await expect(page.locator("#matrix td.loss")).toHaveCount(0);
    saved = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), KEY);
    expect(saved.results).toEqual({});
  });

  test("random display contains all six registered participants exactly once", async ({ page }) => {
    const drawButton = page.locator("#randomSixButton");
    await expect(drawButton).toBeEnabled();
    await drawButton.click();

    const dialog = page.locator("#randomSixDialog");
    const items = dialog.locator("#randomSixList li");
    await expect(dialog).toBeVisible();
    await expect(items).toHaveCount(6);

    let names = await items.allTextContents();
    expect(new Set(names).size).toBe(6);
    expect([...names].sort()).toEqual(["プレイヤー1","プレイヤー2","プレイヤー3","プレイヤー4","プレイヤー5","プレイヤー6"]);

    await page.locator("#randomSixAgain").click();
    await expect(items).toHaveCount(6);
    names = await items.allTextContents();
    expect(new Set(names).size).toBe(6);

    await page.locator("#randomSixDone").click();
    await expect(dialog).toBeHidden();
  });

  test("legacy seven-player local data migrates into the new six-player store", async ({ page }) => {
    await page.evaluate(({ key, legacyKey, backupKey }) => {
      localStorage.removeItem(key);
      localStorage.removeItem(backupKey);
      localStorage.setItem(legacyKey, JSON.stringify({
        title: "移行テスト",
        players: ["A","B","C","D","E","F","G"],
        results: {"0-1":"0","0-6":"6"},
        active: ["1-2","5-6"]
      }));
    }, { key: KEY, legacyKey: LEGACY_KEY, backupKey: LEGACY_BACKUP_KEY });
    await page.reload();

    await expect(page.locator("#progress")).toHaveText("1/15");
    await expect(page.locator("#playerInputs input")).toHaveCount(6);
    await expect(page.locator("#standings tr")).toHaveCount(6);

    const migrated = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), KEY);
    expect(migrated.players).toEqual(["A","B","C","D","E","F"]);
    expect(migrated.results).toEqual({"0-1":"0"});
    expect(migrated.active).toEqual(["1-2"]);
    expect(migrated.matchOrder).toHaveLength(15);

    const backup = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), LEGACY_BACKUP_KEY);
    expect(backup.players).toHaveLength(7);
  });

  test("settings can be opened and minimized by tapping its header again", async ({ page }) => {
    const settings = page.locator("details.setup");
    await expect(settings).not.toHaveAttribute("open", "");
    await settings.locator("summary").click();
    await expect(settings).toHaveAttribute("open", "");
    await settings.locator("summary").click();
    await expect(settings).not.toHaveAttribute("open", "");
  });
});

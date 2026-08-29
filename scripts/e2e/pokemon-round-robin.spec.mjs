import { test, expect } from "@playwright/test";

test.describe("Pokémon round-robin", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/pokemon-round-robin.html");
    await page.evaluate(() => {
      localStorage.removeItem("pokemon-round-robin-v4");
      localStorage.removeItem("pokemon-round-robin-v3");
      localStorage.removeItem("pokemon-round-robin-v2");
    });
    await page.reload();
  });

  test("start -> result -> finished match disappears and next candidates update", async ({ page }) => {
    await expect(page.locator("#progress")).toHaveText("0/21");

    const firstCard = page.locator("#recommended .match").first();
    await expect(firstCard).toBeVisible();
    const winnerName = await firstCard.locator(".player").first().innerText();

    await firstCard.locator("button.start").click();

    const activeCard = page.locator("#recommended .match.playing").first();
    await expect(activeCard).toBeVisible();
    await expect(activeCard).toContainText("対戦中");
    await expect(activeCard.locator(".player").first()).toHaveText(winnerName);

    await activeCard.locator(".player").first().click();

    await expect(page.locator("#progress")).toHaveText("1/21");
    await expect(page.locator("#recommended .match.playing")).toHaveCount(0);
    await expect(page.locator("#recommended .match.done")).toHaveCount(0);
    await expect(page.locator("#recommended .match").first()).toBeVisible();

    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("pokemon-round-robin-v4")));
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
    await expect(page.locator("#progress")).toHaveText("1/21");

    await page.locator("#matrix td.win").first().click();
    const editor = page.locator("#resultEditor");
    await expect(editor).toBeVisible();
    await expect(page.locator("#resultMatchLabel")).toContainText(playerA);
    await expect(page.locator("#resultMatchLabel")).toContainText(playerB);
    await expect(page.locator("#resultPlayerA")).toHaveClass(/current-winner/);

    await page.locator("#resultPlayerB").click();
    await expect(editor).toBeHidden();
    await expect(page.locator("#progress")).toHaveText("1/21");

    const playerBRow = page.locator("#standings tr").filter({ hasText: playerB });
    await expect(playerBRow.locator("td").nth(2)).toHaveText("1");
    let saved = await page.evaluate(() => JSON.parse(localStorage.getItem("pokemon-round-robin-v4")));
    expect(saved.results["0-1"]).toBe("1");

    await page.locator("#matrix td.win").first().click();
    await expect(editor).toBeVisible();
    await expect(page.locator("#resultPlayerB")).toHaveClass(/current-winner/);
    await page.locator("#resultClear").click();

    await expect(editor).toBeHidden();
    await expect(page.locator("#progress")).toHaveText("0/21");
    await expect(page.locator("#matrix td.win")).toHaveCount(0);
    await expect(page.locator("#matrix td.loss")).toHaveCount(0);
    saved = await page.evaluate(() => JSON.parse(localStorage.getItem("pokemon-round-robin-v4")));
    expect(saved.results).toEqual({});
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

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
    const matchNumber = (await firstCard.locator(".match-no").innerText()).split("\n")[0];
    const winnerName = await firstCard.locator(".player").first().innerText();

    await firstCard.locator("button.start").click();

    const activeCard = page.locator("#recommended .match.playing").filter({ hasText: matchNumber });
    await expect(activeCard).toBeVisible();
    await expect(activeCard).toContainText("対戦中");

    await activeCard.locator(".player").filter({ hasText: winnerName }).click();

    await expect(page.locator("#progress")).toHaveText("1/21");
    await expect(page.locator("#recommended .match").filter({ hasText: matchNumber })).toHaveCount(0);
    await expect(page.locator("#recommended .match").first()).toBeVisible();

    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("pokemon-round-robin-v4")));
    expect(Object.keys(saved.results)).toHaveLength(1);
    expect(saved.active).toEqual([]);

    await expect(page.locator("#matrix td.win")).toHaveCount(1);
    await expect(page.locator("#matrix td.loss")).toHaveCount(1);
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

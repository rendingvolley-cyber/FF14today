import { test, expect } from "@playwright/test";

const KEY = "pokemon-round-robin-v5-six";

test.describe("Pokémon player order shuffle", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/pokemon-round-robin.html");
    await page.evaluate((key) => {
      localStorage.removeItem(key);
      localStorage.removeItem("pokemon-round-robin-v4");
      localStorage.removeItem("pokemon-round-robin-v3");
      localStorage.removeItem("pokemon-round-robin-v2");
      localStorage.removeItem("pokemon-round-robin-pre-six-backup");
    }, KEY);
    await page.reload();
  });

  test("randomizes the actual registered player order and locks after play starts", async ({ page }) => {
    const settings = page.locator("details.setup");
    await settings.locator("summary").click();

    const inputs = page.locator("#playerInputs input");
    const registered = ["A", "B", "C", "D", "E", "F"];
    for (let i = 0; i < registered.length; i++) await inputs.nth(i).fill(registered[i]);
    await page.locator("#applyButton").click();

    let saved = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), KEY);
    expect(saved.players).toEqual(registered);

    const shuffle = page.locator("#randomSixButton");
    await expect(shuffle).toHaveText("プレイヤー順をランダム");
    await expect(shuffle).toBeEnabled();

    await page.evaluate(() => { Math.random = () => 0; });
    await Promise.all([
      page.waitForNavigation(),
      shuffle.click(),
    ]);

    saved = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), KEY);
    expect(saved.players).toEqual(["B", "C", "D", "E", "F", "A"]);
    expect(new Set(saved.players)).toEqual(new Set(registered));
    expect(saved.results).toEqual({});
    expect(saved.active).toEqual([]);

    await expect(page.locator("#playerInputs input").nth(0)).toHaveValue("B");
    await expect(page.locator("#matrix tr").first().locator("th").nth(1)).toHaveText("B");

    await page.locator("#recommended .match").first().locator("button.start").click();
    await expect(page.locator("#randomSixButton")).toBeDisabled();
    await expect(page.locator("#randomSixButton")).toHaveAttribute("title", "対戦開始後はプレイヤー順を変更できません");
  });
});

import { expect, type Page, test } from "@playwright/test";
import { openStage, waitStarted, watchErrors } from "./common";

// NORI-31：効果音と BGM（docs/game-rules.md「効果音と BGM」）。テストの一覧の 8・9

const pressed = (page: Page) => page.locator("#sound").getAttribute("aria-pressed");

// 開いたあと（読み込み直したあと）に待つもの。タイトルは覆いがないので、タイトルの準備を待つ
const titleReady = (page: Page) =>
  page.waitForFunction(() => window.__noriTitle !== undefined, undefined, { timeout: 60_000 });

for (const [name, url, ready] of [
  ["タイトル", "./", titleReady],
  ["ステージ1", "./?stage=1", waitStarted],
  ["ステージ2", "./?stage=2", waitStarted],
  ["ステージ3", "./?stage=3", waitStarted],
  ["ステージ4", "./?stage=4", waitStarted],
] as const) {
  test(`${name}：消音のボタンがあり（64 px 以上）、押すと消音、読み込み直しても消音のまま`, async ({
    page,
  }) => {
    const errors = watchErrors(page);
    await page.goto(url);
    await ready(page);
    const button = page.locator("#sound");
    await expect(button).toBeVisible();
    expect((await button.boundingBox())?.width ?? 0).toBeGreaterThanOrEqual(64);
    expect(await pressed(page)).toBe("true");
    await button.click();
    expect(await pressed(page)).toBe("false");
    await page.reload();
    await ready(page);
    expect(await pressed(page)).toBe("false");
    await page.locator("#sound").click();
    expect(await pressed(page)).toBe("true");
    expect(errors).toEqual([]);
  });
}

test("ステージ1：最初のキーで音が動き出し、ほしを取ると「とった」が鳴る。消音では音量 0", async ({
  page,
}) => {
  test.setTimeout(180_000);
  const errors = watchErrors(page);
  await openStage(page, "./?stage=1");
  // 操作の前は、音の仕組みを作らない（ブラウザの決まり）
  expect(await page.evaluate(() => window.__noriSound?.state())).toBe("none");

  const startTick = await page.evaluate(() => window.__nori?.state().tick ?? 0);
  await page.keyboard.down("ArrowUp");
  await page.waitForFunction(() => window.__noriSound?.state() === "running", undefined, { timeout: 10_000 });
  await page.waitForFunction((t) => (window.__nori?.state().tick ?? 0) >= t + 180, startTick, {
    timeout: 150_000,
  });
  await page.keyboard.up("ArrowUp");
  const played = await page.evaluate(() => window.__noriSound?.played ?? []);
  expect(played.filter((c) => c === "collect").length).toBeGreaterThanOrEqual(1);
  expect(await page.evaluate(() => window.__noriSound?.masterGain())).toBeCloseTo(1, 2);

  // 消音：0.1 秒で 0 へ（少し待ってから読む）
  await page.locator("#sound").click();
  await page.waitForTimeout(500);
  expect(await page.evaluate(() => window.__noriSound?.masterGain())).toBeLessThan(0.01);
  await page.locator("#sound").click(); // ほかのテストのために戻す
  expect(errors).toEqual([]);
});

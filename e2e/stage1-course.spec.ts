import { expect, test } from "@playwright/test";

// NORI-25：ステージ1のコース。ほし・門・行き先の矢印・上の表示（ほしの数・旗・時間）がブラウザで出て、
// まっすぐ走るとほしを取れて数が増える。コンソールエラーなし。スクリーンショットを残す。
// スタートは (0, 0) で −Z 向き。ほしは −Z へ 3 m、21 m、39 m …（docs/game-rules.md「コースの道すじ」）
test("ステージ1：走るとほしが取れて、上の数が増える", async ({ page }, testInfo) => {
  test.setTimeout(180_000);
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => consoleErrors.push(error.message));

  await page.goto("./");
  await page.waitForFunction(() => (window.__nori?.frames ?? 0) > 5, undefined, { timeout: 60_000 });
  await expect(page.locator("#status")).toBeVisible();
  await expect(page.locator("#star-count")).toHaveText("0");
  await expect(page.locator("#flags svg")).toHaveCount(3);
  await expect(page.locator("#goal")).toBeHidden();
  await page.screenshot({ path: testInfo.outputPath("01-start.png") });

  // ゲーム内で 3 秒ぶん（約 25 m）まっすぐ進むまで、アクセルを踏む（CI の遅い環境でも同じ距離になるよう、刻みで待つ）
  const startTick = await page.evaluate(() => window.__nori?.state().tick ?? 0);
  await page.keyboard.down("ArrowUp");
  await page.waitForFunction((t) => (window.__nori?.state().tick ?? 0) >= t + 180, startTick, {
    timeout: 150_000,
  });
  await page.keyboard.up("ArrowUp");

  const state = await page.evaluate(() => window.__nori?.state());
  const got = state?.course.stars.filter(Boolean).length ?? 0;
  expect(got).toBeGreaterThanOrEqual(2);
  await expect(page.locator("#star-count")).toHaveText(String(got));
  await page.screenshot({ path: testInfo.outputPath("02-after-stars.png") });
  expect(consoleErrors).toEqual([]);
});

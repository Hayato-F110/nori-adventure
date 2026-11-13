import { expect, test } from "@playwright/test";
import { STAGE1 } from "../src/config";
import { installCarDriver, startDriving } from "./driver";

// NORI-25：ステージ1のコース。ほし・門・行き先の矢印・上の表示（ほしの数・旗・時間）がブラウザで出て、
// 走るとほしを取れて数が増える。コンソールエラーなし。スクリーンショットを残す。
// スタートは (0, 0) で −Z 向き。ほしは −Z へ 3 m、21 m、39 m …（docs/game-rules.md「コースの道すじ」）
// NORI-69：本物の時間でアクセルを押す代わりに、運転役＋早送り（stage-clear.spec.ts と同じ）で走る。
// 始めの表示を確かめてから startDriving で走り出す
const FAST = 20;

test("ステージ1：走るとほしが取れて、上の数が増える", async ({ page }, testInfo) => {
  test.setTimeout(180_000);
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => consoleErrors.push(error.message));

  await installCarDriver(page, {
    waypoints: STAGE1.route.slice(1),
    turnAhead: STAGE1.checkpointRadius - 1,
    loop: false,
    stepsPerFrame: FAST,
    waitForGo: true,
    steerGain: 3,
    slowAngle: 0.6,
    slowThrottle: 0.5,
  });
  await page.goto("./?stage=1");
  await page.waitForFunction(() => (window.__nori?.frames ?? 0) > 5, undefined, { timeout: 60_000 });
  await expect(page.locator("#status")).toBeVisible();
  await expect(page.locator("#star-count")).toHaveText("0");
  await expect(page.locator("#flags svg")).toHaveCount(3);
  await expect(page.locator("#goal")).toBeHidden();
  await page.screenshot({ path: testInfo.outputPath("01-start.png") });

  // ほしを2個取るまで走り、上の表示がゲームの状態の数と同じになることを、同じ瞬間に（ブラウザの中で）比べる
  await startDriving(page);
  await page.waitForFunction(
    () => {
      const got = window.__nori?.state().course.stars.filter(Boolean).length ?? 0;
      return got >= 2 && document.querySelector("#star-count")?.textContent === String(got);
    },
    undefined,
    { timeout: 150_000, polling: 100 },
  );
  await page.screenshot({ path: testInfo.outputPath("02-after-stars.png") });
  expect(consoleErrors).toEqual([]);
});

import { expect, type Page, test } from "@playwright/test";
import { STAGE1, STAGE2, TRAIN } from "../src/config";
import { installCarDriver, installTrainDriver } from "./driver";

// NORI-37：運転役（e2e/driver.ts）でステージをクリアまで走る。キーを押さず、刻みごとに入力を決めるので毎回同じ結果。
// 完了条件（Jira）：CI で全ステージの E2E が通る。使った入力の記録は、リプレイ・自動録画（NORI-42）に使う。
const watchErrors = (page: Page) => {
  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  page.on("pageerror", (e) => errors.push(e.message));
  return errors;
};

test("ステージ1：運転役が道すじどおりに走ると、チェックポイントを3つ通ってゴールする", async ({
  page,
}, testInfo) => {
  // CI（約3 fps）ではゲームの時間が実際の時間より遅く進むので、長めに待つ
  test.setTimeout(300_000);
  const errors = watchErrors(page);
  await installCarDriver(page, {
    // チェックポイント（道すじの 2〜4 番目）とゴール（最後）を順に目指す
    waypoints: STAGE1.route.slice(1),
    // チェックポイントの半径（STAGE1.checkpointRadius 8 m）より手前で次へ向かうと、通らずに曲がってしまう
    turnAhead: STAGE1.checkpointRadius - 1,
    loop: false,
    steerGain: 3,
    slowAngle: 0.6,
    slowThrottle: 0.5,
  });
  await page.goto("./?stage=1");
  await page.waitForFunction(() => (window.__nori?.frames ?? 0) > 5, undefined, { timeout: 60_000 });
  await page.waitForFunction(() => window.__nori?.state().course.finishTick !== null, undefined, {
    timeout: 240_000,
    polling: 500,
  });
  const state = await page.evaluate(() => window.__nori?.state());
  const recorded = await page.evaluate(() => globalThis.__noriDriver?.record.length ?? 0);
  expect(state?.course.nextCheckpoint).toBe(STAGE1.checkpointCount);
  expect(state?.course.finishTick).not.toBeNull();
  // ゴールした刻みまでの入力が、すべて記録されている
  expect(recorded).toBeGreaterThanOrEqual(state?.course.finishTick ?? Infinity);
  testInfo.annotations.push({
    type: "ステージ1のクリア",
    description: `ゴール ${((state?.course.finishTick ?? 0) / 60).toFixed(1)} 秒、復活 ${state?.respawns ?? -1} 回、ほし ${state?.course.stars.filter(Boolean).length ?? 0} 個`,
  });
  await page.screenshot({ path: testInfo.outputPath("stage1-clear.png") });
  expect(errors).toEqual([]);
});

test("ステージ2：運転役が駅ごとにブレーキで止まると、3つの駅を順に通ってゴールする", async ({
  page,
}, testInfo) => {
  test.setTimeout(300_000);
  const errors = watchErrors(page);
  await installTrainDriver(page, {
    stations: STAGE2.stations,
    brake: TRAIN.brakeDeceleration,
    closeEnough: STAGE2.stationStopLength / 4,
    slowSpeed: STAGE2.stationStopSpeed / 2,
  });
  await page.goto("./?stage=2");
  await page.waitForFunction(() => (window.__nori?.frames ?? 0) > 5, undefined, { timeout: 60_000 });
  // 乗る列車を選ぶまで時間は進まない（NORI-59）
  await page.locator('#train-choice button[data-train="train"]').click();
  await page.waitForFunction(() => window.__nori?.train?.()?.finishTick !== null, undefined, {
    timeout: 240_000,
    polling: 500,
  });
  const state = await page.evaluate(() => window.__nori?.train?.());
  expect(state?.nextStation).toBe(STAGE2.stationCount);
  testInfo.annotations.push({
    type: "ステージ2のクリア",
    description: `ゴール ${((state?.finishTick ?? 0) / 60).toFixed(1)} 秒`,
  });
  await page.screenshot({ path: testInfo.outputPath("stage2-clear.png") });
  expect(errors).toEqual([]);
});

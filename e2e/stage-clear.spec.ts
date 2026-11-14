import { expect, type Page, test } from "@playwright/test";
import { BOSS, ROVER, SIM, STAGE1, STAGE2, STAGE5, TRAIN } from "../src/config";
import { friendStarPositions, pathPoint } from "../src/core/stage5Layout";
import {
  installCarDriver,
  installPlaneDriver,
  installRoverDriver,
  installSubDriver,
  installTrainDriver,
  startDriving,
} from "./driver";

// NORI-37：運転役（e2e/driver.ts）でステージをクリアまで走る。キーを押さず、刻みごとに入力を決めるので毎回同じ結果。
// 完了条件（Jira）：CI で全ステージの E2E が通る。使った入力の記録は、リプレイ・自動録画（NORI-42）に使う。
// NORI-66：CI（約 3 fps）でもゲームの時間を実時間どおりに進める早送り。60 刻み/秒 ÷ 3 fps = 20 刻み/フレーム
const FAST = 20;

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
    stepsPerFrame: FAST,
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
    stepsPerFrame: FAST,
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

test("ステージ3：運転役が輪を順に目指すと、ゴールの輪をくぐる", async ({ page }, testInfo) => {
  test.setTimeout(300_000);
  const errors = watchErrors(page);
  await installPlaneDriver(page, { steerGain: 2, climbGain: 0.2, stepsPerFrame: FAST });
  await page.goto("./?stage=3");
  await page.waitForFunction(() => (window.__nori?.frames ?? 0) > 5, undefined, { timeout: 60_000 });
  await page.waitForFunction(() => window.__nori?.plane?.()?.finishTick !== null, undefined, {
    timeout: 240_000,
    polling: 500,
  });
  const state = await page.evaluate(() => window.__nori?.plane?.());
  testInfo.annotations.push({
    type: "ステージ3のクリア",
    description: `ゴール ${((state?.finishTick ?? 0) / 60).toFixed(1)} 秒、輪 ${state?.rings.filter(Boolean).length ?? 0} / ${state?.rings.length ?? 0}`,
  });
  await page.screenshot({ path: testInfo.outputPath("stage3-clear.png") });
  expect(errors).toEqual([]);
});

test("ステージ4：運転役がたからばこへ向かうと、たからばこに着く", async ({ page }, testInfo) => {
  test.setTimeout(300_000);
  const errors = watchErrors(page);
  await installSubDriver(page, { steerGain: 2, climbGain: 0.3, stepsPerFrame: FAST });
  await page.goto("./?stage=4");
  await page.waitForFunction(() => (window.__nori?.frames ?? 0) > 5, undefined, { timeout: 60_000 });
  await page.waitForFunction(() => window.__nori?.sub?.()?.finishTick !== null, undefined, {
    timeout: 240_000,
    polling: 500,
  });
  const state = await page.evaluate(() => window.__nori?.sub?.());
  testInfo.annotations.push({
    type: "ステージ4のクリア",
    description: `ゴール ${((state?.finishTick ?? 0) / 60).toFixed(1)} 秒、生きもの ${state?.found.filter(Boolean).length ?? 0} / ${state?.found.length ?? 0}`,
  });
  await page.screenshot({ path: testInfo.outputPath("stage4-clear.png") });
  expect(errors).toEqual([]);
});

test("ステージ5：運転役が道すじを走り、なかよしの星をボスへ5回届けると、エンディングが出る", async ({
  page,
}, testInfo) => {
  test.setTimeout(420_000);
  const errors = watchErrors(page);
  const path = Array.from({ length: Math.floor(STAGE5.pathLength / 5) }, (_, i) => pathPoint((i + 1) * 5));
  await installRoverDriver(page, {
    path,
    turnAhead: 3,
    friends: friendStarPositions(),
    respawnTicks: Math.round(BOSS.friendStarRespawnSeconds / SIM.fixedDt),
    boss: {
      x: STAGE5.arenaCenter.x,
      z: STAGE5.arenaCenter.z,
      radius: BOSS.orbitRadius,
      perTick: (BOSS.moveSpeed / BOSS.orbitRadius) * SIM.fixedDt,
    },
    slowNear: 8,
    slowSpeed: 4,
    maxSpeed: ROVER.maxForwardSpeed,
    stepsPerFrame: FAST,
    steerGain: 3,
    waitForGo: true,
  });
  // NORI-70（初見レビュー 29-49）：動きを減らす設定の端末で、紙ふぶきを止めてエンディングを出すこと
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("./?stage=5");
  await page.waitForFunction(() => (window.__nori?.frames ?? 0) > 5, undefined, { timeout: 60_000 });

  // NORI-70（初見レビュー 29-29・R2-29-23）：上の表示。走り出す前は、ほし 0・なかよしのメーター（5 つの丸）に色なし。
  // 時間はゲームの時計（走り出す前も進む）なので、同じ瞬間に読んだ刻みの秒（切り捨て）と比べる
  const hud = () =>
    page.evaluate(() => ({
      stars: document.getElementById("star-count")?.textContent,
      time: document.getElementById("time")?.textContent,
      meter: document.querySelectorAll("#flags .status-flag").length,
      calmed: document.querySelectorAll("#flags .status-flag.passed").length,
      label: document.getElementById("flags")?.getAttribute("aria-label"),
      tick: window.__nori?.rover?.()?.tick ?? -1,
    }));
  const start = await hud();
  expect(start.tick).toBeGreaterThan(0);
  expect(start).toEqual({
    stars: "0",
    time: String(Math.floor(start.tick * SIM.fixedDt)),
    tick: start.tick,
    meter: BOSS.calmPoints,
    calmed: 0,
    label: "なかよし",
  });

  // エンディングの 3 秒：ページの中で画面の更新ごとに、クリアを見た時刻とエンディングが出た時刻を残す
  // （エンディングの待ちは、ゲームの刻みでなく実際の時間で数える作り。総点検の B）
  await page.evaluate(() => {
    const times: { finish: number | null; ending: number | null; confetti: number } = {
      finish: null,
      ending: null,
      confetti: 0,
    };
    (window as unknown as { __endingTimes: typeof times }).__endingTimes = times;
    const watch = (now: number) => {
      if (times.finish === null && window.__nori?.rover?.()?.finishTick !== null) times.finish = now;
      if (times.ending === null && document.getElementById("ending")?.hidden === false) times.ending = now;
      // 紙ふぶきは 3 秒で消えるので、エンディングのあとに見てもわからない。更新ごとに、出ていた回数を数える
      const confetti = document.getElementById("confetti");
      if (confetti !== null && (!confetti.hidden || confetti.childElementCount > 0)) times.confetti++;
      if (times.ending === null) requestAnimationFrame(watch);
    };
    requestAnimationFrame(watch);
  });
  await startDriving(page);
  await page.waitForFunction(() => window.__nori?.rover?.()?.finishTick !== null, undefined, {
    timeout: 360_000,
    polling: 500,
  });
  const state = await page.evaluate(() => window.__nori?.rover?.());
  expect(state?.calm).toBe(BOSS.calmPoints);
  // ボタンと一緒に、5つの乗り物の絵（エンディング）が出る。「つぎ」は出さず、タイトルへのボタンを出す
  await expect(page.locator("#ending svg")).toHaveCount(5, { timeout: 30_000 });
  await expect(page.locator("#ending")).toBeVisible();
  await expect(page.locator("#clear-next")).toBeHidden();
  await expect(page.locator("#clear-home")).toBeVisible();
  expect(await page.evaluate(() => window.__nori?.bossMouth?.())).toBe("smile");
  // クリアを見てからエンディングが出るまで、3 秒以上（画面の更新 1 回分の遅れは許す）
  const times = await page.evaluate(
    () =>
      (window as unknown as { __endingTimes: { finish: number; ending: number; confetti: number } })
        .__endingTimes,
  );
  // 動きを減らす設定なので、クリアからエンディングまでの間に、紙ふぶきは一度も出ない
  expect(times.confetti, JSON.stringify(times)).toBe(0);
  await expect(page.locator("#confetti")).toBeHidden();
  const waited = (times.ending - times.finish) / 1000;
  expect(waited, JSON.stringify(times)).toBeGreaterThanOrEqual(BOSS.endingDelaySeconds - 0.5);
  expect(waited, JSON.stringify(times)).toBeLessThan(BOSS.endingDelaySeconds + 5);
  // クリアのあとの上の表示：ほしの数・メーター 5 つすべてに色・時間はクリアした刻みの秒（切り捨て）
  // 時間はクリアした刻みで止まる（いま読んだ刻みは関係ない）
  expect({ ...(await hud()), tick: 0 }).toEqual({
    tick: 0,
    stars: String(state?.stars.filter(Boolean).length),
    time: String(Math.floor((state?.finishTick ?? 0) * SIM.fixedDt)),
    meter: BOSS.calmPoints,
    calmed: BOSS.calmPoints,
    label: "なかよし",
  });
  testInfo.annotations.push({
    type: "ステージ5のクリア",
    description: `クリア ${((state?.finishTick ?? 0) / 60).toFixed(1)} 秒、ほし ${state?.stars.filter(Boolean).length ?? 0} / ${state?.stars.length ?? 0}、復活 ${state?.respawns ?? -1} 回、エンディングまで ${waited.toFixed(2)} 秒`,
  });
  await page.screenshot({ path: testInfo.outputPath("stage5-ending.png") });
  expect(errors).toEqual([]);
});

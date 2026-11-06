import { writeFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

// 完了条件（S04）：ブラウザで車が10秒以上走り、PC で 60fps 前後。コンソールエラーなし。
// NORI-13：建物の当たり判定が入ったので、道に沿って四角く回る（状態を読んでハンドルを切る）。建物に触れないこと。
// FPS は GPU のない CI では測らない（NORI_SKIP_FPS=1）。
const DRIVE_SECONDS = 12;
// ゲーム内でこれだけ進むまでは走り続ける。CI（GPU なし・約2fps）では実際の12秒でゲーム内が約2秒しか進まず、
// 加速の途中だけを測ることになって平均の速さが不安定だった（11/6 に 5.8 m/s で1回失敗）
const MIN_SIM_SECONDS = 6;
// 遅い環境でも止まらないための、実際の時間の上限
const MAX_DRIVE_SECONDS = 90;
const MIN_AVERAGE_FPS = 55;

// 道の交差点を順に回る（スタート (0,0) から −Z へ。区画1つ分の四角）
const WAYPOINTS = [
  { x: 0, z: -40 },
  { x: -40, z: -40 },
  { x: -40, z: 0 },
  { x: 0, z: 0 },
];
// 交差点の手前この距離で、次の交差点へ向きを変え始める（最高速度での回る半径 約6.7 m より少し長く）
const TURN_AHEAD = 8;
const POLL_MS = 50;

const wrapAngle = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

type Snapshot = {
  fpsSamples: number[];
  frames: number;
  tick: number;
  car: { x: number; z: number; heading: number; speed: number; touching: boolean };
};

const snapshot = (page: import("@playwright/test").Page) =>
  page.evaluate((): Snapshot => {
    const nori = window.__nori;
    if (!nori) throw new Error("window.__nori がありません");
    const state = nori.state();
    return { fpsSamples: [...nori.fpsSamples], frames: nori.frames, tick: state.tick, car: state.car };
  });

test("車が12秒走り、FPS とコンソールエラーを記録する", async ({ page }, testInfo) => {
  // 遅い環境ではゲーム内の時間が6秒進むまで走るので、テスト全体の上限を延ばす
  test.setTimeout((MAX_DRIVE_SECONDS + 60) * 1000);
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => consoleErrors.push(error.message));

  await page.goto("./?debug");
  await page.waitForFunction(() => (window.__nori?.frames ?? 0) > 5, undefined, { timeout: 60_000 });
  await page.screenshot({ path: testInfo.outputPath("01-start.png") });

  const start = await snapshot(page);
  // アクセルを踏み続け、次の交差点の方へハンドルを切る
  await page.keyboard.down("ArrowUp");
  let target = 0;
  let pressed: "ArrowLeft" | "ArrowRight" | null = null;
  let pathLength = 0;
  let touchingSamples = 0;
  let last = start.car;
  const startedAt = Date.now();
  let shotTaken = false;
  // 実際の時間で DRIVE_SECONDS、かつゲーム内で MIN_SIM_SECONDS 進むまで走る（上限 MAX_DRIVE_SECONDS）
  const keepDriving = (tick: number) => {
    const wall = (Date.now() - startedAt) / 1000;
    if (wall >= MAX_DRIVE_SECONDS) return false;
    return wall < DRIVE_SECONDS || (tick - start.tick) / 60 < MIN_SIM_SECONDS;
  };
  let lastTick = start.tick;
  while (keepDriving(lastTick)) {
    const now = await snapshot(page);
    lastTick = now.tick;
    pathLength += Math.hypot(now.car.x - last.x, now.car.z - last.z);
    if (now.car.touching) touchingSamples++;
    last = now.car;
    const point = WAYPOINTS[target] ?? { x: 0, z: 0 };
    if (Math.hypot(point.x - now.car.x, point.z - now.car.z) < TURN_AHEAD)
      target = (target + 1) % WAYPOINTS.length;
    const aim = WAYPOINTS[target] ?? point;
    // heading 0 は −Z 向き。左へ切ると heading が増える
    const wanted = Math.atan2(-(aim.x - now.car.x), -(aim.z - now.car.z));
    const error = wrapAngle(wanted - now.car.heading);
    const next = error > 0.05 ? "ArrowLeft" : error < -0.05 ? "ArrowRight" : null;
    if (next !== pressed) {
      if (pressed) await page.keyboard.up(pressed);
      if (next) await page.keyboard.down(next);
      pressed = next;
    }
    if (!shotTaken && Date.now() - startedAt > 5000) {
      await page.screenshot({ path: testInfo.outputPath("02-driving.png") });
      shotTaken = true;
    }
    await page.waitForTimeout(POLL_MS);
  }
  if (pressed) await page.keyboard.up(pressed);
  const end = await snapshot(page);
  await page.keyboard.up("ArrowUp");
  await page.screenshot({ path: testInfo.outputPath("03-end.png") });

  const distance = pathLength + Math.hypot(end.car.x - last.x, end.car.z - last.z);
  // ゲーム内で進んだ時間。描画が遅い環境（CI のソフトウェア描画など）では、実際の時間より短くなる
  const simSeconds = (end.tick - start.tick) / 60;
  // 計測の窓の最初の1秒（起動直後）を除いて平均する
  const drivingSamples = end.fpsSamples.slice(start.fpsSamples.length);
  const average = drivingSamples.reduce((sum, fps) => sum + fps, 0) / Math.max(1, drivingSamples.length);
  const report = {
    driveSeconds: Math.round((Date.now() - startedAt) / 100) / 10,
    distanceMeters: Math.round(distance * 10) / 10,
    simSeconds: Math.round(simSeconds * 10) / 10,
    finalSpeed: Math.round(end.car.speed * 100) / 100,
    touchingSamples,
    fpsSamples: drivingSamples,
    fpsAverage: Math.round(average * 10) / 10,
    fpsMin: Math.min(...drivingSamples),
    consoleErrors,
    userAgent: await page.evaluate(() => navigator.userAgent),
    gpu: await page.evaluate(() => {
      const gl = document.createElement("canvas").getContext("webgl2");
      const ext = gl?.getExtension("WEBGL_debug_renderer_info");
      return ext ? String(gl?.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : "unknown";
    }),
  };
  writeFileSync(testInfo.outputPath("fps-report.json"), JSON.stringify(report, null, 2));
  console.info(JSON.stringify(report));

  expect(consoleErrors).toEqual([]);
  expect(drivingSamples.length).toBeGreaterThanOrEqual(DRIVE_SECONDS - 2);
  // ゲーム内の時間あたり、曲がりながらでも最高速度の半分以上の平均速度で進んでいる（走った道のりで見る）
  expect(simSeconds).toBeGreaterThanOrEqual(MIN_SIM_SECONDS);
  expect(distance / simSeconds).toBeGreaterThan(6);
  // 道の真ん中を走るので、建物・木には触れない（触れたら、配置か走らせ方がずれている）
  expect(touchingSamples).toBe(0);
  if (!process.env["NORI_SKIP_FPS"]) {
    // 手元の PC：実際の時間どおりに進み（10秒以上）、60fps 前後
    expect(simSeconds).toBeGreaterThanOrEqual(10);
    expect(average).toBeGreaterThanOrEqual(MIN_AVERAGE_FPS);
  }
});

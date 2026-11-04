import { writeFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

// 完了条件（S04）：ブラウザで車が10秒以上走り、PC で 60fps 前後。コンソールエラーなし。
// FPS は GPU のない CI では測らない（NORI_SKIP_FPS=1）。
const DRIVE_SECONDS = 12;
const MIN_AVERAGE_FPS = 55;

type Snapshot = { fpsSamples: number[]; frames: number; car: { x: number; z: number; speed: number } };

const snapshot = (page: import("@playwright/test").Page) =>
  page.evaluate((): Snapshot => {
    const nori = window.__nori;
    if (!nori) throw new Error("window.__nori がありません");
    return { fpsSamples: [...nori.fpsSamples], frames: nori.frames, car: nori.state().car };
  });

test("車が12秒走り、FPS とコンソールエラーを記録する", async ({ page }, testInfo) => {
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => consoleErrors.push(error.message));

  await page.goto("./?debug");
  await page.waitForFunction(() => (window.__nori?.frames ?? 0) > 30, undefined, { timeout: 15_000 });
  await page.screenshot({ path: testInfo.outputPath("01-start.png") });

  const start = await snapshot(page);
  // アクセルを踏み続け、途中で左右にハンドルを切る
  await page.keyboard.down("ArrowUp");
  for (let second = 0; second < DRIVE_SECONDS; second++) {
    const turn = second % 4 === 1 ? "ArrowLeft" : second % 4 === 3 ? "ArrowRight" : null;
    if (turn) await page.keyboard.down(turn);
    await page.waitForTimeout(1000);
    if (turn) await page.keyboard.up(turn);
    if (second === 5) await page.screenshot({ path: testInfo.outputPath("02-driving.png") });
  }
  const end = await snapshot(page);
  await page.keyboard.up("ArrowUp");
  await page.screenshot({ path: testInfo.outputPath("03-end.png") });

  const distance = Math.hypot(end.car.x - start.car.x, end.car.z - start.car.z);
  // 計測の窓の最初の1秒（起動直後）を除いて平均する
  const drivingSamples = end.fpsSamples.slice(start.fpsSamples.length);
  const average = drivingSamples.reduce((sum, fps) => sum + fps, 0) / Math.max(1, drivingSamples.length);
  const report = {
    driveSeconds: DRIVE_SECONDS,
    distanceMeters: Math.round(distance * 10) / 10,
    finalSpeed: Math.round(end.car.speed * 100) / 100,
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
  expect(distance).toBeGreaterThan(50); // 12秒アクセルを踏めば、曲がっても50m以上は進む
  if (!process.env["NORI_SKIP_FPS"]) expect(average).toBeGreaterThanOrEqual(MIN_AVERAGE_FPS);
});

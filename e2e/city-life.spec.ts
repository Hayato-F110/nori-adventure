import { expect, type Page, test } from "@playwright/test";
import { ASSET, CAR, SIM, STAGE1, TRAFFIC } from "../src/config";
import { createTraffic } from "../src/core/traffic";
import type { GameState } from "../src/core/types";
import { installCarDriver } from "./driver";

// NORI-61：ステージ1の街をにぎやかに。テストの一覧（docs/test-plans/NORI-61.md）の E2E。
// 自作モデル7種類に差しかわる・コンソールエラー 0・ほかの車が動く・子どもの車のそばの自転車は止まる・スクリーンショット。
// FPS は car-drive.spec.ts（同じステージ1）で測る。
const watchErrors = (page: Page) => {
  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  page.on("pageerror", (e) => errors.push(e.message));
  return errors;
};

test("ステージ1：ほかの車・自転車・バイク・人が自作モデルで走り、子どものそばでは止まる", async ({
  page,
}, testInfo) => {
  const errors = watchErrors(page);
  await page.goto("./?stage=1");
  await page.waitForFunction(() => (window.__nori?.frames ?? 0) > 5, undefined, { timeout: 60_000 });
  await page.waitForFunction(() => window.__nori?.cityLife?.().models === 7, undefined, { timeout: 30_000 });

  const read = () => page.evaluate(() => window.__nori?.cityLife?.().poses);
  const before = await read();
  if (before === undefined) throw new Error("__nori.cityLife がない");
  expect(before.vehicles).toHaveLength(4);
  expect(before.bikes).toHaveLength(4);
  expect(before.people).toHaveLength(6);

  // ゲームが 30 刻み（0.5 秒）より多く進むまで待つ（子どもの車は動かさない）。遅い CI でも刻みで待つ
  const tick0 = await page.evaluate(() => window.__nori?.state().tick ?? 0);
  await page.waitForFunction((t) => (window.__nori?.state().tick ?? 0) > t + 30, tick0, { timeout: 60_000 });
  const after = await read();
  if (after === undefined) throw new Error("__nori.cityLife がない");

  // ほかの車は動いている
  const moved = (a: { x: number; z: number }, b: { x: number; z: number }) =>
    Math.hypot(a.x - b.x, a.z - b.z);
  expect(moved(before.vehicles[0] ?? { x: 0, z: 0 }, after.vehicles[0] ?? { x: 0, z: 0 })).toBeGreaterThan(
    0.1,
  );
  // スタートの左 4 m の自転車（1台目）は、止まっている子どもの車から 6 m 以内なので止まったまま
  expect(moved(before.bikes[0] ?? { x: 0, z: 0 }, after.bikes[0] ?? { x: 9, z: 9 })).toBe(0);

  await page.screenshot({ path: testInfo.outputPath("city-life-start.png") });
  expect(errors).toEqual([]);
});

// NORI-70（初見レビュー 61-36・R2-61-39）：上のテストは、はじめから近くにいる自転車だけを見ていた。
// 運転役＋早送りでコースを走り、刻みごとのゲームの状態をページの中に残す。テストの側で、前の刻みの状態と子どもの車の位置から
// ほかの車・自転車・バイク・人の次の状態を計算し直し（src/core/traffic.ts と同じ関数）、画面のゲームと完全に一致するかを見る。
// あわせて、子どもの車が近づいて自転車・バイクが止まった刻みが本当にあることを確かめる（実際の時間に頼らない）
const FAST = 20;
const RECORD_TICKS = 1800; // 30 秒分。スタートから2つ目の角の先まで（自転車・バイクを追い抜く）

test("ステージ1：運転役でコースを走ると、近づいた自転車・バイクが止まり、街の動きはゲームの決まりと同じ", async ({
  page,
}, testInfo) => {
  test.setTimeout(300_000);
  const errors = watchErrors(page);
  await installCarDriver(page, {
    waypoints: STAGE1.route.slice(1),
    turnAhead: STAGE1.checkpointRadius - 1,
    loop: false,
    stepsPerFrame: FAST,
    steerGain: 3,
    slowAngle: 0.6,
    slowThrottle: 0.5,
  });
  // 運転役が呼ばれるたび（刻みごと）に、その刻みの前の状態を残す
  await page.addInitScript((limit: number) => {
    const driver = globalThis.__noriDriver;
    if (driver === undefined) return;
    const states: unknown[] = [];
    (globalThis as { __noriStates?: unknown[] }).__noriStates = states;
    const drive = driver.drive.bind(driver);
    driver.drive = (raw) => {
      if (states.length < limit) states.push(structuredClone(raw));
      return drive(raw);
    };
  }, RECORD_TICKS + 1);
  await page.goto("./?stage=1");
  await page.waitForFunction(
    (n) => ((globalThis as { __noriStates?: unknown[] }).__noriStates?.length ?? 0) >= n,
    RECORD_TICKS + 1,
    { timeout: 240_000, polling: 500 },
  );
  const states = (await page.evaluate(
    () => (globalThis as { __noriStates?: unknown[] }).__noriStates,
  )) as GameState[];

  const traffic = createTraffic(TRAFFIC, ASSET.city.sizes, STAGE1.route, CAR.collisionRadius);
  let mismatches = 0;
  let bikeStops = 0; // 走り出したあと、子どもの車が 6 m 以内に来て自転車・バイクが止まった刻み（台ごとに数える）
  for (let k = 0; k + 1 < states.length; k++) {
    const now = states[k] as GameState;
    const next = states[k + 1] as GameState;
    expect(next.tick).toBe(now.tick + 1);
    const expected = traffic.step(now.traffic, now.car, SIM.fixedDt);
    if (JSON.stringify(expected) !== JSON.stringify(next.traffic)) mismatches++;
    const poses = traffic.poses(now.traffic);
    poses.bikes.forEach((p, i) => {
      const near = Math.hypot(p.x - now.car.x, p.z - now.car.z) <= TRAFFIC.bikeStopRadius;
      // スタートでは1台目の自転車がはじめから 4 m の所にいるので、走り出して 20 m より先の所だけを数える
      const away = Math.hypot(now.car.x - STAGE1.start.x, now.car.z - STAGE1.start.z) > 20;
      if (near && away && next.traffic.bikes[i]?.speed === 0) bikeStops++;
    });
  }
  testInfo.annotations.push({
    type: "街の動き",
    description: `${states.length} 刻み、決まりと違った刻み ${mismatches}、近づいて止まった自転車・バイク ${bikeStops}（台 × 刻み）`,
  });
  expect(mismatches).toBe(0);
  expect(bikeStops).toBeGreaterThan(0);
  // 子どもの車は本当に走った：走った道のりの合計が 100 m より長い（コースは輪なので、スタートからのまっすぐの距離では測れない）
  const traveled = states.slice(1).reduce((sum, st, k) => {
    const prev = (states[k] as GameState).car;
    return sum + Math.hypot(st.car.x - prev.x, st.car.z - prev.z);
  }, 0);
  expect(traveled).toBeGreaterThan(100);
  expect(errors).toEqual([]);
});

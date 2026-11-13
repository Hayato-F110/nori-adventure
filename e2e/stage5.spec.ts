import { expect, type Page, test } from "@playwright/test";
import { BOSS, SIM, STAGE5 } from "../src/config";
import { pathPoint } from "../src/core/stage5Layout";
import { installRoverDriver } from "./driver";
import { luminanceAt, peakLuminanceAt, ratio } from "./luminance";

// NORI-29：ステージ5（月面・ローバー）の見た目。ほし・ジャンプ台・なかよしの星と、まわりの明るさの比 3 以上
// （docs/game-rules.md「ステージ5の色」。値は式で計算して決めた。ここでは1回だけ確かめる）。FPS・コンソールエラー・スクショ。
const MIN_CONTRAST = 3; // LOOK.minStarContrast と同じ
const skipFps = Boolean(process.env["NORI_SKIP_FPS"]);

const watchErrors = (page: Page) => {
  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  page.on("pageerror", (e) => errors.push(e.message));
  return errors;
};

const ready = async (page: Page) => {
  await page.goto("./?stage=5");
  await page.waitForFunction(() => (window.__nori?.frames ?? 0) > 5, undefined, { timeout: 60_000 });
};

type Name = "star" | "path" | "pad" | "friend" | "ground";
const screenPoints = (page: Page, names: Name[]) =>
  page.evaluate((names) => {
    const m = window.__nori?.moonMarker?.();
    return names.map((n) => {
      const p = m?.[n] ?? { x: 0, y: 0, z: 0 };
      return window.__nori?.screenOf(p.x, p.y, p.z) ?? { x: 0, y: 0 };
    });
  }, names);

/** 画面の外の点は黒として測られ、比が大きく出てしまうので、先に画面の中にあることを確かめる */
const expectOnScreen = (page: Page, points: { x: number; y: number }[]) => {
  const v = page.viewportSize() ?? { width: 0, height: 0 };
  for (const p of points) {
    expect(p.x).toBeGreaterThanOrEqual(12);
    expect(p.x).toBeLessThanOrEqual(v.width - 12);
    expect(p.y).toBeGreaterThanOrEqual(12);
    expect(p.y).toBeLessThanOrEqual(v.height - 12);
  }
};

test("ステージ5の見た目：スタートで、ほし・ジャンプ台が道より目立つ", async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  const errors = watchErrors(page);
  await ready(page);
  await page.waitForTimeout(800);
  await page.screenshot({ path: testInfo.outputPath("stage5-start.png") });
  const points = await screenPoints(page, ["star", "path", "pad"]);
  expectOnScreen(page, points);
  const [, path = 0] = await luminanceAt(page, points);
  // ほし・台は小さく見えるので、読んだ点のまわり 6 px でいちばん明るいところを測る
  const star = await peakLuminanceAt(page, points[0] ?? { x: 0, y: 0 }, 6);
  const pad = await peakLuminanceAt(page, points[2] ?? { x: 0, y: 0 }, 6);
  const result = { star: ratio(star, path), pad: ratio(pad, path), points };
  await testInfo.attach("contrast", { body: JSON.stringify(result), contentType: "application/json" });
  expect(result.star, JSON.stringify(result)).toBeGreaterThanOrEqual(MIN_CONTRAST);
  expect(result.pad, JSON.stringify(result)).toBeGreaterThanOrEqual(MIN_CONTRAST);
  expect(errors).toEqual([]);
});

test("ステージ5の見た目：広場の入口で、なかよしの星が砂より目立つ。ボスと岩が見える", async ({
  page,
}, testInfo) => {
  test.setTimeout(240_000);
  const errors = watchErrors(page);
  // 道すじを 4 m/s で d = 100 まで走って止まる（なかよしの星は取らない：friends を渡さない）
  await installRoverDriver(page, {
    path: Array.from({ length: 20 }, (_, i) => pathPoint((i + 1) * 5)),
    turnAhead: 3,
    friends: [],
    respawnTicks: Math.round(BOSS.friendStarRespawnSeconds / SIM.fixedDt),
    boss: { x: STAGE5.arenaCenter.x, z: STAGE5.arenaCenter.z, radius: BOSS.orbitRadius, perTick: 0 },
    slowNear: 0,
    slowSpeed: 4,
    maxSpeed: 4,
    steerGain: 3,
  });
  await ready(page);
  await page.waitForFunction(
    () => {
      const s = window.__nori?.rover?.();
      return s !== undefined && s.rover.z < -15 && Math.abs(s.rover.speed) < 0.05;
    },
    undefined,
    { timeout: 200_000, polling: 500 },
  );
  await page.waitForTimeout(800);
  await page.screenshot({ path: testInfo.outputPath("stage5-arena.png") });
  const points = await screenPoints(page, ["friend", "ground"]);
  expectOnScreen(page, points);
  const [, ground = 0] = await luminanceAt(page, points);
  const friend = await peakLuminanceAt(page, points[0] ?? { x: 0, y: 0 }, 6);
  const contrast = ratio(friend, ground);
  await testInfo.attach("contrast", {
    body: JSON.stringify({ friend: contrast, points }),
    contentType: "application/json",
  });
  expect(contrast, JSON.stringify({ friend, ground, points })).toBeGreaterThanOrEqual(MIN_CONTRAST);
  expect(errors).toEqual([]);
});

test("ステージ5：CPU を4倍遅くしても 30fps 以上", { tag: "@fps" }, async ({ page }) => {
  test.skip(skipFps, "GPU のない CI では FPS を測らない");
  test.setTimeout(120_000);
  const cdp = await page.context().newCDPSession(page);
  await ready(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  await page.keyboard.down("ArrowUp");
  const start = await page.evaluate(() => window.__nori?.fpsSamples.length ?? 0);
  await page.waitForFunction((n) => (window.__nori?.fpsSamples.length ?? 0) >= n + 6, start, {
    timeout: 60_000,
  });
  await page.keyboard.up("ArrowUp");
  const samples = ((await page.evaluate(() => window.__nori?.fpsSamples)) ?? []).slice(start + 1);
  const average = samples.reduce((s, v) => s + v, 0) / Math.max(1, samples.length);
  expect(average).toBeGreaterThanOrEqual(30);
});

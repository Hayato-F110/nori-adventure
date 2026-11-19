import { expect, type Page, test } from "@playwright/test";
import { BOSS, LOOK, SIM, STAGE5 } from "../src/config";
import { pathPoint } from "../src/core/stage5Layout";
import { chooseQuality, openStage, waitTicks, watchErrors } from "./common";
import { installRoverDriver } from "./driver";
import { attachShot, luminanceAt, peakLuminanceAt, ratio } from "./luminance";

// NORI-29：ステージ5（月面・ローバー）の見た目。ほし・ジャンプ台・なかよしの星と、まわりの明るさの比 3 以上
// （docs/game-rules.md「ステージ5の色」。値は式で計算して決めた。ここでは1回だけ確かめる）。FPS・コンソールエラー・スクショ。
const MIN_CONTRAST = 3; // LOOK.minStarContrast と同じ
const skipFps = Boolean(process.env["NORI_SKIP_FPS"]);
// NORI-77（一覧 3）：画質は自動の切り替えに頼らず、選んで開く（CI でも高画質の版は高画質で測る）。
// 画質を選ぶと自動では変わらないので、広場の入口の版は早送りで走る（stage3・4 と同じ 20 刻み/フレーム）
const FAST = 20;
const QUALITIES = [
  ["高画質", "high"],
  ["低画質", "low"],
] as const;

/** 選んだ画質で開き、素材の読み終わりまで待つ。測る前に、画質と見た目が選んだとおりかを確かめる */
const openWithQuality = async (page: Page, quality: "high" | "low") => {
  await chooseQuality(page, quality);
  await openStage(page, "./?stage=5", { look: true });
  expect(await page.evaluate(() => window.__nori?.quality)).toBe(quality);
  expect(await page.evaluate(() => window.__nori?.look)).toBe(quality === "low" ? "plain" : "textured");
};

type Name = "star" | "path" | "pad" | "sand" | "friend" | "ground";
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

/**
 * 道すじを 4 m/s で d = 100（広場の入口）まで早送りで走って止まり、ボスが自作モデルに差しかわるのを待つ
 * （なかよしの星は取らない：friends を渡さない）
 */
const driveToArenaEntrance = async (page: Page, quality: "high" | "low") => {
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
    stepsPerFrame: FAST,
  });
  await openWithQuality(page, quality);
  await page.waitForFunction(
    () => {
      const s = window.__nori?.rover?.();
      return s !== undefined && s.rover.z < -15 && Math.abs(s.rover.speed) < 0.05;
    },
    undefined,
    { timeout: 200_000, polling: 500 },
  );
  // NORI-65（一覧 6。初見レビュー R1-65-16）：読み込みの速さで結果が変わらないように、差しかわるのを待つ
  await page.waitForFunction(() => window.__nori?.bossModel === "glb", undefined, { timeout: 30_000 });
};

for (const [mode, quality] of QUALITIES) {
  test(`ステージ5の見た目（${mode}）：広場の入口で、なかよしの星が砂より目立つ。ボスは自作モデルで、への字の口`, async ({
    page,
  }, testInfo) => {
    test.setTimeout(240_000);
    const errors = watchErrors(page);
    await driveToArenaEntrance(page, quality);
    // NORI-70（初見レビュー 29-54）：止まってから、実際の 0.8 秒でなくゲームの 90 刻み待つ
    await waitTicks(page, 90);
    // NORI-65（一覧 6。R1-65-9）：描画の変数でなく、モデルで見えている口のノードを読む
    expect(await page.evaluate(() => window.__nori?.bossMouthNodes?.())).toEqual(["mouth_frown"]);
    const points = await screenPoints(page, ["friend", "ground"]);
    expectOnScreen(page, points);
    const shot = await attachShot(page, testInfo, `stage5-arena-${quality}`);
    const [, ground = 0] = await luminanceAt(page, points, shot);
    const friend = await peakLuminanceAt(page, points[0] ?? { x: 0, y: 0 }, 6, shot);
    const contrast = ratio(friend, ground);
    await testInfo.attach("contrast", {
      body: JSON.stringify({ friend: contrast, quality, points }),
      contentType: "application/json",
    });
    expect(contrast, JSON.stringify({ friend, ground, points })).toBeGreaterThanOrEqual(MIN_CONTRAST);
    expect(errors).toEqual([]);
  });
}

// NORI-65（一覧 7。初見レビュー R1-65-1・2）：ボスの広場の入口で、重い方の高画質に決めて測る。
// 実際の速さが要る E2E なので、入口に着いてから早送りをやめる（運転役の stepsPerFrame を消す）
test("ステージ5：ボスの広場の入口で、CPU を遅くしても 30fps 以上（高画質）", { tag: "@fps" }, async ({ page }, testInfo) => {
  test.skip(skipFps, "GPU のない CI では FPS を測らない");
  test.setTimeout(360_000);
  await driveToArenaEntrance(page, "high");
  await page.evaluate(() => {
    const driver = (globalThis as unknown as { __noriDriver?: { stepsPerFrame?: number } }).__noriDriver;
    if (driver) delete driver.stepsPerFrame;
  });
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: LOOK.cpuThrottle });
  const start = await page.evaluate(() => window.__nori?.fpsSamples.length ?? 0);
  await page.waitForFunction((n) => (window.__nori?.fpsSamples.length ?? 0) >= n + 6, start, {
    timeout: 120_000,
  });
  const samples = ((await page.evaluate(() => window.__nori?.fpsSamples)) ?? []).slice(start + 1);
  const average = samples.reduce((s, v) => s + v, 0) / Math.max(1, samples.length);
  const quality = await page.evaluate(() => window.__nori?.quality);
  await testInfo.attach("throttled", {
    body: JSON.stringify({ samples, average, quality, throttle: LOOK.cpuThrottle }),
    contentType: "application/json",
  });
  await page.screenshot({ path: testInfo.outputPath("stage5-boss-throttled.png") });
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
  expect(average).toBeGreaterThanOrEqual(LOOK.throttledFps);
  expect(quality).toBe("high");
});

import { expect, type Page, test } from "@playwright/test";
import { BOSS, SIM, STAGE5 } from "../src/config";
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

for (const [mode, quality] of QUALITIES) {
  test(`ステージ5の見た目（${mode}）：スタートで、ほし・ジャンプ台がまわりの月の砂より目立つ`, async ({
    page,
  }, testInfo) => {
    test.setTimeout(120_000);
    const errors = watchErrors(page);
    await openWithQuality(page, quality);
    // NORI-70（初見レビュー 29-54）：実際の 0.8 秒でなく、ゲームの 90 刻み待つ（ステージ2の見た目と同じ。カメラが落ち着くまで）
    await waitTicks(page, 90);
    // ルールは、ほし・台を「まわりの月の砂」と比べる（計算：ほしと砂 4.59、台と砂 4.20）。前は道と比べていた
    // （道は砂より暗いので、比が大きく出て通りやすい。NORI-70：初見レビュー R1-70-1）。道との比は記録にだけ残す
    const points = await screenPoints(page, ["star", "path", "pad", "sand"]);
    expectOnScreen(page, points);
    const shot = await attachShot(page, testInfo, `stage5-start-${quality}`);
    const [, path = 0, , sand = 0] = await luminanceAt(page, points, shot);
    // ほし・台は小さく見えるので、読んだ点のまわり 6 px でいちばん明るいところを測る
    const star = await peakLuminanceAt(page, points[0] ?? { x: 0, y: 0 }, 6, shot);
    const pad = await peakLuminanceAt(page, points[2] ?? { x: 0, y: 0 }, 6, shot);
    const result = {
      star: ratio(star, sand),
      pad: ratio(pad, sand),
      starToPath: ratio(star, path),
      padToPath: ratio(pad, path),
      quality,
      points,
    };
    await testInfo.attach("contrast", { body: JSON.stringify(result), contentType: "application/json" });
    expect(result.star, JSON.stringify(result)).toBeGreaterThanOrEqual(MIN_CONTRAST);
    expect(result.pad, JSON.stringify(result)).toBeGreaterThanOrEqual(MIN_CONTRAST);
    expect(errors).toEqual([]);
  });
}

for (const [mode, quality] of QUALITIES) {
  test(`ステージ5の見た目（${mode}）：広場の入口で、なかよしの星が砂より目立つ。ボスと岩が見える`, async ({
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
    // NORI-70（初見レビュー 29-54）：止まってから、実際の 0.8 秒でなくゲームの 90 刻み待つ
    await waitTicks(page, 90);
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

test("ステージ5：CPU を4倍遅くしても 30fps 以上", { tag: "@fps" }, async ({ page }) => {
  test.skip(skipFps, "GPU のない CI では FPS を測らない");
  test.setTimeout(120_000);
  const cdp = await page.context().newCDPSession(page);
  await openStage(page, "./?stage=5", { look: true });
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

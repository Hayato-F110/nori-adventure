import { expect, type Page, test, type TestInfo } from "@playwright/test";
import { luminanceAt, ratio } from "./luminance";

// NORI-56：リアル寄りの見た目（docs/game-rules.md「見た目」）。
// 素材は同じオリジンだけから読み、子どもに大事なもの（ほし・道）が見分けやすく、FPS を保つ。コンソールエラーなし。
// FPS は GPU のない CI では測らない（NORI_SKIP_FPS=1）。数値は src/config の LOOK と同じ（ここに写す）
const LOOK = {
  minStarContrast: 3,
  minRoadGrassContrast: 1.5,
  targetFps: 55,
  throttledFps: 30,
  cpuThrottle: 4,
};
const skipFps = Boolean(process.env["NORI_SKIP_FPS"]);

const ready = async (page: Page) => {
  await page.goto("./");
  await page.waitForFunction(() => (window.__nori?.frames ?? 0) > 5, undefined, { timeout: 60_000 });
  await page.waitForFunction(() => window.__nori?.look !== "loading", undefined, { timeout: 60_000 });
};

// 高画質（素材を貼る）と低画質（単色）の両方で、ほし・道が見分けやすいこと。
// 低画質は、CPU を 20 倍遅くして再現する（GPU のない CI と同じく、40fps 未満が 3 秒続いて下がる）。
// CI はもともと遅いので、どちらの場合も低画質になる。期待する見た目は、そのときの画質で決める
for (const mode of ["高画質", "低画質"] as const) {
  test(`見た目（${mode}）：素材を同じオリジンから読み、ほし・道が見分けやすい`, async ({
    page,
  }, testInfo) => {
    test.setTimeout(120_000);
    await checkLook(page, testInfo, mode);
  });
}

const checkLook = async (page: Page, testInfo: TestInfo, mode: "高画質" | "低画質") => {
  const consoleErrors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") consoleErrors.push(m.text());
  });
  page.on("pageerror", (e) => consoleErrors.push(e.message));
  const origins = new Set<string>();
  page.on("request", (r) => origins.add(new URL(r.url()).origin));

  if (mode === "低画質") {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 20 });
    await ready(page);
    await page.waitForFunction(() => window.__nori?.quality === "low", undefined, { timeout: 90_000 });
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
  } else {
    await ready(page);
  }
  // 見た目は、そのときの画質で決まる（高画質なら素材、低画質なら単色）
  const quality = await page.evaluate(() => window.__nori?.quality);
  expect(await page.evaluate(() => window.__nori?.look)).toBe(quality === "low" ? "plain" : "textured");
  // 木（NORI-26）：高画質は Blender の木、低画質は今の簡単な木
  await page.waitForFunction((q) => window.__nori?.trees === (q === "low" ? "simple" : "model"), quality, {
    timeout: 30_000,
  });
  // 車の後ろのカメラが落ち着くまで待つ
  await page.waitForTimeout(1500);
  await page.screenshot({ path: testInfo.outputPath(`look-${quality}.png`) });

  // ほし（2個目。(0, 1, −21)）と、そのすぐ横の道 (2.5, 0, −21)。道 (−2.5, 0, −12) と、道の外の芝 (−6.2, 0, −12)
  const points = await page.evaluate(() => {
    const s = (x: number, y: number, z: number) => window.__nori?.screenOf(x, y, z) ?? { x: 0, y: 0 };
    return [s(0, 1, -21), s(2.5, 0.02, -21), s(-2.5, 0.02, -12), s(-6.2, 0, -12), s(0, 0.02, -15)];
  });
  const [star = 0, roadByStar = 0, road = 0, grass = 0, roadCenter = 0] = await luminanceAt(page, points);
  // ほしは道の中心に並ぶ。横の道だけでなく、ほしの手前の道の中心（前は中央線があった所）とも比べる（奥の点は、画面ではほしに重なる）
  const starContrast = Math.min(ratio(star, roadByStar), ratio(star, roadCenter));
  const roadGrass = ratio(road, grass);
  await testInfo.attach("contrast", {
    body: JSON.stringify({
      quality,
      starContrast,
      roadGrass,
      star,
      roadByStar,
      roadCenter,
      road,
      grass,
      points,
    }),
    contentType: "application/json",
  });
  expect(starContrast).toBeGreaterThanOrEqual(LOOK.minStarContrast);
  expect(roadGrass).toBeGreaterThanOrEqual(LOOK.minRoadGrassContrast);

  const base = new URL(page.url()).origin;
  expect([...origins].filter((o) => o !== base && !o.startsWith("data:"))).toEqual([]);
  expect(consoleErrors).toEqual([]);
};

test("見た目：手元の PC で FPS を保つ", async ({ page }, testInfo) => {
  test.skip(skipFps, "GPU のない CI では FPS を測らない");
  await ready(page);
  const start = await page.evaluate(() => window.__nori?.fpsSamples.length ?? 0);
  await page.waitForFunction((n) => (window.__nori?.fpsSamples.length ?? 0) >= n + 5, start, {
    timeout: 30_000,
  });
  const samples = (await page.evaluate(() => window.__nori?.fpsSamples)) ?? [];
  const recent = samples.slice(start + 1);
  const average = recent.reduce((s, v) => s + v, 0) / Math.max(1, recent.length);
  await testInfo.attach("fps", {
    body: JSON.stringify({ recent, average }),
    contentType: "application/json",
  });
  expect(average).toBeGreaterThanOrEqual(LOOK.targetFps);
  expect(await page.evaluate(() => window.__nori?.quality)).toBe("high");
});

test("見た目：CPU を遅くしても 30fps 以上（必要なら低画質に下がる）", async ({ page }, testInfo) => {
  test.skip(skipFps, "GPU のない CI では FPS を測らない");
  test.setTimeout(120_000);
  await ready(page);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: LOOK.cpuThrottle });
  // 低画質に下がるかどうかを決める時間（3 秒）と、そのあとの測る時間
  await page.waitForTimeout(6000);
  const start = await page.evaluate(() => window.__nori?.fpsSamples.length ?? 0);
  await page.waitForFunction((n) => (window.__nori?.fpsSamples.length ?? 0) >= n + 5, start, {
    timeout: 60_000,
  });
  const samples = (await page.evaluate(() => window.__nori?.fpsSamples)) ?? [];
  const recent = samples.slice(start);
  const average = recent.reduce((s, v) => s + v, 0) / Math.max(1, recent.length);
  const quality = await page.evaluate(() => window.__nori?.quality);
  await testInfo.attach("throttled", {
    body: JSON.stringify({ recent, average, quality }),
    contentType: "application/json",
  });
  await page.screenshot({ path: testInfo.outputPath("look-throttled.png") });
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
  expect(average).toBeGreaterThanOrEqual(LOOK.throttledFps);
});

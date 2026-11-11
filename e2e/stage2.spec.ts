import { expect, type Page, test, type TestInfo } from "@playwright/test";
import { luminanceAt, ratio } from "./luminance";

// NORI-26：ステージ2（山道・列車）。テストの一覧の 7・8 と、見た目の完了条件（Jira）。
// ?stage=2 で開き、すすむで走って1つ目の駅（150 m）に止まると、上の表示の1つ目の旗に色が付く。
// 旗と土手の明るさの比 3 以上（高画質・低画質）。スクリーンショット・コンソールエラー・FPS。
const MIN_CONTRAST = 3; // LOOK.minStarContrast と同じ（ほし・ゴールと道）
const FIRST_STATION = 150; // STAGE2.stations[0]
const BRAKE = 6; // TRAIN.brakeDeceleration
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
  await page.goto("./?stage=2");
  await page.waitForFunction(() => (window.__nori?.frames ?? 0) > 5, undefined, { timeout: 60_000 });
};

/** ブレーキで駅のホーム（±6 m）に止まれる所まで、すすむ。そのあとブレーキで止める（刻みで待つので CI の遅さに左右されない） */
const driveToFirstStation = async (page: Page, testInfo?: TestInfo) => {
  await page.keyboard.down("ArrowUp");
  await page.waitForFunction(
    ({ station, brake }) => {
      const s = window.__nori?.train?.();
      if (!s) return false;
      return s.train.distance + (s.train.speed * s.train.speed) / (2 * brake) >= station - 1;
    },
    { station: FIRST_STATION, brake: BRAKE },
    { timeout: 120_000 },
  );
  await page.keyboard.up("ArrowUp");
  if (testInfo) await page.screenshot({ path: testInfo.outputPath("02-running.png") });
  await page.keyboard.down("ArrowDown");
  await page.waitForFunction(() => (window.__nori?.train?.()?.train.speed ?? 9) <= 0.3, undefined, {
    timeout: 30_000,
  });
  await page.keyboard.up("ArrowDown");
};

const train = (page: Page) => page.evaluate(() => window.__nori?.train?.());

test("ステージ2：走って駅に止まると、上の表示の旗に色が付く", async ({ page }, testInfo) => {
  test.setTimeout(180_000);
  const errors = watchErrors(page);
  await ready(page);
  expect(await page.evaluate(() => window.__nori?.stage)).toBe(2);
  await expect(page.locator("#status")).toBeVisible();
  await expect(page.locator("#star-count")).toBeHidden(); // ほしは置かない
  await expect(page.locator("#wheel")).toBeHidden(); // ハンドルは効かない
  await expect(page.locator("#flags svg")).toHaveCount(3);
  await expect(page.locator("#flags svg.passed")).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath("01-start.png") });

  await driveToFirstStation(page, testInfo);
  await page.waitForFunction(() => window.__nori?.train?.()?.nextStation === 1, undefined, {
    timeout: 30_000,
  });
  await expect(page.locator("#flags svg.passed")).toHaveCount(1);
  const s = await train(page);
  expect(Math.abs((s?.train.distance ?? 0) - FIRST_STATION)).toBeLessThanOrEqual(6);
  await page.screenshot({ path: testInfo.outputPath("03-station.png") });
  expect(await page.evaluate(() => window.__nori?.carModel)).toBe("glb");
  expect(errors).toEqual([]);
});

for (const mode of ["高画質", "低画質"] as const) {
  test(`ステージ2の見た目（${mode}）：駅の旗が土手より目立つ`, async ({ page }, testInfo) => {
    test.setTimeout(150_000);
    await checkLook(page, testInfo, mode);
  });
}

const checkLook = async (page: Page, testInfo: TestInfo, mode: "高画質" | "低画質") => {
  const errors = watchErrors(page);
  if (mode === "低画質") {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 20 });
    await ready(page);
    await page.waitForFunction(() => window.__nori?.quality === "low", undefined, { timeout: 90_000 });
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
  } else {
    await ready(page);
  }
  await page.waitForFunction(() => window.__nori?.look !== "loading", undefined, { timeout: 60_000 });
  const quality = await page.evaluate(() => window.__nori?.quality);
  expect(await page.evaluate(() => window.__nori?.look)).toBe(quality === "low" ? "plain" : "textured");
  // 木（NORI-26）：高画質は Blender の木、低画質は今の簡単な木
  await page.waitForFunction((q) => window.__nori?.trees === (q === "low" ? "simple" : "model"), quality, {
    timeout: 30_000,
  });
  // 子どもが旗を見て止まるときの見え方で測る：1つ目の駅まで走って止まる
  await driveToFirstStation(page);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: testInfo.outputPath(`stage2-look-${quality}.png`) });

  const points = await page.evaluate(() => {
    const m = window.__nori?.stationMarkers?.()[0];
    const s = (p?: { x: number; y: number; z: number }) =>
      p === undefined ? { x: 0, y: 0 } : (window.__nori?.screenOf(p.x, p.y, p.z) ?? { x: 0, y: 0 });
    return [s(m?.flag), s(m?.bed)];
  });
  // 画面の外の点は黒として測られ、比が大きく出てしまうので、2点とも画面の中にあることを先に確かめる
  const viewport = page.viewportSize() ?? { width: 0, height: 0 };
  for (const p of points) {
    expect(p.x).toBeGreaterThanOrEqual(2);
    expect(p.x).toBeLessThanOrEqual(viewport.width - 3);
    expect(p.y).toBeGreaterThanOrEqual(2);
    expect(p.y).toBeLessThanOrEqual(viewport.height - 3);
  }
  const [flag = 0, bed = 0] = await luminanceAt(page, points);
  const contrast = ratio(flag, bed);
  await testInfo.attach("contrast", {
    body: JSON.stringify({ quality, contrast, flag, bed, points }),
    contentType: "application/json",
  });
  expect(contrast).toBeGreaterThanOrEqual(MIN_CONTRAST);
  expect(errors).toEqual([]);
};

test("ステージ2：CPU を4倍遅くしても 30fps 以上", { tag: "@fps" }, async ({ page }) => {
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

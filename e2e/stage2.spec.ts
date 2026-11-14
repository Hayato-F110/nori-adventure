import { expect, type Page, test, type TestInfo } from "@playwright/test";
import { STAGE2, TRAIN } from "../src/config";
import { installTrainDriver } from "./driver";
import { attachShot, luminanceAt, ratio } from "./luminance";

// NORI-26：ステージ2（山道・列車）。テストの一覧の 7・8 と、見た目の完了条件（Jira）。
// ?stage=2 で開き、すすむで走って1つ目の駅（150 m）に止まると、上の表示の1つ目の旗に色が付く。
// 旗と土手の明るさの比 3 以上（高画質・低画質）。スクリーンショット・コンソールエラー・FPS。
const MIN_CONTRAST = 3; // LOOK.minStarContrast と同じ（ほし・ゴールと道）
const FIRST_STATION = STAGE2.stations[0] ?? 150;
const FAST = 20;
const skipFps = Boolean(process.env["NORI_SKIP_FPS"]);

const watchErrors = (page: Page) => {
  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  page.on("pageerror", (e) => errors.push(e.message));
  return errors;
};

/** 開いて、乗る列車を選ぶ（NORI-59。選ぶまで時間は進まない） */
const ready = async (page: Page, choice: string = "train") => {
  await page.goto("./?stage=2");
  await page.waitForFunction(() => (window.__nori?.frames ?? 0) > 5, undefined, { timeout: 60_000 });
  await expect(page.locator("#train-choice button")).toHaveCount(3);
  // 選ぶ前は時間が止まっている
  expect(await page.evaluate(() => window.__nori?.train?.()?.tick)).toBe(0);
  await page.locator(`#train-choice button[data-train="${choice}"]`).click();
  await expect(page.locator("#train-choice")).toBeHidden();
  expect(await page.evaluate(() => window.__nori?.trainChoice?.())).toBe(choice);
};

/**
 * NORI-69：1つ目の駅まで走って止まる運転役（page.goto の前に呼ぶ）。駅を1つだけ渡すので、止まったあとは入力 0 のまま。
 * 前は本物の時間でキーを押し、止まる位置が CI の遅さで変わった（NORI-67 と同じ種類）
 */
const installFirstStationDriver = (page: Page, stepsPerFrame?: number) =>
  installTrainDriver(page, {
    stations: [FIRST_STATION],
    brake: TRAIN.brakeDeceleration,
    closeEnough: STAGE2.stationStopLength / 4,
    slowSpeed: STAGE2.stationStopSpeed / 2,
    ...(stepsPerFrame === undefined ? {} : { stepsPerFrame }),
  });

/** 1つ目の駅に着いて止まった（nextStation が 1、速さ 0）のを、刻みで待つ */
const waitStoppedAtFirstStation = (page: Page) =>
  page.waitForFunction(
    () => {
      const s = window.__nori?.train?.();
      return s !== undefined && s.nextStation === 1 && Math.abs(s.train.speed) < 1e-6;
    },
    undefined,
    { timeout: 200_000, polling: 200 },
  );

const train = (page: Page) => page.evaluate(() => window.__nori?.train?.());

// どの列車を選んでも、同じ走り方で駅に止まれる（速さ・操作は同じ。NORI-59）
for (const choice of ["train", "train-commuter", "train-bullet"]) {
  test(`ステージ2（${choice}）：走って駅に止まると、上の表示の旗に色が付く`, async ({ page }, testInfo) => {
    await driveAndStop(page, testInfo, choice);
  });
}

// すれ違う電車・海辺・富士山風の山・雲（NORI-59）
test("ステージ2の景色：すれ違う電車が動き、海辺と遠くの山が見える", async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  const errors = watchErrors(page);
  await ready(page, "train-bullet");
  const a = await page.evaluate(() => window.__nori?.passingTrain?.());
  await page.waitForTimeout(1000);
  const b = await page.evaluate(() => window.__nori?.passingTrain?.());
  expect(Math.hypot((b?.x ?? 0) - (a?.x ?? 0), (b?.z ?? 0) - (a?.z ?? 0))).toBeGreaterThan(2);
  // Blender の山・駅に差しかわる
  await page.waitForFunction(() => (window.__nori?.landmarks?.().stations ?? 0) === 3, undefined, {
    timeout: 30_000,
  });
  expect((await page.evaluate(() => window.__nori?.landmarks?.()))?.mountains).toBeGreaterThan(10);
  await page.keyboard.down("ArrowUp");
  await page.waitForTimeout(6000);
  await page.keyboard.up("ArrowUp");
  await page.screenshot({ path: testInfo.outputPath("stage2-scenery.png") });
  expect(errors).toEqual([]);
});

const driveAndStop = async (page: Page, testInfo: TestInfo, choice: string) => {
  test.setTimeout(180_000);
  const errors = watchErrors(page);
  await installFirstStationDriver(page, FAST);
  await ready(page, choice);
  expect(await page.evaluate(() => window.__nori?.stage)).toBe(2);
  await expect(page.locator("#status")).toBeVisible();
  await expect(page.locator("#star-count")).toBeHidden(); // ほしは置かない
  await expect(page.locator("#wheel")).toBeHidden(); // ハンドルは効かない
  await expect(page.locator("#flags svg")).toHaveCount(3);
  await expect(page.locator("#flags svg.passed")).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath("01-start.png") });

  await waitStoppedAtFirstStation(page);
  await expect(page.locator("#flags svg.passed")).toHaveCount(1);
  const s = await train(page);
  expect(Math.abs((s?.train.distance ?? 0) - FIRST_STATION)).toBeLessThanOrEqual(6);
  await page.screenshot({ path: testInfo.outputPath("03-station.png") });
  expect(await page.evaluate(() => window.__nori?.carModel)).toBe("glb");
  expect(errors).toEqual([]);
};

for (const mode of ["高画質", "低画質"] as const) {
  test(`ステージ2の見た目（${mode}）：駅の旗が土手より目立つ`, async ({ page }, testInfo) => {
    test.setTimeout(150_000);
    await checkLook(page, testInfo, mode);
  });
}

const checkLook = async (page: Page, testInfo: TestInfo, mode: "高画質" | "低画質") => {
  const errors = watchErrors(page);
  await installFirstStationDriver(page);
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
  await waitStoppedAtFirstStation(page);
  // カメラが追いつくまで、ゲームの 1.5 秒（90 刻み）待つ
  const stoppedTick = await page.evaluate(() => window.__nori?.train?.()?.tick ?? 0);
  await page.waitForFunction((t) => (window.__nori?.train?.()?.tick ?? 0) >= t + 90, stoppedTick, {
    timeout: 60_000,
  });

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
  const shot = await attachShot(page, testInfo, `stage2-look-${quality}`);
  const [flag = 0, bed = 0] = await luminanceAt(page, points, shot);
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

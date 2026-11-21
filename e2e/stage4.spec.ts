import { expect, type Page, test, type TestInfo } from "@playwright/test";
import { STAGE4 } from "../src/config";
import {
  chooseQuality,
  expectGuideArrowOnScreen,
  openStage,
  waitFrames,
  waitLook,
  waitStarted,
  watchErrors,
} from "./common";
import {
  approachStopped,
  frozenAtTick,
  holdStartCover,
  installFreezeAtTickDriver,
  installSubApproachDriver,
  diveStopsAtLeast,
  installSubDiveDriver,
  releaseStartCover,
  startDriving,
} from "./driver";
import { attachShot, luminanceAt, peakLuminanceAt, ratio } from "./luminance";

// NORI-66 と同じ早送り：60 刻み/秒 ÷ CI の約 3 fps = 20 刻み/フレーム
const FAST = 20;

// NORI-28：ステージ4（海・潜水艇）。?stage=4 で開き、キーボードで生きもの（1匹目）へ操縦すると、上の表示の数が増える。
// たからばこと水の明るさの比 3 以上（高画質・低画質）。スクリーンショット・コンソールエラー・FPS。
const MIN_CONTRAST = 3; // LOOK.minStarContrast と同じ
const skipFps = Boolean(process.env["NORI_SKIP_FPS"]);

test("ステージ4：操縦して生きものに近づくと、上の表示の数が増える", async ({ page }, testInfo) => {
  test.setTimeout(180_000);
  const errors = watchErrors(page);
  // NORI-69：本物の時間でキーを押す代わりに、運転役＋早送りで1匹目に近づき、見つけた距離の内側で時間を止める
  await installSubApproachDriver(page, {
    creature: 0,
    above: 0,
    stopAt: 4, // STAGE4.discoverRadius 8 m より内側
    steerGain: 2,
    climbGain: 0.3,
    stepsPerFrame: FAST,
    waitForGo: true,
  });
  await openStage(page, "./?stage=4");
  expect(await page.evaluate(() => window.__nori?.stage)).toBe(4);
  await expect(page.locator("#star-count")).toHaveText("0");
  await expect(page.locator("#flags")).toBeHidden();
  // 海の生きもの7種類（見つける6種類＋群れの魚）が自作モデルに差し替わる
  await page.waitForFunction(() => window.__nori?.seaModels === 7, undefined, { timeout: 30_000 });
  await page.screenshot({ path: testInfo.outputPath("01-start.png") });

  await startDriving(page);
  await page.waitForFunction(approachStopped, undefined, { timeout: 150_000, polling: 200 });
  expect(await page.evaluate(() => window.__nori?.sub?.()?.found[0])).toBe(true);
  await expect(page.locator("#star-count")).toHaveText("1");
  await page.screenshot({ path: testInfo.outputPath("02-found.png") });
  expect(errors).toEqual([]);
});

// NORI-71：たからばこの上 9 m の点まで 16 m に近づいたら、運転役が時間を止めてから測る（テストの一覧 docs/test-plans/NORI-71.md の 4・5）。
// 前は 0.1 秒ごとにキーを押し、止まる位置が PC の速さで変わった。画質は自動の切り替えに頼らず、保存で決める
for (const [mode, quality] of [
  ["高画質", "high"],
  ["低画質", "low"],
] as const) {
  test(`ステージ4の見た目（${mode}）：たからばこが横の海底より目立つ`, async ({ page }, testInfo) => {
    test.setTimeout(180_000);
    await checkLook(page, testInfo, quality);
  });
}

const checkLook = async (page: Page, testInfo: TestInfo, quality: "high" | "low") => {
  const errors = watchErrors(page);
  // 魚の群れ・あわ・きらきらを止める（止めた時刻は実際の時刻なので、動いたままだと画面が毎回変わる）
  await page.emulateMedia({ reducedMotion: "reduce" });
  await chooseQuality(page, quality);
  await installSubApproachDriver(page, {
    creature: 0,
    target: "treasure",
    // たからばこの上 6 m を目指し、カメラからたからばこまで 16 m で止める（2026-11-14 オーナーの決定。
    // 上 9 m だと、カメラ 16 m ではたからばこが画面の下にはみ出す。計算は docs/test-plans/NORI-71.md「計算」）
    above: 6,
    stopAt: 0,
    cameraStops: [16],
    steerGain: 2,
    climbGain: 0.3,
    stepsPerFrame: FAST,
  });
  await openStage(page, "./?stage=4");
  await page.waitForFunction(approachStopped, undefined, { timeout: 120_000 });

  // 止まったあとの状態（一覧 4）：たからばこの上 9 m まで 16 m 以下。実際のカメラからの距離も残す
  const stopped = await page.evaluate(() => {
    const s = window.__nori?.sub?.();
    const t = window.__nori?.treasureMarker?.().treasure;
    const c = window.__nori?.cameraAt?.();
    if (!s || !t || !c) return null;
    return {
      tick: s.tick,
      sub: s.sub,
      toGoal: Math.hypot(t.x - s.sub.x, t.y + 6 - s.sub.y, t.z - s.sub.z),
      cameraToTreasure: Math.hypot(t.x - c.x, t.y - c.y, t.z - c.z),
    };
  });
  if (stopped === null) throw new Error("潜水艇・たからばこ・カメラが読めない");
  testInfo.annotations.push({ type: "止まった所", description: JSON.stringify(stopped) });
  expect(stopped.cameraToTreasure).toBeLessThanOrEqual(16);

  // 止まったあとに、潜水艇の GLB・海の生きもの7種類・素材を待つ（止めても描画は続く）
  await page.waitForFunction(() => window.__nori?.carModel === "glb", undefined, { timeout: 30_000 });
  await page.waitForFunction(() => window.__nori?.seaModels === 7, undefined, { timeout: 30_000 });
  await waitLook(page);
  expect(await page.evaluate(() => window.__nori?.quality)).toBe(quality);
  const frames = await page.evaluate(() => window.__nori?.frames ?? 0);
  await page.waitForFunction((n) => (window.__nori?.frames ?? 0) >= n + 2, frames, { timeout: 30_000 });

  const points = await page.evaluate(() => {
    const m = window.__nori?.treasureMarker?.();
    const s = (p?: { x: number; y: number; z: number }) =>
      p === undefined ? { x: 0, y: 0 } : (window.__nori?.screenOf(p.x, p.y, p.z) ?? { x: 0, y: 0 });
    return [s(m?.treasure), s(m?.water)];
  });
  // 画面の外の点は黒として測られ、比が大きく出てしまうので、2点とも画面の中にあることを先に確かめる
  const viewport = page.viewportSize() ?? { width: 0, height: 0 };
  for (const p of points) {
    expect(p.x).toBeGreaterThanOrEqual(2);
    expect(p.x).toBeLessThanOrEqual(viewport.width - 3);
    expect(p.y).toBeGreaterThanOrEqual(2);
    expect(p.y).toBeLessThanOrEqual(viewport.height - 3);
  }
  const shot = await attachShot(page, testInfo, `stage4-look-${quality}`);
  const [treasure = 0, seabed = 0] = await luminanceAt(page, points, shot);
  const contrast = ratio(treasure, seabed);
  await testInfo.attach("contrast", {
    body: JSON.stringify({ quality, contrast, treasure, seabed, points }),
    contentType: "application/json",
  });
  expect(contrast, JSON.stringify({ quality, treasure, seabed, points })).toBeGreaterThanOrEqual(
    MIN_CONTRAST,
  );
  expect(errors).toEqual([]);
};

// NORI-62：生きものの印（きらきら）も、まわりの水との明るさの比 3 以上（docs/game-rules.md「ステージ4」の見た目）。
// 灰色でいちばん水に近いエイ（1匹目から数えて2番目）のまわりで確かめる
// NORI-71 の掃引（2026-11-14）：カメラからたからばこまでの距離ごとの、たからばこと横の海底の明るさの比。
// 値を1回の掃引で表にして選ぶため（CLAUDE.md「数値は試行錯誤で決めない」）。ふだんは飛ばす（NORI_SWEEP=1 のときだけ）
for (const quality of ["high", "low"] as const) {
  test(`掃引：ステージ4（${quality}）のカメラからの距離とたからばこの比`, async ({ page }, testInfo) => {
    test.skip(!process.env["NORI_SWEEP"], "掃引は NORI_SWEEP=1 のときだけ");
    test.setTimeout(240_000);
    const STOPS = [26, 22, 19, 16] as const;
    await page.emulateMedia({ reducedMotion: "reduce" });
    await chooseQuality(page, quality);
    await installSubApproachDriver(page, {
      creature: 0,
      target: "treasure",
      above: 9,
      stopAt: 0,
      cameraStops: STOPS,
      steerGain: 2,
      climbGain: 0.3,
      stepsPerFrame: FAST,
    });
    await openStage(page, "./?stage=4");
    const rows: unknown[] = [];
    for (let k = 1; k <= STOPS.length; k++) {
      await page.waitForFunction(
        (n) => (globalThis as { __noriApproachStops?: number }).__noriApproachStops === n,
        k,
        { timeout: 120_000 },
      );
      await page.waitForFunction(() => window.__nori?.carModel === "glb", undefined, { timeout: 30_000 });
      await page.waitForFunction(() => window.__nori?.seaModels === 7, undefined, { timeout: 30_000 });
      await waitLook(page);
      const frames = await page.evaluate(() => window.__nori?.frames ?? 0);
      await page.waitForFunction((n) => (window.__nori?.frames ?? 0) >= n + 2, frames, { timeout: 30_000 });
      const info = await page.evaluate(() => {
        const m = window.__nori?.treasureMarker?.();
        const c = window.__nori?.cameraAt?.();
        const s = (p?: { x: number; y: number; z: number }) =>
          p === undefined ? { x: 0, y: 0 } : (window.__nori?.screenOf(p.x, p.y, p.z) ?? { x: 0, y: 0 });
        const t = m?.treasure;
        return {
          camera: t && c ? Math.hypot(t.x - c.x, t.y - c.y, t.z - c.z) : -1,
          points: [s(m?.treasure), s(m?.water)],
        };
      });
      const shot = await attachShot(page, testInfo, `sweep-${quality}-${k}`);
      const [treasure = 0, seabed = 0] = await luminanceAt(page, info.points, shot);
      rows.push({
        stop: STOPS[k - 1],
        camera: info.camera,
        treasure,
        seabed,
        contrast: ratio(treasure, seabed),
      });
      await page.evaluate(() => window.__nori?.freeze?.(false));
    }
    console.info(`SWEEP ${quality} ${JSON.stringify(rows)}`);
    await testInfo.attach("sweep", { body: JSON.stringify(rows), contentType: "application/json" });
  });
}

test("ステージ4の見た目：生きもの（エイ）のきらきらがまわりの水より目立つ", async ({ page }, testInfo) => {
  test.setTimeout(180_000);
  const errors = watchErrors(page);
  // きらきらの回転を止める（位置を読んでから撮るまでに、回ってずれないように）
  await page.emulateMedia({ reducedMotion: "reduce" });
  const RAY = 1;
  // NORI-67：エイの 6 m 上をめざし、14 m まで近づいた刻みで、運転役が時間を止める（運転役＋早送り。
  // CLAUDE.md「E2E は2種類に分ける」）。止まる位置は毎回同じで、PC の速さによらない
  await installSubApproachDriver(page, {
    creature: RAY,
    above: 6,
    stopAt: 14,
    steerGain: 2,
    climbGain: 0.3,
    stepsPerFrame: FAST,
  });
  await openStage(page, "./?stage=4");
  await page.waitForFunction(() => window.__nori?.seaModels === 7, undefined, { timeout: 30_000 });
  // 止まってから、2コマ描くのを待つ（止めたあとも描画は続く）
  await page.waitForFunction(approachStopped, undefined, { timeout: 120_000 });
  const stoppedAt = await page.evaluate(() => window.__nori?.sub?.()?.sub);
  testInfo.annotations.push({ type: "止まった潜水艇の位置", description: JSON.stringify(stoppedAt) });
  const frozenFrames = await page.evaluate(() => window.__nori?.frames ?? 0);
  await page.waitForFunction((n) => (window.__nori?.frames ?? 0) >= n + 2, frozenFrames, { timeout: 30_000 });
  // エイの横 6 m の水（きらきらの輪の外）と、きらきら 6 粒すべて。
  // 1粒だけを測ると、潜水艇の止まる位置しだいで、その粒が潜水艇の陰に入る（NORI-67。CI で比 2.27・1.37）。
  // 生きものの印が目立つかを見るので、いちばん明るく見える粒で確かめる。
  // 動きを減らす設定では輪が止まっているので、粒 k の角度は 2πk/6。半径は1粒目とエイの中心の距離
  const SPARKLES = 6; // STAGE4.sparkleCount と同じ
  const points = await page.evaluate(
    ({ i, n }) => {
      const c = window.__nori?.creatures?.()[i];
      const k = window.__nori?.sparkles?.()[i];
      if (!c || !k) return [];
      const s = (x: number, y: number, z: number) => window.__nori?.screenOf(x, y, z) ?? { x: 0, y: 0 };
      const r = Math.hypot(k.x - c.x, k.z - c.z);
      const a0 = Math.atan2(k.z - c.z, k.x - c.x);
      const ring = Array.from({ length: n }, (_, j) => {
        const a = a0 + (2 * Math.PI * j) / n;
        return s(c.x + Math.cos(a) * r, k.y, c.z + Math.sin(a) * r);
      });
      return [s(c.x + 6, c.y, c.z), ...ring];
    },
    { i: RAY, n: SPARKLES },
  );
  expect(points).toHaveLength(1 + SPARKLES);
  const viewport = page.viewportSize() ?? { width: 0, height: 0 };
  const onScreen = (p: { x: number; y: number }) =>
    p.x >= 12 && p.x <= viewport.width - 13 && p.y >= 12 && p.y <= viewport.height - 13;
  const [waterPoint = { x: 0, y: 0 }, ...ringPoints] = points;
  expect(onScreen(waterPoint)).toBe(true);
  const visible = ringPoints.filter(onScreen);
  expect(visible.length).toBeGreaterThan(0);
  // 落ちたときに CI の報告で画面を見られるようにする（NORI-67）。同じ1枚で測る（NORI-69）
  const ray = await attachShot(page, testInfo, "stage4-ray");
  const [water = 0] = await luminanceAt(page, [waterPoint], ray);
  // きらきらは小さい（約 20 px）ので、各粒のまわり 10 px でいちばん明るいところを測り、いちばん明るい粒を使う
  const peaks: number[] = [];
  for (const p of visible) peaks.push(await peakLuminanceAt(page, p, 10, ray));
  const sparkle = Math.max(...peaks);
  testInfo.annotations.push({
    type: "きらきらの明るさ（粒ごと）",
    description: JSON.stringify({ peaks, water }),
  });
  await page.evaluate(() => window.__nori?.freeze?.(false));
  const contrast = ratio(sparkle, water);
  expect(contrast, JSON.stringify({ sparkle, water, peaks, points })).toBeGreaterThanOrEqual(MIN_CONTRAST);
  expect(errors).toEqual([]);
});

test("ステージ4：CPU を4倍遅くしても 30fps 以上", { tag: "@fps" }, async ({ page }) => {
  test.skip(skipFps, "GPU のない CI では FPS を測らない");
  test.setTimeout(120_000);
  const cdp = await page.context().newCDPSession(page);
  await openStage(page, "./?stage=4");
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  await page.keyboard.down("ArrowLeft");
  const start = await page.evaluate(() => window.__nori?.fpsSamples.length ?? 0);
  await page.waitForFunction((n) => (window.__nori?.fpsSamples.length ?? 0) >= n + 6, start, {
    timeout: 60_000,
  });
  await page.keyboard.up("ArrowLeft");
  const samples = ((await page.evaluate(() => window.__nori?.fpsSamples)) ?? []).slice(start + 1);
  const average = samples.reduce((s, v) => s + v, 0) / Math.max(1, samples.length);
  expect(average).toBeGreaterThanOrEqual(30);
});

// NORI-33（docs/test-plans/NORI-33.md の 10）：近づき具合の棒と ▼ のヒントが、実際の画面で出る。
// ▼ のボタンはタッチの画面でだけ出るので、タブレット（1024×768・タッチ）で開く。運転役と早送りで、刻みの数で進める
test.describe("NORI-33：ステージ4の棒と ▼ のヒント", () => {
  test.use({ viewport: { width: 1024, height: 768 }, hasTouch: true, isMobile: true });

  test("近づくと棒がのび、真上の手前で ▼ に印が付き、潜ると消え、ゴールで棒がいっぱい", async ({
    page,
  }, testInfo) => {
    test.setTimeout(180_000);
    const errors = watchErrors(page);
    await installSubDiveDriver(page, {
      stopAtHorizontal: STAGE4.diveHintRange - 10,
      stopAtDepthGap: STAGE4.diveHintDepth,
      steerGain: 2,
      climbGain: 0.3,
      stepsPerFrame: FAST,
    });
    await holdStartCover(page);
    const fill = page.locator("#treasure-progress-fill");
    const fillWidth = async () => (await fill.boundingBox())?.width ?? 0;
    await page.goto("./?stage=4");
    await page.waitForFunction(() => (window.__nori?.frames ?? 0) > 5);
    // (a) 覆いを止めたまま（刻み 0）で、帯が見えていて棒の幅 0（R1-33-B）
    expect(await page.evaluate(() => window.__nori?.sub?.()?.tick)).toBe(0);
    await expect(page.locator("#treasure-progress")).toBeVisible();
    expect(await fillWidth()).toBeLessThanOrEqual(1);
    await expect(page.locator("#back")).not.toHaveAttribute("data-hint", "on");
    await releaseStartCover(page);
    await waitStarted(page);

    // (b) 深さを変えずに近づき、水平の距離が diveHintRange − 10 m を切ったところで止まる
    await page.waitForFunction(diveStopsAtLeast, 1, { timeout: 150_000, polling: 200 });
    await expect(page.locator("#back")).toHaveAttribute("data-hint", "on");
    expect(await fillWidth()).toBeGreaterThan(1);
    // 光り方は実際の時刻で回るので、動きを減らす設定（金色のまま止まる）にして撮る（R1-33-K）
    await page.emulateMedia({ reducedMotion: "reduce" });
    await waitFrames(page, 5);
    await attachShot(page, testInfo, "stage4-hint");
    await page.emulateMedia({ reducedMotion: "no-preference" });

    // (c) 再開して潜り、深さの差が diveHintDepth を切った刻みで運転役がもう一度止める。
    // まだゴールしていないのに印が消えている（「ゴールのあとは出さない」と分けて、深さの条件を確かめる。R2-33-B）
    await page.evaluate(() => window.__nori?.freeze?.(false));
    await page.waitForFunction(diveStopsAtLeast, 2, { timeout: 150_000, polling: 200 });
    expect(await page.evaluate(() => window.__nori?.sub?.()?.finishTick)).toBeNull();
    await expect(page.locator("#back")).not.toHaveAttribute("data-hint", "on");

    // (d) 再開してゴールしたあと、棒は progressBarWidth（±1）のまま（R1-33-C）
    await page.evaluate(() => window.__nori?.freeze?.(false));
    await page.waitForFunction(() => window.__nori?.sub?.()?.finishTick != null, undefined, {
      timeout: 150_000,
      polling: 200,
    });
    await expect.poll(fillWidth).toBeGreaterThanOrEqual(STAGE4.progressBarWidth - 1);
    expect(await fillWidth()).toBeLessThanOrEqual(STAGE4.progressBarWidth + 1);
    expect(errors).toEqual([]);
  });
});

// NORI-33（docs/test-plans/NORI-33.md の 16）：スタートの画面に、目指すものの手がかり（たからばこの矢印・帯・あわ）が映る。
// 入力 0 の運転役で始め、刻み 30（0.5 秒）で時間を止める（1 コマ 1 刻みなので、PC の速さによらず止まる刻みは同じ）。
// 矢印が見えていて、その位置が画面の中にあることを読み取り口で確かめてから撮る（R3-33-C）
test.describe("NORI-33：ステージ4のスタートの手がかり", () => {
  test.use({ viewport: { width: 1024, height: 768 }, hasTouch: true, isMobile: true });

  test("スタートで、たからばこの矢印が見えていて画面の中にある（画面を撮る）", async ({ page }, testInfo) => {
    test.setTimeout(120_000);
    const errors = watchErrors(page);
    await installFreezeAtTickDriver(page, 30);
    await openStage(page, "./?stage=4", { look: true });
    await page.waitForFunction(frozenAtTick, undefined, { timeout: 60_000, polling: 100 });
    await waitFrames(page, 5);
    expect(await page.evaluate(() => window.__nori?.sub?.()?.tick)).toBe(31);
    await expectGuideArrowOnScreen(page);
    await attachShot(page, testInfo, "stage4-start-guide");
    expect(errors).toEqual([]);
  });
});

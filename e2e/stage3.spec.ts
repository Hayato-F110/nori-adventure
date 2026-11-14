import { expect, type Page, test, type TestInfo } from "@playwright/test";
import { QUALITY_STORAGE_KEY } from "../src/render/quality";
import {
  approachStopped,
  installPlaneApproachDriver,
  installPlaneDriver,
  installSkyPlaneDriver,
  startDriving,
} from "./driver";
import { attachShot, luminanceAt, ratio } from "./luminance";

const FAST = 20; // stage-clear.spec.ts と同じ早送り

// NORI-27：ステージ3（空・飛行機）。テストの一覧の 10 と、見た目の完了条件（Jira）。
// ?stage=3 で開き、キーボードで1つ目の輪へ操縦してくぐると、上の表示の数が増える。
// 輪と空の明るさの比 3 以上（高画質・低画質）。スクリーンショット・コンソールエラー・FPS。
const MIN_CONTRAST = 3; // LOOK.minStarContrast と同じ（ほし・ゴールと背景）
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
  await page.goto("./?stage=3");
  await page.waitForFunction(() => (window.__nori?.frames ?? 0) > 5, undefined, { timeout: 60_000 });
};

test("ステージ3：操縦して輪をくぐると、上の表示の数が増える", async ({ page }, testInfo) => {
  test.setTimeout(180_000);
  const errors = watchErrors(page);
  // NORI-69：本物の時間でキーを押す代わりに、運転役＋早送りで1つ目の輪をくぐり、くぐったら手を離す
  await installPlaneDriver(page, {
    steerGain: 2,
    climbGain: 0.2,
    stepsPerFrame: FAST,
    waitForGo: true,
    releaseAfterRings: 1,
  });
  await ready(page);
  expect(await page.evaluate(() => window.__nori?.stage)).toBe(3);
  await expect(page.locator("#star-count")).toHaveText("0");
  await expect(page.locator("#flags")).toBeHidden(); // 旗は使わない
  await page.screenshot({ path: testInfo.outputPath("01-start.png") });

  await startDriving(page);
  // 輪をくぐった数と上の表示が同じになることを、同じ瞬間に（ブラウザの中で）比べる
  await page.waitForFunction(
    () => {
      const s = window.__nori?.plane?.();
      return s?.rings[0] === true && document.querySelector("#star-count")?.textContent === "1";
    },
    undefined,
    { timeout: 150_000, polling: 100 },
  );
  await page.screenshot({ path: testInfo.outputPath("02-ring.png") });

  // 手を離すと水平に戻る（約 0.6 秒）。ゲームの 1.5 秒（90 刻み）待つ
  const ringTick = await page.evaluate(() => window.__nori?.plane?.()?.tick ?? 0);
  await page.waitForFunction((t) => (window.__nori?.plane?.()?.tick ?? 0) >= t + 90, ringTick, {
    timeout: 60_000,
  });
  const s = await page.evaluate(() => window.__nori?.plane?.());
  expect(Math.abs(s?.plane.bank ?? 1)).toBeLessThan(1e-6);
  expect(Math.abs(s?.plane.pitch ?? 1)).toBeLessThan(1e-6);
  expect(await page.evaluate(() => window.__nori?.carModel)).toBe("glb");
  expect(errors).toEqual([]);
});

// NORI-71：見た目は、運転役が1刻み目から操縦し、輪まで 60 m で手を離して水平に戻ったら時間を止めてから測る
// （前は 0.1 秒ごとにキーを押し、止まる位置が PC の速さで変わった）。画質は自動の切り替えに頼らず、保存で決める。
// テストの一覧 docs/test-plans/NORI-71.md の 1〜3
const LOOK_CASES = [
  ["高画質", "high", "2つ目の輪", 1],
  ["高画質", "high", "ゴールの輪", -1],
  ["低画質", "low", "2つ目の輪", 1],
  ["低画質", "low", "ゴールの輪", -1],
] as const;

for (const [mode, quality, name, ring] of LOOK_CASES) {
  test(`ステージ3の見た目（${mode}）：${name}が空より目立つ`, async ({ page }, testInfo) => {
    test.setTimeout(150_000);
    await checkLook(page, testInfo, quality, ring);
  });
}

/** 選んだ画質を保存して開く（e2e/quality.spec.ts と同じ口）。自動の切り替えに頼らない */
const chooseQuality = (page: Page, quality: "high" | "low") =>
  page.addInitScript((o) => window.localStorage.setItem(o.name, o.value), {
    name: QUALITY_STORAGE_KEY,
    value: quality,
  });

const checkLook = async (page: Page, testInfo: TestInfo, quality: "high" | "low", ring: number) => {
  const errors = watchErrors(page);
  await chooseQuality(page, quality);
  await installPlaneApproachDriver(page, {
    ring,
    releaseAt: 60,
    steerGain: 2,
    climbGain: 0.2,
    stepsPerFrame: FAST,
  });
  await ready(page);
  await page.waitForFunction(approachStopped, undefined, { timeout: 120_000 });

  // 止まったあとの状態（一覧 2）：水平、輪まで 60 m 以下、まだくぐっていない
  const stopped = await page.evaluate((k) => {
    const s = window.__nori?.plane?.();
    const all = window.__nori?.rings?.() ?? [];
    const r = all[k < 0 ? all.length - 1 : k];
    const g = globalThis as { __noriApproachStoppedTick?: number };
    return s && r
      ? {
          tick: s.tick,
          stoppedTick: g.__noriApproachStoppedTick,
          plane: s.plane,
          distance: Math.hypot(r.x - s.plane.x, r.z - s.plane.z),
          // 輪が機体の前にあるか（カメラの後ろの点も、計算では画面の中の座標になるため）
          ahead:
            (r.x - s.plane.x) * -Math.sin(s.plane.heading) + (r.z - s.plane.z) * -Math.cos(s.plane.heading) >
            0,
          passed: k < 0 ? s.finishTick !== null : (s.rings[k] ?? false),
        }
      : null;
  }, ring);
  if (stopped === null) throw new Error("飛行機か輪が読めない");
  testInfo.annotations.push({ type: "止まった所", description: JSON.stringify(stopped) });
  expect(Math.abs(stopped.plane.bank)).toBeLessThan(1e-6);
  expect(Math.abs(stopped.plane.pitch)).toBeLessThan(1e-6);
  expect(stopped.distance).toBeLessThanOrEqual(60);
  expect(stopped.ahead).toBe(true);
  expect(stopped.passed).toBe(false);

  // 止まったあとに、モデル・素材（高画質は山の木も）を待つ。止めても描画は続くので、止まった画面に出る
  await page.waitForFunction(() => window.__nori?.carModel === "glb", undefined, { timeout: 30_000 });
  await page.waitForFunction(() => window.__nori?.look !== "loading", undefined, { timeout: 60_000 });
  if (quality === "high") {
    await page.waitForFunction(() => window.__nori?.trees === "model", undefined, { timeout: 30_000 });
  }
  expect(await page.evaluate(() => window.__nori?.quality)).toBe(quality);
  expect(await page.evaluate(() => window.__nori?.look)).toBe(quality === "low" ? "plain" : "textured");

  // 止めている間（一覧 1）：2 コマ描いても刻みと輪の画面の位置が同じ。FPS の記録は増え続ける
  const at = () =>
    page.evaluate((k) => {
      const m = window.__nori?.ringMarker?.(k);
      const p = m === undefined ? undefined : window.__nori?.screenOf(m.ring.x, m.ring.y, m.ring.z);
      return {
        tick: window.__nori?.plane?.()?.tick,
        frames: window.__nori?.frames ?? 0,
        p,
        fps: window.__nori?.fpsSamples.length ?? 0,
      };
    }, ring);
  const a = await at();
  await page.waitForFunction((f) => (window.__nori?.frames ?? 0) >= f + 2, a.frames, { timeout: 30_000 });
  const b = await at();
  expect(b.tick).toBe(a.tick);
  expect(b.p).toEqual(a.p);
  await page.waitForFunction((n) => (window.__nori?.fpsSamples.length ?? 0) > n, a.fps, { timeout: 30_000 });

  const points = await page.evaluate((k) => {
    const m = window.__nori?.ringMarker?.(k);
    const s = (p?: { x: number; y: number; z: number }) =>
      p === undefined ? { x: 0, y: 0 } : (window.__nori?.screenOf(p.x, p.y, p.z) ?? { x: 0, y: 0 });
    return [s(m?.ring), s(m?.sky)];
  }, ring);
  // 画面の外の点は黒として測られ、比が大きく出てしまうので、2点とも画面の中にあることを先に確かめる
  const viewport = page.viewportSize() ?? { width: 0, height: 0 };
  for (const p of points) {
    expect(p.x).toBeGreaterThanOrEqual(2);
    expect(p.x).toBeLessThanOrEqual(viewport.width - 3);
    expect(p.y).toBeGreaterThanOrEqual(2);
    expect(p.y).toBeLessThanOrEqual(viewport.height - 3);
  }
  const shot = await attachShot(page, testInfo, `stage3-look-${quality}-ring${ring}`);
  const [ringLum = 0, sky = 0] = await luminanceAt(page, points, shot);
  const contrast = ratio(ringLum, sky);
  await testInfo.attach("contrast", {
    body: JSON.stringify({ quality, ring, contrast, ring_luminance: ringLum, sky, points }),
    contentType: "application/json",
  });
  expect(contrast).toBeGreaterThanOrEqual(MIN_CONTRAST);

  // 再開すると刻みがまた進む（一覧 1）
  await page.evaluate(() => window.__nori?.freeze?.(false));
  await page.waitForFunction((t) => (window.__nori?.plane?.()?.tick ?? 0) > t, b.tick ?? 0, {
    timeout: 30_000,
  });
  expect(errors).toEqual([]);
};

// NORI-60：空をにぎやかに。ほかの飛行機（自作の形の色違い）・ただよう気球・鳥・山のふもとの木（高画質は Blender の木）
// NORI-71：キーと実際の時間をやめ、運転役で回して止めて撮る（一覧 6）。1枚目は左へ 150 刻み回して止める。
// 再開したら1機目のほかの飛行機へ向かい、向き 0.1 rad・高さ 3 m・距離が霧の始まり 180 m 未満になったら止める
test("ステージ3の景色：ほかの飛行機・気球・鳥・木がある", async ({ page }, testInfo) => {
  test.setTimeout(150_000);
  const errors = watchErrors(page);
  await installSkyPlaneDriver(page, {
    turnTicks: 150,
    angle: 0.1,
    height: 3,
    distance: 180,
    steerGain: 2,
    climbGain: 0.2,
    stepsPerFrame: FAST,
  });
  await ready(page);
  const phase = (n: number) =>
    page.waitForFunction((k) => (globalThis as { __noriSkyPhase?: number }).__noriSkyPhase === k, n, {
      timeout: 120_000,
    });
  await phase(1);
  await page.waitForFunction(() => window.__nori?.look !== "loading", undefined, { timeout: 60_000 });
  await page.waitForFunction(() => window.__nori?.skyScenery?.().planeModel === "glb", undefined, {
    timeout: 30_000,
  });
  const scenery = await page.evaluate(() => window.__nori?.skyScenery?.());
  expect(scenery).toMatchObject({ planes: 3, planeModel: "glb", balloons: 4, birds: 24 });
  if ((await page.evaluate(() => window.__nori?.quality)) === "high") {
    await page.waitForFunction(() => window.__nori?.trees === "model", undefined, { timeout: 30_000 });
  }
  // 1枚目：少し左へ回って、山と木・ほかの飛行機の見える方（値は確かめない）
  await attachShot(page, testInfo, "stage3-scenery");

  // 2枚目：再開して、1機目のほかの飛行機へ向かって止まる
  await page.evaluate(() => window.__nori?.freeze?.(false));
  await phase(2);
  const info = await page.evaluate(() => {
    const p = window.__nori?.plane?.()?.plane;
    const o = window.__nori?.skyScenery?.().planeAt[0];
    if (p === undefined || o === undefined) return null;
    return { p, o, s: window.__nori?.screenOf(o.x, o.y, o.z) ?? { x: -1, y: -1 } };
  });
  if (info === null) throw new Error("飛行機が読めない");
  const { p, o, s } = info;
  testInfo.annotations.push({
    type: "止まった所",
    description: JSON.stringify({ distance: Math.hypot(o.x - p.x, o.y - p.y, o.z - p.z), dy: o.y - p.y, s }),
  });
  await attachShot(page, testInfo, "stage3-other-plane");
  const vp = page.viewportSize() ?? { width: 0, height: 0 };
  const ahead = (o.x - p.x) * -Math.sin(p.heading) + (o.z - p.z) * -Math.cos(p.heading) > 0;
  expect(ahead).toBe(true);
  expect(s.x).toBeGreaterThan(100);
  expect(s.x).toBeLessThan(vp.width - 100);
  expect(s.y).toBeGreaterThan(80);
  expect(s.y).toBeLessThan(vp.height - 80);
  expect(errors).toEqual([]);
});

test("ステージ3：CPU を4倍遅くしても 30fps 以上", { tag: "@fps" }, async ({ page }) => {
  test.skip(skipFps, "GPU のない CI では FPS を測らない");
  test.setTimeout(120_000);
  const cdp = await page.context().newCDPSession(page);
  await ready(page);
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

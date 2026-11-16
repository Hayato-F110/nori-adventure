import { expect, type Page, test, type TestInfo } from "@playwright/test";
import { LOOK, SIM, STAGE2, TRAIN } from "../src/config";
import { createStage2Game } from "../src/core/stage2";
import { offsetOnTrack, passingTrainDistance } from "../src/core/stage2Layout";
import { wrapDistance } from "../src/core/track";
import { QUALITY_STORAGE_KEY } from "../src/render/quality";
import { installTrainDriver } from "./driver";
import { attachShot, luminanceAt, ratio } from "./luminance";

// NORI-26：ステージ2（山道・列車）。テストの一覧の 7・8 と、見た目の完了条件（Jira）。
// ?stage=2 で開き、すすむで走って1つ目の駅（150 m）に止まると、上の表示の1つ目の旗に色が付く。
// 旗と土手の明るさの比 3 以上（高画質・低画質）。スクリーンショット・コンソールエラー・FPS。
const MIN_CONTRAST = LOOK.minStarContrast; // ほし・ゴールと道（値は src/config から。/code-review の指摘）
const FIRST_STATION = STAGE2.stations[0] ?? 150;
const FAST = 20;
// NORI-73（2026-11-16）：見た目のテストは高画質で描くので 1 コマが重い（遅い CI で約 1.6 秒）。描くコマを減らすため、駅までを 60 刻み/コマで走る
const LOOK_FAST = 60;
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
  await page.waitForFunction(
    () => (window.__nori?.frames ?? 0) > 5 && window.__nori?.cover?.state === "gone",
    undefined,
    { timeout: 60_000 },
  );
  await expect(page.locator("#train-choice button")).toHaveCount(3);
  // 選ぶ前は時間が止まっている
  expect(await page.evaluate(() => window.__nori?.train?.()?.tick)).toBe(0);
  await page.locator(`#train-choice button[data-train="${choice}"]`).click();
  const clickedAt = Date.now();
  await expect(page.locator("#train-choice")).toBeHidden();
  expect(await page.evaluate(() => window.__nori?.trainChoice?.())).toBe(choice);
  return clickedAt;
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

// すれ違う電車・海辺・富士山風の山・雲（NORI-59）。
// NORI-74：前は実際の 1 秒で 2 m より多く動くかを見ていて、遅い CI で落ちた。運転役＋早送りで進め、刻みの数で確かめる。
// テストの一覧は docs/test-plans/NORI-74.md（1・3）
test("ステージ2の景色：すれ違う電車が刻みに合わせて逆向きに動き、海辺と遠くの山が見える", async ({
  page,
}, testInfo) => {
  test.setTimeout(240_000);
  const errors = watchErrors(page);
  await installFirstStationDriver(page, FAST);
  await ready(page, "train-bullet");
  /** 読み取り口を1回読む。描いた刻み・距離がなければ落とす（NORI-74 の前は位置だけを返していた） */
  const passing = async () => {
    const p = await page.evaluate(() => window.__nori?.passingTrain?.());
    if (p?.tick === undefined || p.distance === undefined) {
      throw new Error(`passingTrain() が描いた刻み・線路の上の距離を返さない：${JSON.stringify(p)}`);
    }
    return { x: p.x, z: p.z, tick: p.tick, distance: p.distance };
  };

  // 一覧 1：読み取り口が返す「描いた刻み」だけを使う（train().tick とは1刻みほどずれる。一覧の前提 2）
  const a = await passing();
  await page.waitForFunction((from) => (window.__nori?.passingTrain?.()?.tick ?? -1) >= from + 60, a.tick, {
    timeout: 60_000,
    polling: 100,
  });
  const b = await passing();
  const { track } = createStage2Game();
  const L = track.length;
  for (const p of [a, b]) {
    // ① 距離が、その刻みの式どおり（読み取り口が、描いた刻みと距離をそのまま返している）
    expect(Math.abs(p.distance - passingTrainDistance(L, p.tick))).toBeLessThan(1e-6);
    // ③ 位置（x, z）が、距離から線路の左 STAGE2.passingOffset に計算した点（高さは RAIL_TOP を足すので比べない）
    const want = offsetOnTrack(track, p.distance, -STAGE2.passingOffset);
    expect(Math.hypot(p.x - want.x, p.z - want.z)).toBeLessThan(1e-3);
  }
  // ② 刻みの差 Δ のあいだに、逆向きに STAGE2.passingSpeed × Δ × fixedDt 進んだ（差を −L/2〜L/2 に収めて比べる）
  const dt = b.tick - a.tick;
  expect(dt).toBeGreaterThanOrEqual(60);
  const gap = a.distance - b.distance - STAGE2.passingSpeed * dt * SIM.fixedDt;
  expect(Math.abs(wrapDistance(gap + L / 2, L) - L / 2)).toBeLessThan(1e-6);
  testInfo.annotations.push({
    type: "すれ違う電車",
    description: `刻み ${a.tick.toFixed(2)} → ${b.tick.toFixed(2)}（差 ${dt.toFixed(2)}）、距離 ${a.distance.toFixed(3)} → ${b.distance.toFixed(3)} m`,
  });

  // 一覧 3：Blender の山・駅、すれ違う電車の GLB に差しかわる
  await page.waitForFunction(() => (window.__nori?.landmarks?.().stations ?? 0) === 3, undefined, {
    timeout: 30_000,
  });
  expect((await page.evaluate(() => window.__nori?.landmarks?.()))?.mountains).toBeGreaterThan(10);
  await page.waitForFunction(() => window.__nori?.passingModel === "glb", undefined, { timeout: 30_000 });
  // 運転役で1つ目の駅まで走って止まってから撮る（↑ を実際の 6 秒押す形をやめた）
  await waitStoppedAtFirstStation(page);
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

// NORI-73：前は画質を CPU を 20 倍遅くして自動で下げ（実際の時間で最大 90 秒）、駅まで早送りなしで走った。
// 遅い CI で上限 150 秒をこえて落ちた。画質は保存して選び（ステージ3の見た目と同じ）、駅までは早送りで走る。
// 明るさは止まったあとの画面で測るので、早送りで測る 2 点の位置は変わらない。テストの一覧は docs/test-plans/NORI-73.md
for (const [mode, quality] of [
  ["高画質", "high"],
  ["低画質", "low"],
] as const) {
  test(`ステージ2の見た目（${mode}）：駅の旗が土手より目立つ`, async ({ page }, testInfo) => {
    test.setTimeout(150_000);
    await checkLook(page, testInfo, quality);
  });
}

/** 選んだ画質を保存して開く（e2e/quality.spec.ts と同じ口）。自動の切り替えに頼らない */
const chooseQuality = (page: Page, quality: "high" | "low") =>
  page.addInitScript((o) => window.localStorage.setItem(o.name, o.value), {
    name: QUALITY_STORAGE_KEY,
    value: quality,
  });

/** 刻みとコマの数を、同じ 1 回の evaluate で読む（間にコマが入らない） */
const tickAndFrames = (page: Page) =>
  page.evaluate(() => ({ tick: window.__nori?.train?.()?.tick ?? 0, frames: window.__nori?.frames ?? 0 }));

const checkLook = async (page: Page, testInfo: TestInfo, quality: "high" | "low") => {
  const errors = watchErrors(page);
  await chooseQuality(page, quality);
  // 運転役の早送りと一覧 2 の確かめを、同じ LOOK_FAST から決める（/code-review の指摘）
  await installFirstStationDriver(page, LOOK_FAST);
  const startedAt = Date.now();
  const since = (t: number = Date.now()) => (t - startedAt) / 1000;
  // NORI-73（R4-73-2）：列車を選んだ時刻と、from・to を読んだ時刻を記録に残し、1 コマの実際の秒を出せるようにする
  const clickedAt = since(await ready(page));
  // 一覧 2：選ぶ前の刻み 0 のコマを数えに入れないよう、刻みが 1 以上になってから読む
  await page.waitForFunction(() => (window.__nori?.train?.()?.tick ?? 0) >= 1, undefined, {
    timeout: 60_000,
  });
  const from = await tickAndFrames(page);
  const fromAt = since();
  // 見た目・木・止まるのを待つ間に上限で切れても秒が残るように、走り出した時点の記録を先に添付する（/code-review の指摘）
  await testInfo.attach("progress", {
    body: JSON.stringify({ quality, clickedAt, fromAt, from }),
    contentType: "application/json",
  });
  // 一覧 1：選んだ画質のまま（CI でも高画質の版が高画質で測る）
  expect(await page.evaluate(() => window.__nori?.quality)).toBe(quality);
  // NORI-76：覆いが外れてから測る
  await page.waitForFunction(
    () => window.__nori?.look !== "loading" && window.__nori?.cover?.state === "gone",
    undefined,
    { timeout: 60_000 },
  );
  expect(await page.evaluate(() => window.__nori?.look)).toBe(quality === "low" ? "plain" : "textured");
  // 木（NORI-26）：高画質は Blender の木、低画質は今の簡単な木
  await page.waitForFunction((q) => window.__nori?.trees === (q === "low" ? "simple" : "model"), quality, {
    timeout: 30_000,
  });
  // 子どもが旗を見て止まるときの見え方で測る：1つ目の駅まで走って止まる
  await waitStoppedAtFirstStation(page);
  // 止まったと分かった時刻（列車は見た目・木を待つ間にも走るので、止まった時刻そのものではない）
  const stoppedAt = since();
  const to = await tickAndFrames(page);
  const toAt = since();
  const frames = Math.max(1, to.frames - from.frames);
  const perFrame = (to.tick - from.tick) / frames;
  const stopped = await train(page);
  expect(Math.abs((stopped?.train.distance ?? 0) - FIRST_STATION)).toBeLessThanOrEqual(6);
  // カメラが追いつくまで、ゲームの 90 刻み以上待つ。早送り 60 では 2 コマ（120 刻み・ゲームの 2 秒）になる。
  // カメラはコマの秒で寄せるので、残りのずれは止まってからのゲームの秒で決まる（NORI-73 の前提 6）
  await page.waitForFunction((t) => (window.__nori?.train?.()?.tick ?? 0) >= t + 90, to.tick, {
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
  // 撮影のすぐ前後で刻みを読み、すれ違う電車が線路の上でカメラと旗の間にいないことを確かめる（一覧 1・計算）
  const before = (await tickAndFrames(page)).tick;
  const shot = await attachShot(page, testInfo, `stage2-look-${quality}`);
  const after = (await tickAndFrames(page)).tick;
  const shotAt = since();
  const { track } = createStage2Game();
  const camera = (stopped?.train.distance ?? FIRST_STATION) - STAGE2.cameraDistance;
  const flagEnd = FIRST_STATION + STAGE2.stationStopLength / 2;
  // 承認した一覧 1 のとおり、撮影のすぐ前後の刻みで確かめる（撮影の間のすべての刻みを見る形は、速い PC で
  // 線路のほとんどを見ることになり、撮った 1 コマと関係なく落ちるので採らない。根本は、決めた刻みで止めて撮ること）
  const passing = [before, after].map((t) => passingTrainDistance(track.length, t));
  const [flag = 0, bed = 0] = await luminanceAt(page, points, shot);
  const contrast = ratio(flag, bed);
  const record = {
    quality,
    contrast,
    flag,
    bed,
    points,
    perFrame,
    clickedAt,
    fromAt,
    stoppedAt,
    toAt,
    shotAt,
    // 1 コマの実際の秒と、止まってから撮るまでの実際の秒（NORI-73 の計算と照らし合わせる）
    secondsPerFrame: (toAt - fromAt) / frames,
    stopToShot: shotAt - stoppedAt,
    stopDistance: stopped?.train.distance,
    from,
    to,
    before,
    after,
    passing,
  };
  await testInfo.attach("contrast", { body: JSON.stringify(record), contentType: "application/json" });
  // 一覧 2：早送りが効いている（1 コマ 60 刻み。早送りなしは 5 刻み以下、前の 20 では 20）
  expect(perFrame, JSON.stringify(record)).toBeGreaterThanOrEqual(LOOK_FAST - 1);
  for (const d of passing) {
    expect(
      d >= camera - 2 && d <= flagEnd + 2,
      `すれ違う電車がカメラと旗の間：${JSON.stringify(record)}`,
    ).toBe(false);
  }
  expect(contrast, JSON.stringify(record)).toBeGreaterThanOrEqual(MIN_CONTRAST);
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

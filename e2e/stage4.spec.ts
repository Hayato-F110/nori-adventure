import { expect, type Page, test, type TestInfo } from "@playwright/test";
import { luminanceAt, peakLuminanceAt, ratio } from "./luminance";

// NORI-28：ステージ4（海・潜水艇）。?stage=4 で開き、キーボードで生きもの（1匹目）へ操縦すると、上の表示の数が増える。
// たからばこと水の明るさの比 3 以上（高画質・低画質）。スクリーンショット・コンソールエラー・FPS。
const MIN_CONTRAST = 3; // LOOK.minStarContrast と同じ
const skipFps = Boolean(process.env["NORI_SKIP_FPS"]);

type P3 = { x: number; y: number; z: number };

const watchErrors = (page: Page) => {
  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  page.on("pageerror", (e) => errors.push(e.message));
  return errors;
};

const ready = async (page: Page) => {
  await page.goto("./?stage=4");
  await page.waitForFunction(() => (window.__nori?.frames ?? 0) > 5, undefined, { timeout: 60_000 });
};

const setKeys = async (page: Page, held: Set<string>, want: Set<string>) => {
  for (const k of held) if (!want.has(k)) await page.keyboard.up(k);
  for (const k of want) if (!held.has(k)) await page.keyboard.down(k);
  held.clear();
  for (const k of want) held.add(k);
};

/**
 * 目標（毎回読み直す）へ向けて操縦する（0.1 秒ごとに位置を読み、←→ と ↑↓ を押す）。
 * done() が true になるか、目標まで stopAt m に近づいたら終わる
 */
const steerTo = async (
  page: Page,
  read: () => Promise<{ sub: P3 & { heading: number }; goal: P3; done: boolean } | null>,
  stopAt = 0,
) => {
  const held = new Set<string>();
  for (let i = 0; i < 900; i++) {
    const info = await read();
    if (info === null || info.done) break;
    const { sub: p, goal: g } = info;
    if (stopAt > 0 && Math.hypot(g.x - p.x, g.y - p.y, g.z - p.z) <= stopAt) break;
    const want = Math.atan2(-(g.x - p.x), -(g.z - p.z));
    const diff = Math.atan2(Math.sin(want - p.heading), Math.cos(want - p.heading));
    const keys = new Set<string>();
    if (diff < -0.04) keys.add("ArrowRight");
    if (diff > 0.04) keys.add("ArrowLeft");
    if (g.y - p.y > 0.8) keys.add("ArrowUp");
    if (g.y - p.y < -0.8) keys.add("ArrowDown");
    await setKeys(page, held, keys);
    await page.waitForTimeout(100);
  }
  await setKeys(page, held, new Set());
};

test("ステージ4：操縦して生きものに近づくと、上の表示の数が増える", async ({ page }, testInfo) => {
  test.setTimeout(180_000);
  const errors = watchErrors(page);
  await ready(page);
  expect(await page.evaluate(() => window.__nori?.stage)).toBe(4);
  await expect(page.locator("#star-count")).toHaveText("0");
  await expect(page.locator("#flags")).toBeHidden();
  // 海の生きもの7種類（見つける6種類＋群れの魚）が自作モデルに差し替わる
  await page.waitForFunction(() => window.__nori?.seaModels === 7, undefined, { timeout: 30_000 });
  await page.screenshot({ path: testInfo.outputPath("01-start.png") });

  await steerTo(page, () =>
    page.evaluate(() => {
      const s = window.__nori?.sub?.();
      const c = window.__nori?.creatures?.()[0];
      return s && c ? { sub: s.sub, goal: c, done: s.found[0] ?? false } : null;
    }),
  );
  await page.waitForFunction(() => window.__nori?.sub?.()?.found[0] === true, undefined, { timeout: 10_000 });
  await expect(page.locator("#star-count")).toHaveText("1");
  await page.screenshot({ path: testInfo.outputPath("02-found.png") });
  expect(errors).toEqual([]);
});

for (const mode of ["高画質", "低画質"] as const) {
  test(`ステージ4の見た目（${mode}）：たからばこが水より目立つ`, async ({ page }, testInfo) => {
    test.setTimeout(240_000);
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
  // たからばこへ向けて操縦し、たからばこの上の点まで 16 m に近づいたところで測る（霧の中でも見える距離）
  await steerTo(
    page,
    () =>
      page.evaluate(() => {
        const s = window.__nori?.sub?.();
        const m = window.__nori?.treasureMarker?.();
        // たからばこの上 9 m をめざす（真後ろからだと、たからばこが潜水艇の陰に隠れる。上から見下ろす）
        return s && m ? { sub: s.sub, goal: { ...m.treasure, y: m.treasure.y + 9 }, done: false } : null;
      }),
    16,
  );
  await page.waitForTimeout(800);
  const quality = await page.evaluate(() => window.__nori?.quality);
  await page.screenshot({ path: testInfo.outputPath(`stage4-look-${quality}.png`) });

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
  const [treasure = 0, water = 0] = await luminanceAt(page, points);
  const contrast = ratio(treasure, water);
  await testInfo.attach("contrast", {
    body: JSON.stringify({ quality, contrast, treasure, water, points }),
    contentType: "application/json",
  });
  expect(contrast, JSON.stringify({ quality, treasure, water, points })).toBeGreaterThanOrEqual(MIN_CONTRAST);
  expect(errors).toEqual([]);
};

// NORI-62：生きものの印（きらきら）も、まわりの水との明るさの比 3 以上（docs/game-rules.md「ステージ4」の見た目）。
// 灰色でいちばん水に近いエイ（1匹目から数えて2番目）のまわりで確かめる
test("ステージ4の見た目：生きもの（エイ）のきらきらがまわりの水より目立つ", async ({ page }, testInfo) => {
  test.setTimeout(180_000);
  const errors = watchErrors(page);
  // きらきらの回転を止める（位置を読んでから撮るまでに、回ってずれないように）
  await page.emulateMedia({ reducedMotion: "reduce" });
  await ready(page);
  await page.waitForFunction(() => window.__nori?.seaModels === 7, undefined, { timeout: 30_000 });
  const RAY = 1;
  // エイの 6 m 上をめざし、14 m まで近づく（真後ろからだと潜水艇に隠れる。上から見下ろす）
  await steerTo(
    page,
    () =>
      page.evaluate((i) => {
        const s = window.__nori?.sub?.();
        const c = window.__nori?.creatures?.()[i];
        return s && c ? { sub: s.sub, goal: { ...c, y: c.y + 6 }, done: false } : null;
      }, RAY),
    14,
  );
  await page.waitForTimeout(500);
  // きらきら（1つめ）と、エイの横 6 m の水（きらきらの輪の外）
  const points = await page.evaluate((i) => {
    const c = window.__nori?.creatures?.()[i];
    const k = window.__nori?.sparkles?.()[i];
    const s = (x: number, y: number, z: number) => window.__nori?.screenOf(x, y, z) ?? { x: 0, y: 0 };
    return c && k ? [s(k.x, k.y, k.z), s(c.x + 6, c.y, c.z)] : [];
  }, RAY);
  expect(points).toHaveLength(2);
  const viewport = page.viewportSize() ?? { width: 0, height: 0 };
  for (const p of points) {
    expect(p.x).toBeGreaterThanOrEqual(2);
    expect(p.x).toBeLessThanOrEqual(viewport.width - 3);
    expect(p.y).toBeGreaterThanOrEqual(2);
    expect(p.y).toBeLessThanOrEqual(viewport.height - 3);
  }
  await page.screenshot({ path: testInfo.outputPath("stage4-ray.png") });
  const [, water = 0] = await luminanceAt(page, points);
  // きらきらは小さく、エイと一緒に泳ぐので、読んだ点のまわり 10 px でいちばん明るいところを測る
  const sparkle = await peakLuminanceAt(page, points[0] ?? { x: 0, y: 0 }, 10);
  const contrast = ratio(sparkle, water);
  expect(contrast, JSON.stringify({ sparkle, water, points })).toBeGreaterThanOrEqual(MIN_CONTRAST);
  expect(errors).toEqual([]);
});

test("ステージ4：CPU を4倍遅くしても 30fps 以上", { tag: "@fps" }, async ({ page }) => {
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

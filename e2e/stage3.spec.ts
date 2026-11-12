import { expect, type Page, test, type TestInfo } from "@playwright/test";
import { luminanceAt, ratio } from "./luminance";

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

/** キーを「押す・離す」を、今の押し方から必要なぶんだけ変える */
const setKeys = async (page: Page, held: Set<string>, want: Set<string>) => {
  for (const k of held) if (!want.has(k)) await page.keyboard.up(k);
  for (const k of want) if (!held.has(k)) await page.keyboard.down(k);
  held.clear();
  for (const k of want) held.add(k);
};

/**
 * 輪（番号 index）へ向けて操縦する（0.1 秒ごとに位置を読み、←→ と ↑↓ を押す）。
 * くぐったら終わる。stopAt（m）を渡すと、輪まで その距離に近づいたところで終わる
 */
const flyToward = async (page: Page, index: number, stopAt = 0) => {
  const held = new Set<string>();
  for (let i = 0; i < 400; i++) {
    const info = await page.evaluate((k) => {
      const s = window.__nori?.plane?.();
      const r = window.__nori?.rings?.()[k];
      return s && r ? { p: s.plane, done: s.rings[k] ?? false, r } : null;
    }, index);
    if (info === null || info.done) break;
    const { p, r } = info;
    if (stopAt > 0 && Math.hypot(r.x - p.x, r.z - p.z) <= stopAt) break;
    const want = Math.atan2(-(r.x - p.x), -(r.z - p.z));
    const diff = Math.atan2(Math.sin(want - p.heading), Math.cos(want - p.heading));
    const keys = new Set<string>();
    if (diff < -0.04) keys.add("ArrowRight"); // heading が減る＝右へ
    if (diff > 0.04) keys.add("ArrowLeft");
    if (r.y - p.y > 1.5) keys.add("ArrowUp");
    if (r.y - p.y < -1.5) keys.add("ArrowDown");
    await setKeys(page, held, keys);
    await page.waitForTimeout(100);
  }
  await setKeys(page, held, new Set());
};

test("ステージ3：操縦して輪をくぐると、上の表示の数が増える", async ({ page }, testInfo) => {
  test.setTimeout(180_000);
  const errors = watchErrors(page);
  await ready(page);
  expect(await page.evaluate(() => window.__nori?.stage)).toBe(3);
  await expect(page.locator("#star-count")).toHaveText("0");
  await expect(page.locator("#flags")).toBeHidden(); // 旗は使わない
  await page.screenshot({ path: testInfo.outputPath("01-start.png") });

  await flyToward(page, 0);
  await page.waitForFunction(() => window.__nori?.plane?.()?.rings[0] === true, undefined, {
    timeout: 10_000,
  });
  await expect(page.locator("#star-count")).toHaveText("1");
  await page.screenshot({ path: testInfo.outputPath("02-ring.png") });

  // 手を離すと水平に戻る（約0.6秒）
  await page.waitForTimeout(1500);
  const s = await page.evaluate(() => window.__nori?.plane?.());
  expect(Math.abs(s?.plane.bank ?? 1)).toBeLessThan(1e-6);
  expect(Math.abs(s?.plane.pitch ?? 1)).toBeLessThan(1e-6);
  expect(await page.evaluate(() => window.__nori?.carModel)).toBe("glb");
  expect(errors).toEqual([]);
});

for (const mode of ["高画質", "低画質"] as const) {
  test(`ステージ3の見た目（${mode}）：輪が空より目立つ`, async ({ page }, testInfo) => {
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
  // 2つ目の輪へ向けて操縦し、輪まで 60 m に近づいたところで測る（輪が画面の真ん中に大きく映る）
  await flyToward(page, 1, 60);
  await page.waitForTimeout(800); // 手を離して水平に戻ってから撮る
  await page.screenshot({ path: testInfo.outputPath(`stage3-look-${quality}.png`) });

  const points = await page.evaluate(() => {
    const m = window.__nori?.ringMarker?.(1);
    const s = (p?: { x: number; y: number; z: number }) =>
      p === undefined ? { x: 0, y: 0 } : (window.__nori?.screenOf(p.x, p.y, p.z) ?? { x: 0, y: 0 });
    return [s(m?.ring), s(m?.sky)];
  });
  // 画面の外の点は黒として測られ、比が大きく出てしまうので、2点とも画面の中にあることを先に確かめる
  const viewport = page.viewportSize() ?? { width: 0, height: 0 };
  for (const p of points) {
    expect(p.x).toBeGreaterThanOrEqual(2);
    expect(p.x).toBeLessThanOrEqual(viewport.width - 3);
    expect(p.y).toBeGreaterThanOrEqual(2);
    expect(p.y).toBeLessThanOrEqual(viewport.height - 3);
  }
  const [ring = 0, sky = 0] = await luminanceAt(page, points);
  const contrast = ratio(ring, sky);
  await testInfo.attach("contrast", {
    body: JSON.stringify({ quality, contrast, ring, sky, points }),
    contentType: "application/json",
  });
  expect(contrast).toBeGreaterThanOrEqual(MIN_CONTRAST);
  expect(errors).toEqual([]);
};

// NORI-60：空をにぎやかに。ほかの飛行機（自作の形の色違い）・ただよう気球・鳥・山のふもとの木（高画質は Blender の木）
test("ステージ3の景色：ほかの飛行機・気球・鳥・木がある", async ({ page }, testInfo) => {
  test.setTimeout(150_000);
  const errors = watchErrors(page);
  await ready(page);
  await page.waitForFunction(() => window.__nori?.look !== "loading", undefined, { timeout: 60_000 });
  await page.waitForFunction(() => window.__nori?.skyScenery?.().planeModel === "glb", undefined, {
    timeout: 30_000,
  });
  const scenery = await page.evaluate(() => window.__nori?.skyScenery?.());
  expect(scenery).toMatchObject({ planes: 3, planeModel: "glb", balloons: 4, birds: 24 });
  if ((await page.evaluate(() => window.__nori?.quality)) === "high") {
    await page.waitForFunction(() => window.__nori?.trees === "model", undefined, { timeout: 30_000 });
  }
  // 少し左へ回って、山と木・ほかの飛行機の見える方を撮る
  await page.keyboard.down("ArrowLeft");
  await page.waitForTimeout(2500);
  await page.keyboard.up("ArrowLeft");
  await page.waitForTimeout(1000);
  await page.screenshot({ path: testInfo.outputPath("stage3-scenery.png") });

  // ほかの飛行機（1機目）の方へ向いて飛び、画面に映ることを確かめる
  const held = new Set<string>();
  let onScreen = false;
  for (let i = 0; i < 300 && !onScreen; i++) {
    const info = await page.evaluate(() => {
      const p = window.__nori?.plane?.()?.plane;
      const o = window.__nori?.skyScenery?.().planeAt[0];
      if (p === undefined || o === undefined) return null;
      const s = window.__nori?.screenOf(o.x, o.y, o.z) ?? { x: -1, y: -1 };
      return { p, o, s };
    });
    if (info === null) break;
    const { p, o, s } = info;
    const vp = page.viewportSize() ?? { width: 0, height: 0 };
    const ahead = (o.x - p.x) * -Math.sin(p.heading) + (o.z - p.z) * -Math.cos(p.heading) > 0;
    onScreen = ahead && s.x > 100 && s.x < vp.width - 100 && s.y > 80 && s.y < vp.height - 80;
    const want = Math.atan2(-(o.x - p.x), -(o.z - p.z));
    const diff = Math.atan2(Math.sin(want - p.heading), Math.cos(want - p.heading));
    const keys = new Set<string>();
    if (diff < -0.04) keys.add("ArrowRight");
    if (diff > 0.04) keys.add("ArrowLeft");
    if (o.y - p.y > 1.5) keys.add("ArrowUp");
    await setKeys(page, held, keys);
    await page.waitForTimeout(100);
  }
  await setKeys(page, held, new Set());
  await page.screenshot({ path: testInfo.outputPath("stage3-other-plane.png") });
  expect(onScreen).toBe(true);
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

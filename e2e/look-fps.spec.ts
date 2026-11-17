import { expect, test } from "@playwright/test";
import { LOOK } from "../src/config";
import { openStage } from "./common";

// NORI-56：リアル寄りの見た目で FPS を保つ（docs/game-rules.md「見た目」）。手元の PC だけで測る（NORI_SKIP_FPS=1 で省く）。
// NORI-77（一覧 2）：look.spec.ts から分けた（look.spec.ts は CPU を遅くせず、実際の秒で待たない）。
// 実際の速さが要る E2E なので、早送りしない。数値は src/config の LOOK から読む（写すと、直したときにずれる）
const skipFps = Boolean(process.env["NORI_SKIP_FPS"]);

test("見た目：手元の PC で FPS を保つ", { tag: "@fps" }, async ({ page }, testInfo) => {
  test.skip(skipFps, "GPU のない CI では FPS を測らない");
  await openStage(page, "./?stage=1", { look: true });
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

test(
  "見た目：CPU を遅くしても 30fps 以上（必要なら低画質に下がる）",
  { tag: "@fps" },
  async ({ page }, testInfo) => {
    test.skip(skipFps, "GPU のない CI では FPS を測らない");
    test.setTimeout(120_000);
    await openStage(page, "./?stage=1", { look: true });
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
  },
);

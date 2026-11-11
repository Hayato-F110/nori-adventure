import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";

// NORI-20〜23 完了条件：5台の GLB がブラウザで読み込め、並べて表示できる。コンソールエラーなし。
// ?models の確認用の画面（ゲームは始めない）。スクリーンショットを残す。FPS は手元だけ（NORI_SKIP_FPS=1 で省く）
const manifest = JSON.parse(
  readFileSync(path.resolve(import.meta.dirname, "../public/models/manifest.json"), "utf8"),
) as { models: { name: string }[] };
const names = manifest.models.map((m) => m.name);
const MIN_AVERAGE_FPS = 55;

test("乗り物のモデルを並べて表示する（?models）", { tag: "@fps" }, async ({ page }, testInfo) => {
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => consoleErrors.push(error.message));

  await page.goto("./?models");
  await page.waitForFunction(
    (count) =>
      (window.__noriGallery?.loaded.length ?? 0) + (window.__noriGallery?.failed.length ?? 0) >= count,
    names.length,
    { timeout: 60_000 },
  );
  const info = await page.evaluate(() => window.__noriGallery);
  expect(info?.failed).toEqual([]);
  expect([...(info?.loaded ?? [])].sort()).toEqual([...names].sort());
  // ゲームは始めない（ゲームの読み取り口がない）
  expect(await page.evaluate(() => window.__nori)).toBeUndefined();

  await page.waitForFunction(() => (window.__noriGallery?.fpsSamples.length ?? 0) >= 3, undefined, {
    timeout: 60_000,
  });
  await page.screenshot({ path: testInfo.outputPath("vehicle-models.png") });
  const samples = (await page.evaluate(() => window.__noriGallery?.fpsSamples)) ?? [];
  await testInfo.attach("fps", { body: JSON.stringify(samples), contentType: "application/json" });
  if (!process.env["NORI_SKIP_FPS"]) {
    const rest = samples.slice(1); // 最初の1秒は読み込み直後なので除く
    const average = rest.reduce((s, v) => s + v, 0) / Math.max(1, rest.length);
    expect(average).toBeGreaterThanOrEqual(MIN_AVERAGE_FPS);
  }
  expect(consoleErrors).toEqual([]);
});

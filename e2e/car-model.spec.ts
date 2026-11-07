import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";

// NORI-18 完了条件：1台分（car）が自動でゲームに読み込まれる。
// manifest に car があれば GLB の車に差しかわり、なければ箱の車のまま。どちらもコンソールエラーなし。
const manifest = JSON.parse(
  readFileSync(path.resolve(import.meta.dirname, "../public/models/manifest.json"), "utf8"),
) as { models: { name: string }[] };
const hasCar = manifest.models.some((m) => m.name === "car");

test(`車のモデル：${hasCar ? "GLB を読み込む" : "箱の車のまま"}`, async ({ page }, testInfo) => {
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => consoleErrors.push(error.message));
  const requests: string[] = [];
  page.on("request", (request) => requests.push(new URL(request.url()).pathname));

  await page.goto("./");
  await page.waitForFunction(() => (window.__nori?.frames ?? 0) > 5, undefined, { timeout: 60_000 });
  if (hasCar) {
    await page.waitForFunction(() => window.__nori?.carModel === "glb", undefined, { timeout: 30_000 });
  } else {
    // 読み込みを待つ時間をとってから、箱のままであることを確かめる
    await page.waitForTimeout(2000);
    expect(await page.evaluate(() => window.__nori?.carModel)).toBe("box");
  }
  await page.screenshot({ path: testInfo.outputPath(hasCar ? "car-glb.png" : "car-box.png") });

  expect(consoleErrors).toEqual([]);
  // ないモデルを読みに行かない（404 を出さない）
  expect(requests.some((p) => p.endsWith(".glb"))).toBe(hasCar);
});

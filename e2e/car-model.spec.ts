import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { openStage, watchErrors } from "./common";

// NORI-18 完了条件：1台分（car）が自動でゲームに読み込まれる。
// manifest に car があれば GLB の車に差しかわり、なければ箱の車のまま。どちらもコンソールエラーなし。
const manifest = JSON.parse(
  readFileSync(path.resolve(import.meta.dirname, "../public/models/manifest.json"), "utf8"),
) as { models: { name: string }[] };
const hasCar = manifest.models.some((m) => m.name === "car");

test(`車のモデル：${hasCar ? "GLB を読み込む" : "箱の車のまま"}`, async ({ page }, testInfo) => {
  const consoleErrors = watchErrors(page);
  const requests: string[] = [];
  page.on("request", (request) => requests.push(new URL(request.url()).pathname));

  await openStage(page, "./?stage=1");
  // NORI-16：本番のビルド（preview）では、CSP の style-src に 'unsafe-inline' がない。違反があればコンソールエラーになる
  const csp = await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute("content");
  expect(csp).toContain("style-src 'self';");
  expect(csp).not.toContain("'unsafe-inline'");
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

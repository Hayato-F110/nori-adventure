import { expect, type Page, test } from "@playwright/test";

// NORI-61：ステージ1の街をにぎやかに。テストの一覧（docs/test-plans/NORI-61.md）の E2E。
// 自作モデル7種類に差しかわる・コンソールエラー 0・ほかの車が動く・子どもの車のそばの自転車は止まる・スクリーンショット。
// FPS は car-drive.spec.ts（同じステージ1）で測る。
const watchErrors = (page: Page) => {
  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  page.on("pageerror", (e) => errors.push(e.message));
  return errors;
};

test("ステージ1：ほかの車・自転車・バイク・人が自作モデルで走り、子どものそばでは止まる", async ({
  page,
}, testInfo) => {
  const errors = watchErrors(page);
  await page.goto("./?stage=1");
  await page.waitForFunction(() => (window.__nori?.frames ?? 0) > 5, undefined, { timeout: 60_000 });
  await page.waitForFunction(() => window.__nori?.cityLife?.().models === 7, undefined, { timeout: 30_000 });

  const read = () => page.evaluate(() => window.__nori?.cityLife?.().poses);
  const before = await read();
  if (before === undefined) throw new Error("__nori.cityLife がない");
  expect(before.vehicles).toHaveLength(4);
  expect(before.bikes).toHaveLength(4);
  expect(before.people).toHaveLength(6);

  // ゲームが 30 刻み（0.5 秒）より多く進むまで待つ（子どもの車は動かさない）。遅い CI でも刻みで待つ
  const tick0 = await page.evaluate(() => window.__nori?.state().tick ?? 0);
  await page.waitForFunction((t) => (window.__nori?.state().tick ?? 0) > t + 30, tick0, { timeout: 60_000 });
  const after = await read();
  if (after === undefined) throw new Error("__nori.cityLife がない");

  // ほかの車は動いている
  const moved = (a: { x: number; z: number }, b: { x: number; z: number }) =>
    Math.hypot(a.x - b.x, a.z - b.z);
  expect(moved(before.vehicles[0] ?? { x: 0, z: 0 }, after.vehicles[0] ?? { x: 0, z: 0 })).toBeGreaterThan(
    0.1,
  );
  // スタートの左 4 m の自転車（1台目）は、止まっている子どもの車から 6 m 以内なので止まったまま
  expect(moved(before.bikes[0] ?? { x: 0, z: 0 }, after.bikes[0] ?? { x: 9, z: 9 })).toBe(0);

  await page.screenshot({ path: testInfo.outputPath("city-life-start.png") });
  expect(errors).toEqual([]);
});

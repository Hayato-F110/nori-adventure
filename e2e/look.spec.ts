import { expect, type Page, test, type TestInfo } from "@playwright/test";
import { chooseQuality, openStage, waitTicks, watchErrors } from "./common";
import { luminanceAt, ratio } from "./luminance";

// NORI-56：リアル寄りの見た目（docs/game-rules.md「見た目」）。
// 素材は同じオリジンだけから読み、子どもに大事なもの（ほし・道）が見分けやすく、FPS を保つ。コンソールエラーなし。
// FPS は e2e/look-fps.spec.ts で測る（NORI-77 の一覧 2）。数値は src/config の LOOK と同じ（ここに写す）
const LOOK = {
  minStarContrast: 3,
  minRoadGrassContrast: 1.5,
};

// 高画質（素材を貼る）と低画質（単色）の両方で、ほし・道が見分けやすいこと。
// NORI-77（一覧 2）：画質は CPU を遅くして自動で下げるのでなく、選んで開く（CI でも高画質の版は高画質で測る）
for (const [mode, quality] of [
  ["高画質", "high"],
  ["低画質", "low"],
] as const) {
  test(`見た目（${mode}）：素材を同じオリジンから読み、ほし・道が見分けやすい`, async ({
    page,
  }, testInfo) => {
    test.setTimeout(120_000);
    await checkLook(page, testInfo, quality);
  });
}

const checkLook = async (page: Page, testInfo: TestInfo, quality: "high" | "low") => {
  const consoleErrors = watchErrors(page);
  const origins = new Set<string>();
  page.on("request", (r) => origins.add(new URL(r.url()).origin));

  await chooseQuality(page, quality);
  await openStage(page, "./?stage=1", { look: true });
  // 測る前に、選んだ画質と見た目になっている（高画質なら素材、低画質なら単色）
  expect(await page.evaluate(() => window.__nori?.quality)).toBe(quality);
  expect(await page.evaluate(() => window.__nori?.look)).toBe(quality === "low" ? "plain" : "textured");
  // 木（NORI-26）：高画質は Blender の木、低画質は今の簡単な木
  await page.waitForFunction((q) => window.__nori?.trees === (q === "low" ? "simple" : "model"), quality, {
    timeout: 30_000,
  });
  // 車の後ろのカメラが落ち着くまで、ゲームの 1.5 秒（90 刻み）待つ（実際の秒で待たない）
  await waitTicks(page, 90);

  // ほし（2個目。(0, 1, −21)）と、そのすぐ横の道 (2.5, 0, −21)。道 (−2.5, 0, −12) と、道の外の芝 (−6.2, 0, −12)
  const points = await page.evaluate(() => {
    const s = (x: number, y: number, z: number) => window.__nori?.screenOf(x, y, z) ?? { x: 0, y: 0 };
    return [s(0, 1, -21), s(2.5, 0.02, -21), s(-2.5, 0.02, -12), s(-6.2, 0, -12), s(0, 0.02, -15)];
  });
  // ほしは道の中心に並ぶ。横の道だけでなく、ほしの手前の道の中心（前は中央線があった所）とも比べる（奥の点は、画面ではほしに重なる）
  const contrastOf = ([s = 0, byStar = 0, , , center = 0]: number[]) =>
    Math.min(ratio(s, byStar), ratio(s, center));
  // ほしは回っていて、真横を向いた瞬間は細くなり、測る範囲（5×5 px）に道が混ざる。
  // 0.3 秒ずつあけて3回撮り、いちばん見えている瞬間で判断する（ほとんどの時間は見えている。NORI-26）
  const take = async () => {
    const png = await page.screenshot();
    return { png, values: await luminanceAt(page, points, png) };
  };
  let best = await take();
  for (let i = 0; i < 2; i++) {
    await page.waitForTimeout(300);
    const next = await take();
    if (contrastOf(next.values) > contrastOf(best.values)) best = next;
  }
  // 判断に使った1枚を報告に添付する（NORI-69。オーナーの決定：見た目の E2E は、測った画面を報告に添付する）
  await testInfo.attach(`look-${quality}`, { body: best.png, contentType: "image/png" });
  const [star = 0, roadByStar = 0, road = 0, grass = 0, roadCenter = 0] = best.values;
  const starContrast = contrastOf(best.values);
  const roadGrass = ratio(road, grass);
  await testInfo.attach("contrast", {
    body: JSON.stringify({
      quality,
      starContrast,
      roadGrass,
      star,
      roadByStar,
      roadCenter,
      road,
      grass,
      points,
    }),
    contentType: "application/json",
  });
  expect(starContrast).toBeGreaterThanOrEqual(LOOK.minStarContrast);
  expect(roadGrass).toBeGreaterThanOrEqual(LOOK.minRoadGrassContrast);

  const base = new URL(page.url()).origin;
  expect([...origins].filter((o) => o !== base && !o.startsWith("data:"))).toEqual([]);
  expect(consoleErrors).toEqual([]);
};

import { expect, type Page, test } from "@playwright/test";
import { installSubDriver } from "./driver";

// NORI-30：タイトル画面・ステージ選び・クリアの演出（docs/game-rules.md）。テストの一覧の 9〜11
const FAST = 20; // stage-clear.spec.ts と同じ早送り

const watchErrors = (page: Page) => {
  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  page.on("pageerror", (e) => errors.push(e.message));
  return errors;
};

const titleReady = async (page: Page) => {
  await page.waitForFunction(() => window.__noriTitle !== undefined, undefined, { timeout: 30_000 });
};

test("タイトル：./ で乗り物の絵のボタンが5つ出て、ゲームは始まらない", async ({ page }, testInfo) => {
  const errors = watchErrors(page);
  await page.goto("./");
  await titleReady(page);
  const buttons = page.locator("#title a.title-button");
  await expect(buttons).toHaveCount(5);
  for (const b of await buttons.all()) {
    await expect(b).toBeVisible();
    const box = await b.boundingBox();
    expect(box?.width ?? 0).toBeGreaterThanOrEqual(120);
  }
  await expect(page.locator("#game")).toBeHidden();
  await expect(page.locator(".title-star:visible")).toHaveCount(0);
  expect(await page.evaluate(() => window.__nori)).toBeUndefined();
  // 開いたときは、どのボタンにも枠を出さない（車へ誘導しない）。保護者の方への入口は見える
  expect(await page.evaluate(() => document.activeElement === document.body)).toBe(true);
  await expect(page.locator("#parent")).toBeVisible();
  // キーボードの人は、最初のキーで車のボタンへ
  await page.keyboard.press("Tab");
  expect(await page.evaluate(() => document.activeElement?.getAttribute("data-stage"))).toBe("1");
  await page.screenshot({ path: testInfo.outputPath("title.png") });
  expect(errors).toEqual([]);
});

test("タイトル：車のボタンを押すと ?stage=1 が開き、車のステージが始まる", async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto("./");
  await titleReady(page);
  await page.locator('#title [data-stage="1"]').click();
  await expect(page).toHaveURL(/\?stage=1$/);
  await page.waitForFunction(() => (window.__nori?.frames ?? 0) > 5, undefined, { timeout: 60_000 });
  await expect(page.locator("#title")).toBeHidden();
  expect(errors).toEqual([]);
});

test("クリア：たからばこに着くと紙ふぶき、3 秒後に3つのボタン。つぎはステージ5。はじめのがめん → タイトルで潜水艇に星", async ({
  page,
}, testInfo) => {
  test.setTimeout(240_000);
  const errors = watchErrors(page);
  await installSubDriver(page, { steerGain: 2, climbGain: 0.3, stepsPerFrame: FAST });
  await page.goto("./?stage=4");
  await page.waitForFunction(() => (window.__nori?.frames ?? 0) > 5, undefined, { timeout: 60_000 });
  await expect(page.locator("#clear")).toBeHidden();

  // NORI-69：本物の時間でキーを押す代わりに、運転役＋早送りでたからばこへ向かう（stage-clear.spec.ts と同じ）。
  // ボタンが出るまでの 3 秒は実際の時間の決まり（window.setTimeout）なので、着いた瞬間から実際の時間で測る
  await page.waitForFunction(() => window.__nori?.sub?.()?.finishTick !== null, undefined, {
    timeout: 200_000,
    polling: 50,
  });
  const finishedAt = Date.now();
  expect(await page.evaluate(() => window.__nori?.sub?.()?.finishTick ?? null)).not.toBeNull();

  // 紙ふぶき（動きを減らす設定ではない）。ボタンはまだ出ていない
  await expect(page.locator("#confetti .confetti-piece")).toHaveCount(40);
  await expect(page.locator("#clear")).toBeHidden();
  await page.screenshot({ path: testInfo.outputPath("clear-confetti.png") });

  await expect(page.locator("#clear")).toBeVisible({ timeout: 10_000 });
  expect(Date.now() - finishedAt).toBeGreaterThanOrEqual(2_500);
  const links = page.locator("#clear a.clear-button");
  await expect(links).toHaveCount(3);
  for (const b of await links.all()) expect((await b.boundingBox())?.width ?? 0).toBeGreaterThanOrEqual(96);
  await expect(page.locator("#clear-again")).toHaveAttribute("href", "./?stage=4");
  await expect(page.locator("#clear-home")).toHaveAttribute("href", "./");
  // ボタンが出たら、タッチの操作とゴールの星は隠す（重なって押し間違えないように）
  await expect(page.locator("#touch")).toBeHidden();
  await expect(page.locator("#goal")).toBeHidden();
  await page.screenshot({ path: testInfo.outputPath("clear-buttons.png") });

  // ステージ4のあとの「つぎ」はステージ5（NORI-29）。タイトルへは「はじめのがめん」で戻る
  await expect(page.locator("#clear-next")).toHaveAttribute("href", "./?stage=5");
  await page.locator("#clear-home").click();
  await titleReady(page);
  expect(await page.evaluate(() => window.__noriTitle?.cleared)).toEqual([4]);
  await expect(page.locator('#title [data-stage="4"] .title-star')).toBeVisible();
  await expect(page.locator('#title [data-stage="1"] .title-star')).toBeHidden();
  await page.screenshot({ path: testInfo.outputPath("title-cleared.png") });

  // 読み込み直しても星は残る
  await page.reload();
  await titleReady(page);
  await expect(page.locator('#title [data-stage="4"] .title-star')).toBeVisible();
  expect(errors).toEqual([]);
});

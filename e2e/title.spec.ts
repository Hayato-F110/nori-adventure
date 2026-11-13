import { expect, type Page, test } from "@playwright/test";

// NORI-30：タイトル画面・ステージ選び・クリアの演出（docs/game-rules.md）。テストの一覧の 9〜11
type P3 = { x: number; y: number; z: number };

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
  await page.goto("./?stage=4");
  await page.waitForFunction(() => (window.__nori?.frames ?? 0) > 5, undefined, { timeout: 60_000 });
  await expect(page.locator("#clear")).toBeHidden();

  // たからばこの真ん中へ操縦する（0.1 秒ごとに位置を読み、←→ と ↑↓ を押す）
  const held = new Set<string>();
  const setKeys = async (want: Set<string>) => {
    for (const k of held) if (!want.has(k)) await page.keyboard.up(k);
    for (const k of want) if (!held.has(k)) await page.keyboard.down(k);
    held.clear();
    for (const k of want) held.add(k);
  };
  for (let i = 0; i < 1500; i++) {
    const info = await page.evaluate(() => {
      const s = window.__nori?.sub?.();
      const m = window.__nori?.treasureMarker?.();
      return s && m ? { sub: s.sub, goal: m.treasure, done: s.finishTick !== null } : null;
    });
    if (info === null || info.done) break;
    const { sub: p, goal: g } = info as { sub: P3 & { heading: number }; goal: P3; done: boolean };
    const want = Math.atan2(-(g.x - p.x), -(g.z - p.z));
    const diff = Math.atan2(Math.sin(want - p.heading), Math.cos(want - p.heading));
    const keys = new Set<string>();
    if (diff < -0.04) keys.add("ArrowRight");
    if (diff > 0.04) keys.add("ArrowLeft");
    if (g.y - p.y > 0.5) keys.add("ArrowUp");
    if (g.y - p.y < -0.5) keys.add("ArrowDown");
    await setKeys(keys);
    await page.waitForTimeout(100);
  }
  await setKeys(new Set());
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

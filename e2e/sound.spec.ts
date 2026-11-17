import { expect, type Page, test } from "@playwright/test";
import { SOUND } from "../src/config";

// NORI-31：効果音と BGM（docs/game-rules.md「効果音と BGM」）。テストの一覧の 8・9
const watchErrors = (page: Page) => {
  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  page.on("pageerror", (e) => errors.push(e.message));
  return errors;
};

const pressed = (page: Page) => page.locator("#sound").getAttribute("aria-pressed");

for (const [name, url, ready] of [
  // NORI-84 一覧 4：タイトルは __noriTitle を入れたあとに判定の部品・音の部品を読み込み、startSoundButton が
  // ボタンに保存した状態を書いてから __noriSound を入れる（src/main.ts のタイトルの分かれ道、src/render/sound.ts の
  // startSoundButton）。__noriTitle で待つと、ボタンの準備の前に読み・押してしまう。
  // ステージは __nori を入れる前に startSound を呼ぶので、今の待ちでよい
  ["タイトル", "./", () => window.__noriSound !== undefined],
  [
    "ステージ1",
    "./?stage=1",
    () => (window.__nori?.frames ?? 0) > 5 && window.__nori?.cover?.state === "gone",
  ],
  [
    "ステージ2",
    "./?stage=2",
    () => (window.__nori?.frames ?? 0) > 5 && window.__nori?.cover?.state === "gone",
  ],
  [
    "ステージ3",
    "./?stage=3",
    () => (window.__nori?.frames ?? 0) > 5 && window.__nori?.cover?.state === "gone",
  ],
  [
    "ステージ4",
    "./?stage=4",
    () => (window.__nori?.frames ?? 0) > 5 && window.__nori?.cover?.state === "gone",
  ],
  // NORI-84（R2-84-5）：ルールは「全部の画面で消せる」。ステージ5がなかった
  [
    "ステージ5",
    "./?stage=5",
    () => (window.__nori?.frames ?? 0) > 5 && window.__nori?.cover?.state === "gone",
  ],
] as const) {
  test(`${name}：消音のボタンがあり（${SOUND.buttonSize} px 以上）、押すと消音、読み込み直しても消音のまま`, async ({
    page,
  }) => {
    const errors = watchErrors(page);
    await page.goto(url);
    await page.waitForFunction(ready, undefined, { timeout: 60_000 });
    const button = page.locator("#sound");
    await expect(button).toBeVisible();
    // NORI-84（R2-84-6）：ルールの大きさ（SOUND.buttonSize、72 px）で見る。前は 64 px 以上で、ルールより緩かった
    const box = await button.boundingBox();
    expect(box?.width ?? 0).toBeGreaterThanOrEqual(SOUND.buttonSize);
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(SOUND.buttonSize);
    expect(await pressed(page)).toBe("true");
    await button.click();
    expect(await pressed(page)).toBe("false");
    await page.reload();
    await page.waitForFunction(ready, undefined, { timeout: 60_000 });
    expect(await pressed(page)).toBe("false");
    await page.locator("#sound").click();
    expect(await pressed(page)).toBe("true");
    expect(errors).toEqual([]);
  });
}

test("ステージ1：最初のキーで音が動き出し、ほしを取ると「とった」が鳴る。消音では音量 0", async ({
  page,
}) => {
  test.setTimeout(180_000);
  const errors = watchErrors(page);
  await page.goto("./?stage=1");
  await page.waitForFunction(
    () => (window.__nori?.frames ?? 0) > 5 && window.__nori?.cover?.state === "gone",
    undefined,
    { timeout: 60_000 },
  );
  // 操作の前は、音の仕組みを作らない（ブラウザの決まり）
  expect(await page.evaluate(() => window.__noriSound?.state())).toBe("none");

  const startTick = await page.evaluate(() => window.__nori?.state().tick ?? 0);
  await page.keyboard.down("ArrowUp");
  await page.waitForFunction(() => window.__noriSound?.state() === "running", undefined, { timeout: 10_000 });
  await page.waitForFunction((t) => (window.__nori?.state().tick ?? 0) >= t + 180, startTick, {
    timeout: 150_000,
  });
  await page.keyboard.up("ArrowUp");
  const played = await page.evaluate(() => window.__noriSound?.played ?? []);
  expect(played.filter((c) => c === "collect").length).toBeGreaterThanOrEqual(1);
  expect(await page.evaluate(() => window.__noriSound?.masterGain())).toBeCloseTo(1, 2);

  // 消音：0.1 秒で 0 へ（少し待ってから読む）
  await page.locator("#sound").click();
  await page.waitForTimeout(500);
  expect(await page.evaluate(() => window.__noriSound?.masterGain())).toBeLessThan(0.01);
  await page.locator("#sound").click(); // ほかのテストのために戻す
  expect(errors).toEqual([]);
});

import { expect, type Page, test } from "@playwright/test";

// NORI-58：画質を選ぶ（docs/game-rules.md「画質を選ぶ」）。右上のボタンで 高 ⇄ 低、開き直しても覚えている。
// ステージ1・2・3で同じ。スクリーンショット・コンソールエラーも確かめる
const watchErrors = (page: Page) => {
  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  page.on("pageerror", (e) => errors.push(e.message));
  return errors;
};

const waitFrames = (page: Page) =>
  page.waitForFunction(() => (window.__nori?.frames ?? 0) > 5, undefined, { timeout: 60_000 });

for (const [name, query] of [
  ["ステージ1", "./"],
  ["ステージ2", "./?stage=2"],
  ["ステージ3", "./?stage=3"],
] as const) {
  test(`${name}：右上のボタンで画質を選べて、開き直しても覚えている`, async ({ page }, testInfo) => {
    test.setTimeout(150_000);
    const errors = watchErrors(page);
    await page.goto(query);
    await waitFrames(page);
    const button = page.locator("#quality");
    await expect(button).toBeVisible();
    // 64 px 以上・右上・文字なし
    const box = await button.boundingBox();
    const viewport = page.viewportSize() ?? { width: 0, height: 0 };
    expect(box?.width ?? 0).toBeGreaterThanOrEqual(64);
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(64);
    expect((box?.x ?? 0) + (box?.width ?? 0)).toBeGreaterThan(viewport.width - 40);
    expect(box?.y ?? 999).toBeLessThan(40);
    expect((await button.innerText()).trim()).toBe("");

    // 最初は高。素材が貼れるまで待つ
    expect(await page.evaluate(() => window.__nori?.quality)).toBe("high");
    await page.waitForFunction(() => window.__nori?.look === "textured", undefined, { timeout: 60_000 });
    await expect(button).toHaveAttribute("data-quality", "high");

    // 押すと低（単色）
    await button.click();
    await expect(button).toHaveAttribute("data-quality", "low");
    expect(await page.evaluate(() => window.__nori?.quality)).toBe("low");
    expect(await page.evaluate(() => window.__nori?.look)).toBe("plain");
    await page.screenshot({ path: testInfo.outputPath("quality-low.png") });

    // 開き直しても低のまま（この端末の中に覚えている）
    await page.reload();
    await waitFrames(page);
    await expect(button).toHaveAttribute("data-quality", "low");
    expect(await page.evaluate(() => window.__nori?.quality)).toBe("low");
    await page.waitForFunction(() => window.__nori?.look === "plain", undefined, { timeout: 60_000 });

    // もう一度押すと高へ戻り、素材が貼られる
    await button.click();
    await expect(button).toHaveAttribute("data-quality", "high");
    await page.waitForFunction(() => window.__nori?.look === "textured", undefined, { timeout: 60_000 });
    expect(await page.evaluate(() => window.__nori?.quality)).toBe("high");
    await page.screenshot({ path: testInfo.outputPath("quality-high.png") });
    expect(errors).toEqual([]);
  });
}

import { expect, type Page, test } from "@playwright/test";
import { QUALITY_STORAGE_KEY } from "../src/render/quality";

// NORI-58：画質を選ぶ（docs/game-rules.md「画質を選ぶ」）。右上のボタンで 低 → 高 → 自動、開き直しても覚えている。
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
  ["ステージ1", "./?stage=1"],
  ["ステージ2", "./?stage=2"],
  ["ステージ3", "./?stage=3"],
] as const) {
  test(`${name}：右上のボタンで画質を選べて（自動にも戻せる）、開き直しても覚えている`, async ({
    page,
  }, testInfo) => {
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

    // 最初は「自動」（回る矢印の印）。高のままか低へ下がるかは端末の速さで決まる（GPU のない CI では低になる）ので、
    // ここでは画質を決めつけない。押す順は、端末の速さに左右されないように「前に低を選んだ」状態から確かめる
    await expect(button).toHaveAttribute("data-auto", "true");
    await page.evaluate((key) => localStorage.setItem(key, "low"), QUALITY_STORAGE_KEY);
    await page.reload();
    await waitFrames(page);
    await expect(button).toHaveAttribute("data-quality", "low");
    await expect(button).toHaveAttribute("data-auto", "false");
    expect(await page.evaluate(() => window.__nori?.quality)).toBe("low");
    await page.waitForFunction(() => window.__nori?.look === "plain", undefined, { timeout: 60_000 });
    await page.screenshot({ path: testInfo.outputPath("quality-low.png") });

    // もう一度押すと高へ戻り、素材が貼られる
    await button.click();
    await expect(button).toHaveAttribute("data-quality", "high");
    await page.waitForFunction(() => window.__nori?.look === "textured", undefined, { timeout: 60_000 });
    expect(await page.evaluate(() => window.__nori?.quality)).toBe("high");
    await page.screenshot({ path: testInfo.outputPath("quality-high.png") });

    // 開き直しても高のまま（この端末の中に覚えている。高を選んだら遅くても自動では下げない）
    await page.reload();
    await waitFrames(page);
    await expect(button).toHaveAttribute("data-quality", "high");
    await expect(button).toHaveAttribute("data-auto", "false");
    await page.waitForFunction(() => window.__nori?.look === "textured", undefined, { timeout: 60_000 });

    // もう一度押すと自動に戻る。開き直しても自動。
    // 自動に戻したあと高のままか低へ下がるかは端末の速さで決まる（GPU のない CI では数秒で低になる）ので、
    // ここでは自動の印だけを確かめる（見た目をすぐには変えないことは tests/render/qualityControl.test.ts で確かめる）
    await button.click();
    await expect(button).toHaveAttribute("data-auto", "true");
    await page.screenshot({ path: testInfo.outputPath("quality-auto.png") });
    await page.reload();
    await waitFrames(page);
    await expect(button).toHaveAttribute("data-auto", "true");
    expect(errors).toEqual([]);
  });
}

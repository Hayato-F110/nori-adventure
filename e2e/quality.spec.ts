import { expect, test } from "@playwright/test";
import { JUDGED_STORAGE_KEY, QUALITY_STORAGE_KEY } from "../src/render/quality";
import { openStage, waitStarted, watchErrors } from "./common";

// NORI-58：画質を選ぶ（docs/game-rules.md「画質を選ぶ」）。右上のボタンで 低 → 高 → 自動、開き直しても覚えている。
// ステージ1・2・3で同じ。スクリーンショット・コンソールエラーも確かめる
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
    await openStage(page, query);
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
    await waitStarted(page);
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
    await waitStarted(page);
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
    await waitStarted(page);
    await expect(button).toHaveAttribute("data-auto", "true");
    expect(errors).toEqual([]);
  });
}

// NORI-77（一覧 4）：画質を「自動」のまま（覚えた画質も、判定の結果もない）、CPU を 20 倍遅くしてステージ1を開くと、
// ステージで判定して低になる（docs/game-rules.md「画質を選ぶ」「ステージの始まりの待ちと、タイトルでの画質の判定」）。
// 実際の速さが要る E2E なので早送りしない。上限 90 秒（前の look.spec.ts と同じ）。
// 20 倍遅いと覆いの上限 10 秒が先に来る見込み（一覧の「## 計算」）なので、覆いの間か外れたあとの判定かは決めつけず、記録に残す
test("自動：遅い端末では、ステージで判定して低になる", async ({ page }, testInfo) => {
  test.setTimeout(180_000);
  const errors = watchErrors(page);
  // 前の回の保存が残らないよう、どちらの保存も空にしてから開く（新しい文脈なので、ふつうは空）
  await page.addInitScript(() => {
    if (sessionStorage.getItem("nori-e2e-cleared") === null) {
      localStorage.clear();
      sessionStorage.clear();
      sessionStorage.setItem("nori-e2e-cleared", "1");
    }
  });
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 20 });
  const openedAt = Date.now();
  await page.goto("./?stage=1");
  let goneAt = 0;
  try {
    await waitStarted(page, 90_000);
    goneAt = Date.now();
    await page.waitForFunction(
      () => window.__nori?.quality === "low" && window.__nori?.look === "plain",
      undefined,
      {
        timeout: 90_000,
      },
    );
  } finally {
    // CPU の遅さを先に戻す（下の記録が失敗しても、戻し忘れない。/code-review の 1）
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 }).catch(() => undefined);
    // 落ちても、覆いと画質の様子を残す。記録の失敗で、もとの失敗を隠さない（/code-review の 1）
    const state = await page
      .evaluate(
        (k) => ({
          cover: window.__nori?.cover,
          quality: window.__nori?.quality,
          look: window.__nori?.look,
          judged: sessionStorage.getItem(k),
        }),
        JUDGED_STORAGE_KEY,
      )
      .catch((e: unknown) => ({ readError: String(e) }));
    await testInfo
      .attach("auto-low", {
        body: JSON.stringify({
          coverGoneSeconds: goneAt === 0 ? null : (goneAt - openedAt) / 1000,
          ...state,
        }),
        contentType: "application/json",
      })
      .catch(() => undefined);
  }
  expect(await page.evaluate(() => window.__nori?.cover?.source)).toBe("measured");
  expect(await page.evaluate(() => window.__nori?.quality)).toBe("low");
  expect(await page.evaluate(() => window.__nori?.look)).toBe("plain");
  expect(await page.evaluate((k) => sessionStorage.getItem(k), JUDGED_STORAGE_KEY)).toBe("low");
  await expect(page.locator("#quality")).toHaveAttribute("data-auto", "true");
  expect(errors).toEqual([]);
});

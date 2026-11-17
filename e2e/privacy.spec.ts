import { expect, test } from "@playwright/test";
import { openStage, watchErrors } from "./common";
import { shotOrNote } from "./shot";

// NORI-54：保護者の方への入口とプライバシーポリシー（docs/game-rules.md「保護者の方への入口」）。
// タブレットで、短いタップでは開かない。2秒押し続けて離すと、新しいタブでポリシーが開く。
// ポリシーのページは日本語と英語があり、コンソールのエラー（CSP の違反を含む）がない。

test.describe("タブレット（1024×768・タッチ）", () => {
  test.use({ viewport: { width: 1024, height: 768 }, hasTouch: true, isMobile: true });

  test("短いタップでは開かず、2秒押し続けて離すとポリシーが開く", async ({ page, context }, testInfo) => {
    const errors = watchErrors(page);
    await openStage(page, "./?stage=1");
    const box = await page.locator("#parent").boundingBox();
    if (box === null) throw new Error("#parent が見えない");
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    const opened: string[] = [];
    context.on("page", (p) => opened.push(p.url()));

    // 短いタップ（子どものうっかり）：開かない
    await page.touchscreen.tap(x, y);
    await page.waitForTimeout(1000);
    expect(opened).toEqual([]);

    // 2秒より長く押し続けて離す：開く
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y, id: 1 }] });
    await page.waitForTimeout(1200);
    await page.screenshot({ path: testInfo.outputPath("parent-holding.png") });
    await page.waitForTimeout(1200);
    const popup = context.waitForEvent("page", { timeout: 10_000 });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    const policy = await popup;
    await policy.waitForLoadState();
    expect(policy.url()).toMatch(/\/privacy\.html$/);
    expect(errors).toEqual([]);
  });
});

test("ポリシーのページ：日本語と英語があり、コンソールのエラーがない", async ({ page }, testInfo) => {
  const errors = watchErrors(page);
  await page.goto("./privacy.html");
  await expect(page.locator("#ja h1")).toHaveText("プライバシーポリシー");
  await expect(page.locator("#en h1")).toHaveText("Privacy Policy");
  await expect(page.locator("#en")).toHaveAttribute("lang", "en");
  // 全画面の撮影は CI でたまに撮れない（原因は不明。NORI-73 の前提 8）。記録のためなので、撮れなくても落とさない
  await shotOrNote(page, testInfo, { path: testInfo.outputPath("privacy.png"), fullPage: true });
  expect(errors).toEqual([]);
});

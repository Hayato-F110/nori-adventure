import { expect, type Page, test } from "@playwright/test";
import { HOME } from "../src/config";
import { openStage, waitFrames, watchErrors } from "./common";
import { holdStartCover } from "./driver";

// NORI-33（docs/test-plans/NORI-33.md の 3）：遊んでいる途中でタイトルに戻る家のボタン（K33-1）。
// タブレット（1024×768・タッチ）。押し続けの秒の境目は単体テスト（tests/input/homeLink.test.ts）で見る。
// 実際の時間に頼るのは (d) の押し続けだけ（押したまま、戻るのを上限 10 秒待つ。決まった秒は待たない）
test.use({ viewport: { width: 1024, height: 768 }, hasTouch: true, isMobile: true });

const OTHERS = ["#parent", "#status", "#treasure-progress", "#sound", "#quality", "#wheel", "#go", "#back"];

type Box = { x: number; y: number; width: number; height: number };
const overlaps = (a: Box, b: Box) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

/** sel が見えていれば、ほかの見えている部品と四角が重ならないことを確かめ、その四角を返す */
const expectNoOverlap = async (page: Page, sel: string): Promise<Box> => {
  const box = await page.locator(sel).boundingBox();
  if (box === null) throw new Error(`${sel} の場所が分からない`);
  for (const other of OTHERS.filter((o) => o !== sel)) {
    const loc = page.locator(other);
    if (!(await loc.isVisible())) continue;
    const ob = await loc.boundingBox();
    if (ob === null) continue;
    expect(overlaps(box, ob), `${sel} と ${other} が重なる（${JSON.stringify({ box, ob })}）`).toBe(false);
  }
  return box;
};

/** #home が見えていて 72 px（±1）で、ほかと重ならない。ステージ4ではたからばこの帯も重ならず、上の表示の下 8 px・真ん中（R2-33-A） */
const expectHomePlaced = async (page: Page) => {
  await expect(page.locator("#home")).toBeVisible();
  const box = await expectNoOverlap(page, "#home");
  expect(Math.abs(box.width - HOME.buttonSize)).toBeLessThanOrEqual(1);
  expect(Math.abs(box.height - HOME.buttonSize)).toBeLessThanOrEqual(1);
  if (await page.locator("#treasure-progress").isVisible()) {
    const band = await expectNoOverlap(page, "#treasure-progress");
    const status = await page.locator("#status").boundingBox();
    if (status === null) throw new Error("#status の場所が分からない");
    expect(Math.abs(band.y - (status.y + status.height) - 8)).toBeLessThanOrEqual(1);
    const width = page.viewportSize()?.width ?? 0;
    expect(Math.abs(band.x + band.width / 2 - width / 2)).toBeLessThanOrEqual(1);
  }
};

for (const stage of [1, 2, 3, 4, 5]) {
  test(`NORI-33：ステージ${stage}に家のボタンが出て、重ならず、短いタップでは戻らない`, async ({ page }) => {
    test.setTimeout(120_000);
    const errors = watchErrors(page);
    await openStage(page, `./?stage=${stage}`);
    await expectHomePlaced(page);
    // 短いタップ：描画の 30 コマたってもステージのままで、輪は 0 か空（離したら数えない。R1-33-G・R2-33-G）
    await page.locator("#home").tap();
    await waitFrames(page, 30);
    expect(new URL(page.url()).searchParams.get("stage")).toBe(String(stage));
    const hold = await page
      .locator("#home")
      .evaluate((el) => (el as HTMLElement).style.getPropertyValue("--hold"));
    expect(["", "0"]).toContain(hold.trim());
    expect(errors).toEqual([]);
  });
}

test("NORI-33：タイトルでは、家のボタンはページにあるが見えない", async ({ page }) => {
  await page.goto("./");
  await expect(page.locator("#title")).toBeVisible();
  await expect(page.locator("#home")).toHaveCount(1);
  await expect(page.locator("#home")).toBeHidden();
});

test("NORI-33：覆いの間も、家のボタンがいちばん上にあって押せる", async ({ page }) => {
  test.setTimeout(120_000);
  // 覆いを止める口は運転役の上にあるので、何もしない運転役を入れてから止める
  await page.addInitScript(() => {
    globalThis.__noriDriver = { record: [], drive: () => ({ throttle: 0, steer: 0 }) };
  });
  await holdStartCover(page);
  await page.goto("./?stage=1");
  await page.waitForFunction(() => (window.__nori?.frames ?? 0) > 5);
  await expect(page.locator("#start-cover")).toBeVisible();
  const topId = await page.locator("#home").evaluate((el) => {
    const r = el.getBoundingClientRect();
    return (
      document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)?.closest("#home")?.id ?? null
    );
  });
  expect(topId).toBe("home");
});

test("NORI-33：押し続けるとタイトルに戻る（ステージ1）", async ({ page }) => {
  test.setTimeout(120_000);
  const errors = watchErrors(page);
  await openStage(page, "./?stage=1");
  const home = page.locator("#home");
  const box = await home.boundingBox();
  if (box === null) throw new Error("#home の場所が分からない");
  const point = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  // タッチで押し続ける（CDP の Input.dispatchTouchEvent。locator.tap は押してすぐ離すため）
  const cdp = await page.context().newCDPSession(page);
  const pressedAt = Date.now();
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [point] });
  try {
    await page.waitForURL((u) => !u.searchParams.has("stage"), { timeout: 10_000 });
  } catch (e) {
    // どの値で落ちたかを残す（R1-33-L）
    const hold = await home
      .evaluate((el) => (el as HTMLElement).style.getPropertyValue("--hold"))
      .catch(() => "?");
    throw new Error(`押して ${(Date.now() - pressedAt) / 1000} 秒たっても戻らない（--hold ＝ ${hold}）`, {
      cause: e,
    });
  }
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] }).catch(() => {});
  await expect(page.locator("#title")).toBeVisible();
  expect(errors).toEqual([]);
});

// 横向きのスマホの大きさ（R1-33-I）。ステージ4はたからばこの帯があり、いちばん部品が多い
for (const viewport of [
  { width: 640, height: 360 },
  { width: 844, height: 390 },
]) {
  test.describe(`NORI-33：スマホ ${viewport.width}×${viewport.height}`, () => {
    test.use({ viewport });
    test(`ステージ4で家のボタンがほかと重ならない（${viewport.width}×${viewport.height}）`, async ({
      page,
    }) => {
      test.setTimeout(120_000);
      const errors = watchErrors(page);
      await openStage(page, "./?stage=4");
      await expectHomePlaced(page);
      expect(errors).toEqual([]);
    });
  });
}

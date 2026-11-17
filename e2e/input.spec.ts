import { expect, test, type Page } from "@playwright/test";
import { openStage, waitStarted, waitTicks, watchErrors } from "./common";

// NORI-14：タッチ（タブレット）とゲームパッドで操作できる。docs/game-rules.md「入力」。
// 実機のタブレットでの確認は、オーナーが公開版で行う（完了条件）。

const carState = (page: Page) =>
  page.evaluate(() => {
    const s = window.__nori?.state();
    if (!s) throw new Error("window.__nori がありません");
    return { speed: s.car.speed, steer: s.car.steer, tick: s.tick };
  });

// ゲーム内の時間で待つ（遅い CI でも同じだけ進める）。上限は前と同じ 90 秒
const TICK_TIMEOUT = 90_000;

const center = async (page: Page, selector: string) => {
  const box = await page.locator(selector).boundingBox();
  if (box === null) throw new Error(`${selector} が見えない`);
  return { x: box.x + box.width / 2, y: box.y + box.height / 2, box };
};

test.describe("タブレット（1024×768・タッチ）", () => {
  test.use({ viewport: { width: 1024, height: 768 }, hasTouch: true, isMobile: true });

  test("ボタンが 64 px 以上で、2本の指で ▶ とハンドルを同時に使える", async ({ page }, testInfo) => {
    const errors = watchErrors(page);
    await page.goto("./?stage=1");
    await waitStarted(page);
    // タッチの画面か、最初に触ったときにボタンが出る
    await page.touchscreen.tap(512, 200);
    for (const sel of ["#go", "#back", "#wheel"]) {
      await expect(page.locator(sel)).toBeVisible();
      const { box } = await center(page, sel);
      expect(Math.min(box.width, box.height), sel).toBeGreaterThanOrEqual(64);
    }
    // すすむ（▶）は、さがる（◀）より大きい（主と副を大きさで分ける）
    expect((await center(page, "#go")).box.width).toBeGreaterThan((await center(page, "#back")).box.width);
    // 長押しのメニューを出さない
    const menuBlocked = await page.evaluate(() => {
      const ev = new MouseEvent("contextmenu", { bubbles: true, cancelable: true });
      return !document.getElementById("go")?.dispatchEvent(ev);
    });
    expect(menuBlocked).toBe(true);
    await page.screenshot({ path: testInfo.outputPath("tablet-controls.png") });

    // 2本の指：1本目は ▶、2本目はハンドルの中心から右へ 60 px（CDP で同時のタッチを送る）
    const go = await center(page, "#go");
    const wheel = await center(page, "#wheel");
    const cdp = await page.context().newCDPSession(page);
    const fingers = (dx: number) => [
      { x: go.x, y: go.y, id: 1 },
      { x: wheel.x + dx, y: wheel.y, id: 2 },
    ];
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: fingers(0) });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: fingers(60) });
    await waitTicks(page, 60, TICK_TIMEOUT);
    const held = await carState(page);
    await page.screenshot({ path: testInfo.outputPath("tablet-driving.png") });
    expect(held.speed).toBeGreaterThan(1);
    expect(held.steer).toBeGreaterThan(0.3);

    // 触っている間は、つまみの色が変わり、読み上げの値も変わる
    await expect(page.locator("#wheel")).toHaveClass(/active/);
    expect(Number(await page.locator("#wheel").getAttribute("aria-valuenow"))).toBeGreaterThan(0.3);

    // 押したまま別のアプリに切りかえる（blur）と、押したままの扱いにしない
    // 遅い CI（約3fps）では、読んでいる間にも進むので、blur の直後の速さと比べる（11/7 に CI で失敗）
    await page.evaluate(() => window.dispatchEvent(new Event("blur")));
    const atBlur = await carState(page);
    await waitTicks(page, 60, TICK_TIMEOUT);
    const afterBlur = await carState(page);
    expect(Math.abs(afterBlur.steer)).toBeLessThan(0.05);
    expect(afterBlur.speed).toBeLessThan(atBlur.speed);
    await expect(page.locator("#go")).not.toHaveClass(/pressed/);
    await expect(page.locator("#wheel")).not.toHaveClass(/active/);

    // 指を離すと、すすむ・まがる が 0 に戻る
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await waitTicks(page, 60, TICK_TIMEOUT);
    const released = await carState(page);
    expect(Math.abs(released.steer)).toBeLessThan(0.05);
    expect(released.speed).toBeLessThanOrEqual(afterBlur.speed);

    expect(errors).toEqual([]);
  });
});

test("PC（タッチなし）では、タッチのボタンを出さない", async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto("./?stage=1");
  await waitStarted(page);
  await expect(page.locator("#go")).toBeHidden();
  await expect(page.locator("#wheel")).toBeHidden();
  expect(errors).toEqual([]);
});

// NORI-73（一覧 9）：キーをゲームにつなぐ所（src/main.ts の createKeyboardInput）の確かめ。運転役を入れないので、
// キーの入力がそのままゲームに届く。刻みで待つので、実際の時間に頼らない（ゲームパッドのテストと同じ形）
test("ステージ1：運転役なしで、キー（ArrowUp）を押している間に車が前に進む", async ({ page }) => {
  const errors = watchErrors(page);
  await openStage(page, "./?stage=1");
  const before = await page.evaluate(() => {
    const car = window.__nori?.state().car;
    if (!car) throw new Error("window.__nori がありません");
    return { x: car.x, z: car.z };
  });
  await page.keyboard.down("ArrowUp");
  await waitTicks(page, 60, TICK_TIMEOUT);
  const after = await page.evaluate(() => {
    const car = window.__nori?.state().car;
    if (!car) throw new Error("window.__nori がありません");
    return { speed: car.speed, x: car.x, z: car.z };
  });
  await page.keyboard.up("ArrowUp");
  expect(after.speed).toBeGreaterThan(0);
  // スタートは −Z 向き（docs/game-rules.md「コースの道すじ」）
  expect(after.z).toBeLessThan(before.z);
  expect(errors).toEqual([]);
});

test("ゲームパッド（RT と左スティック）で進んで曲がる", async ({ page }) => {
  const errors = watchErrors(page);
  // 疑似のゲームパッド：standard mapping、RT（7）いっぱい、左スティックを右へ
  await page.addInitScript(() => {
    const buttons = Array.from({ length: 17 }, (_, i) => ({
      pressed: i === 7,
      touched: i === 7,
      value: i === 7 ? 1 : 0,
    }));
    const pad = {
      id: "test pad",
      index: 0,
      connected: true,
      mapping: "standard",
      axes: [1, 0, 0, 0],
      buttons,
      timestamp: 0,
    };
    Object.defineProperty(navigator, "getGamepads", { value: () => [pad, null, null, null] });
  });
  await page.goto("./?stage=1");
  await waitStarted(page);
  await waitTicks(page, 60, TICK_TIMEOUT);
  const s = await carState(page);
  expect(s.speed).toBeGreaterThan(1);
  expect(s.steer).toBeGreaterThan(0.3);
  expect(errors).toEqual([]);
});

test.describe("スマホ（縦向き 390×844・タッチ）", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test("「横にする」絵を出し、重なるボタンは隠す", async ({ page }, testInfo) => {
    const errors = watchErrors(page);
    await page.goto("./?stage=1");
    await waitStarted(page);
    await page.touchscreen.tap(195, 300);
    await expect(page.locator("#rotate")).toBeVisible();
    await expect(page.locator("#go")).toBeHidden();
    await page.screenshot({ path: testInfo.outputPath("phone-portrait.png") });
    expect(errors).toEqual([]);
  });
});

// NORI-62：ステージ3・4は ▲（うえ）▼（した）を右に縦に並べる。docs/game-rules.md「入力」の「上下のボタン」
test.describe("上下のボタン：タブレット（1024×768・タッチ）・ステージ4", () => {
  test.use({ viewport: { width: 1024, height: 768 }, hasTouch: true, isMobile: true });

  test("▲ が ▼ の真上にあり、どちらも 64 px 以上。▲ を押すと上がる", async ({ page }, testInfo) => {
    const errors = watchErrors(page);
    await page.goto("./?stage=4");
    await waitStarted(page);
    await page.touchscreen.tap(512, 200);
    const up = await center(page, "#go");
    const down = await center(page, "#back");
    await expect(page.locator("#go")).toHaveAttribute("aria-label", "うえ");
    await expect(page.locator("#back")).toHaveAttribute("aria-label", "した");
    for (const b of [up.box, down.box]) expect(Math.min(b.width, b.height)).toBeGreaterThanOrEqual(64);
    expect(up.box.width).toBe(down.box.width); // 主と副がないので同じ大きさ
    expect(Math.abs(up.x - down.x)).toBeLessThan(1); // 縦にそろう
    // ▲ が上。すき間はほかのボタンと同じ 20 px（小さな指で両方に触れない）
    expect(down.box.y - (up.box.y + up.box.height)).toBeGreaterThanOrEqual(19);
    await page.screenshot({ path: testInfo.outputPath("tablet-updown.png") });

    // ▲ を押したままにすると、潜水艇が上がる（y が増える）
    const depthNow = () => page.evaluate(() => window.__nori?.sub?.().sub.y ?? Number.NaN);
    const before = await depthNow();
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ x: up.x, y: up.y, id: 1 }],
    });
    await waitTicks(page, 60, TICK_TIMEOUT);
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    expect(await depthNow()).toBeGreaterThan(before + 0.5);
    expect(errors).toEqual([]);
  });
});

test.describe("上下のボタン：スマホ（横向き 844×390・タッチ）・ステージ3", () => {
  test.use({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true });

  test("▲▼ とハンドルが重ならず、画面の中に収まる", async ({ page }, testInfo) => {
    const errors = watchErrors(page);
    await page.goto("./?stage=3");
    await waitStarted(page);
    await page.touchscreen.tap(422, 150);
    const up = (await center(page, "#go")).box;
    const down = (await center(page, "#back")).box;
    const wheel = (await center(page, "#wheel")).box;
    expect(wheel.x + wheel.width).toBeLessThan(Math.min(up.x, down.x));
    expect(up.y).toBeGreaterThanOrEqual(0);
    expect(down.y + down.height).toBeLessThanOrEqual(390);
    expect(up.y + up.height).toBeLessThan(down.y);
    await page.screenshot({ path: testInfo.outputPath("phone-updown.png") });
    expect(errors).toEqual([]);
  });
});

test.describe("スマホ（横向き 844×390・タッチ）", () => {
  test.use({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true });

  test("ボタンとハンドルが重ならずに出る", async ({ page }, testInfo) => {
    const errors = watchErrors(page);
    await page.goto("./?stage=1");
    await waitStarted(page);
    await page.touchscreen.tap(422, 150);
    await expect(page.locator("#rotate")).toBeHidden();
    const wheel = (await center(page, "#wheel")).box;
    const back = (await center(page, "#back")).box;
    expect(wheel.x + wheel.width).toBeLessThan(back.x);
    await page.screenshot({ path: testInfo.outputPath("phone-landscape.png") });
    expect(errors).toEqual([]);
  });
});

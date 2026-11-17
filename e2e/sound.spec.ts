import { expect, type Page, test } from "@playwright/test";
import { SOUND, STAGE1 } from "../src/config";
import { openStage, waitStarted, watchErrors } from "./common";
import { installCarDriver, startDriving } from "./driver";

// NORI-31：効果音と BGM（docs/game-rules.md「効果音と BGM」）。テストの一覧の 8・9

const pressed = (page: Page) => page.locator("#sound").getAttribute("aria-pressed");

// 開いたあと（読み込み直したあと）に待つもの。タイトルは覆いがないので、消音のボタンの準備を待つ。
// NORI-84 一覧 4：タイトルは __noriTitle を入れたあとに判定の部品・音の部品を読み込み、startSoundButton が
// ボタンに保存した状態を書いてから __noriSound を入れる（src/main.ts のタイトルの分かれ道、src/render/sound.ts の
// startSoundButton）。__noriTitle で待つと、ボタンの準備の前に読み・押してしまう。
// ステージは __nori を入れる前に startSound を呼ぶので、waitStarted でよい
const titleReady = (page: Page) =>
  page.waitForFunction(() => window.__noriSound !== undefined, undefined, { timeout: 60_000 });

for (const [name, url, ready] of [
  ["タイトル", "./", titleReady],
  ["ステージ1", "./?stage=1", waitStarted],
  ["ステージ2", "./?stage=2", waitStarted],
  ["ステージ3", "./?stage=3", waitStarted],
  ["ステージ4", "./?stage=4", waitStarted],
  // NORI-84（R2-84-5）：ルールは「全部の画面で消せる」。ステージ5がなかった
  ["ステージ5", "./?stage=5", waitStarted],
] as const) {
  test(`${name}：消音のボタンがあり（${SOUND.buttonSize} px 以上）、押すと消音、読み込み直しても消音のまま`, async ({
    page,
  }) => {
    const errors = watchErrors(page);
    await page.goto(url);
    await ready(page);
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
    await ready(page);
    expect(await pressed(page)).toBe("false");
    await page.locator("#sound").click();
    expect(await pressed(page)).toBe("true");
    expect(errors).toEqual([]);
  });
}

// NORI-73（一覧 5・6）：実際の時間に頼らない形に直した（PR #94 の 3 回目の /code-review の指摘 1・2・6）。
// 音の待ちとゲームの待ちは種類が違う（docs/test-plans/NORI-73.md の前提 11）：
// - 音（running になる・消音で下がる）は、音の処理で実際の時間に進む → 上限 10 秒で、下がりしだい進む
// - ほしを取るのはゲームの刻みで進む → 運転役と早送りで進める（stage1-course.spec.ts と同じ。上限 150 秒）
// 運転役があると、ゲームの入力は運転役が決め、キーは使わない（前提 10）。キーは音を動かすためだけに押す
const FAST = 20;
const SOUND_LIMIT_MS = 10_000;
const STAR_LIMIT_MS = 150_000;

test("ステージ1：最初のキーで音が動き出し、ほしを取ると「とった」が鳴る。消音では音量 0", async ({
  page,
}, testInfo) => {
  // 開くまで 60 ＋ running 10 ＋ ほし 150 ＋ 消音 10 ＝ 230 秒に、10 秒の余裕（一覧の「## 計算」。R5-73-12）
  test.setTimeout(240_000);
  const errors = watchErrors(page);
  const note = (type: string, ms: number) =>
    testInfo.annotations.push({ type, description: `${(ms / 1000).toFixed(3)} 秒` });

  await installCarDriver(page, {
    waypoints: STAGE1.route.slice(1),
    turnAhead: STAGE1.checkpointRadius - 1,
    loop: false,
    stepsPerFrame: FAST,
    waitForGo: true,
    steerGain: 3,
    slowAngle: 0.6,
    slowThrottle: 0.5,
  });
  await openStage(page, "./?stage=1");

  // 操作の前は、音の仕組みを作らない（ブラウザの決まり）。キーを押す行のすぐ前で確かめ、間にクリックやタップを
  // 入れない（クリックでも音が動き出すので、キーで動き出したことを確かめられなくなる。前提 10・R6-73-7）
  expect(await page.evaluate(() => window.__noriSound?.state())).toBe("none");
  const keyAt = Date.now();
  await page.keyboard.press("ArrowUp");
  await page.waitForFunction(() => window.__noriSound?.state() === "running", undefined, {
    timeout: SOUND_LIMIT_MS,
  });
  note("running まで", Date.now() - keyAt);

  // ほしを 1 個取るまで、運転役と早送りで進める（刻みは数えない）
  const driveAt = Date.now();
  await startDriving(page);
  await page.waitForFunction(
    () => (window.__nori?.state().course.stars.filter(Boolean).length ?? 0) >= 1,
    undefined,
    { timeout: STAR_LIMIT_MS, polling: 100 },
  );
  note("ほしを取るまで", Date.now() - driveAt);
  const played = await page.evaluate(() => window.__noriSound?.played ?? []);
  expect(played.filter((c) => c === "collect").length).toBeGreaterThanOrEqual(1);
  expect(await page.evaluate(() => window.__noriSound?.masterGain())).toBeCloseTo(1, 2);

  // 消音：0.1 秒で 0 へ下がる。決め打ちで待たず、下がりしだい進む（上限 10 秒。落ちたら最後に読んだ音量が出る）
  const muteAt = Date.now();
  await page.locator("#sound").click();
  await expect
    .poll(() => page.evaluate(() => window.__noriSound?.masterGain() ?? Number.NaN), {
      timeout: SOUND_LIMIT_MS,
      message: "消音のあと、音量が 0.01 より小さくならない",
    })
    .toBeLessThan(0.01);
  note("音量が下がるまで", Date.now() - muteAt);
  expect(errors).toEqual([]);
});

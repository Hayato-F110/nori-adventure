// NORI-77：E2E の共通の部品（docs/test-plans/NORI-77.md の一覧 1）。
// 前はファイルごとに写していて、1 か所を直してもほかの写しに届かなかった（NORI-67・69・71・73・74・76）。
// 各テストは、ここから読み込んで使う。写しを作らないことは tests/e2e/common.test.ts が確かめる。
import { expect, type Page } from "@playwright/test";
import { QUALITY_STORAGE_KEY } from "../src/render/quality";

/** コンソールのエラーと、ページの中で起きた例外を集める（page.goto の前に呼ぶ） */
export const watchErrors = (page: Page): string[] => {
  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  page.on("pageerror", (e) => errors.push(e.message));
  return errors;
};

/** 画質を、ボタンで選んだのと同じ形で保存してから開く（page.goto の前に呼ぶ）。選んだ画質は自動で変わらない */
export const chooseQuality = (page: Page, quality: "high" | "low") =>
  page.addInitScript((o) => window.localStorage.setItem(o.name, o.value), {
    name: QUALITY_STORAGE_KEY,
    value: quality,
  });

/** 描き始めて（5 コマより後）、ステージの覆いが外れるのを待つ（NORI-76）。読み込み直しや画面の切り替えのあとにも使う */
export const waitStarted = (page: Page, timeout = 60_000) =>
  page.waitForFunction(
    () => (window.__nori?.frames ?? 0) > 5 && window.__nori?.cover?.state === "gone",
    undefined,
    {
      timeout,
    },
  );

/** 見た目（素材を貼るか単色か）が決まり、覆いが外れるのを待つ */
export const waitLook = (page: Page, timeout = 60_000) =>
  page.waitForFunction(
    () => window.__nori?.look !== "loading" && window.__nori?.cover?.state === "gone",
    undefined,
    {
      timeout,
    },
  );

/**
 * ステージを開いて、描き始めと覆いが外れるのを待つ。look: true なら、見た目が決まるのも待つ。
 * 運転役（install…Driver）・覆いを止める口（holdStartCover）・chooseQuality は、この前に入れる
 */
export const openStage = async (
  page: Page,
  url: string,
  options: { look?: boolean; timeout?: number } = {},
) => {
  await page.goto(url);
  await waitStarted(page, options.timeout);
  if (options.look === true) await waitLook(page, options.timeout);
};

/** 今のステージの刻み（ステージ1は state、2 は train、3 は plane、4 は sub、5 は rover。NORI-77 の前提 7） */
const tickNow = (page: Page) =>
  page.evaluate(() => {
    const n = window.__nori;
    return (
      n?.train?.()?.tick ??
      n?.plane?.()?.tick ??
      n?.sub?.()?.tick ??
      n?.rover?.()?.tick ??
      n?.state?.()?.tick ??
      0
    );
  });

/**
 * ゲームの刻みで n 刻み待つ（実際の秒で待たない。遅い CI でもゲームの中では同じだけ進む）。
 * 刻みは tickNow の 1 か所だけで読む（写しを作らない。/code-review の 6）。
 * ステージ2は列車を選ぶまで刻みが 0 のまま進まないので、chooseTrain のあとに呼ぶ（/code-review の 2）
 */
export const waitTicks = async (page: Page, n: number, timeout = 60_000) => {
  const from = await tickNow(page);
  await expect
    .poll(() => tickNow(page), {
      timeout,
      message: `刻みが ${from} から ${n} 進まない（ステージ2なら、列車を選ぶ前に呼んでいないか）`,
    })
    .toBeGreaterThanOrEqual(from + n);
};

/**
 * ステージ2：乗る列車を選ぶ（NORI-59）。openStage のあとに呼ぶ。選ぶ前は時間が止まっている（刻み 0）ことも確かめる。
 * クリックした時刻（Date.now()）を返す
 */
export const chooseTrain = async (page: Page, choice = "train") => {
  await expect(page.locator("#train-choice button")).toHaveCount(3);
  expect(await page.evaluate(() => window.__nori?.train?.()?.tick)).toBe(0);
  await page.locator(`#train-choice button[data-train="${choice}"]`).click();
  const clickedAt = Date.now();
  await expect(page.locator("#train-choice")).toBeHidden();
  expect(await page.evaluate(() => window.__nori?.trainChoice?.())).toBe(choice);
  return clickedAt;
};

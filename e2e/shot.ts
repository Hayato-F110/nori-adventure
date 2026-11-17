// NORI-73（一覧 4）：記録のための撮影。撮れなくてもテストを落とさない（1 回撮り直し、だめなら記録に残す）。
// 2026-11-15 にオーナーが決めた直し方。撮れない原因は分かっていない（docs/test-plans/NORI-73.md の前提 8）。
// Vitest の単体テストから読めるように、Playwright は型だけを読み込む（前提 9）
import type { Page, TestInfo } from "@playwright/test";

export type ShotOptions = { readonly path: string; readonly fullPage?: boolean };

const message = (e: unknown): string => (e instanceof Error ? e.message : String(e));

/**
 * 撮る。1 回目が失敗したら、待たずに同じ引数でもう 1 回撮る。
 * 2 回目で撮れたら注記「撮り直した」、2 回とも失敗したら注記「撮れなかった」を残し、例外を投げずに null を返す
 */
export const shotOrNote = async (
  page: Pick<Page, "screenshot">,
  info: Pick<TestInfo, "annotations">,
  options: ShotOptions,
): Promise<Buffer | null> => {
  let first: unknown;
  try {
    return await page.screenshot(options);
  } catch (e) {
    first = e;
  }
  try {
    const image = await page.screenshot(options);
    info.annotations.push({ type: "撮り直した", description: `${options.path}：1 回目 ${message(first)}` });
    return image;
  } catch (e) {
    // 原因が分かっていないので、2 回の文を両方残す（/code-review 2 回目の指摘）
    info.annotations.push({
      type: "撮れなかった",
      description: `${options.path}：1 回目 ${message(first)}／2 回目 ${message(e)}`,
    });
    return null;
  }
};

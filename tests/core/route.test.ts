import { describe, expect, it } from "vitest";
import { TITLE } from "../../src/config/index.ts";
import { nextAfter, parseRoute, stageUrl } from "../../src/core/route.ts";

// docs/game-rules.md「タイトル画面・ステージ選び・クリアの演出」（NORI-30）。テストの一覧の 1・2
describe("URL から開く画面を決める", () => {
  it("?stage=1〜5 はそのステージ", () => {
    for (const n of TITLE.stages) expect(parseRoute(`?stage=${n}`)).toEqual({ kind: "stage", stage: n });
    expect(parseRoute("?stage=2&debug")).toEqual({ kind: "stage", stage: 2 });
  });

  it("何もない・?debug だけ・知らない値はタイトル（白い画面にしない）", () => {
    for (const search of ["", "?", "?debug", "?stage=6", "?stage=0", "?stage=x", "?stage=", "?stage=1.5"]) {
      expect(parseRoute(search), search).toEqual({ kind: "title" });
    }
  });

  it("?models は確認用の画面（?stage より先に見る）", () => {
    expect(parseRoute("?models")).toEqual({ kind: "models" });
    expect(parseRoute("?models&stage=2")).toEqual({ kind: "models" });
  });
});

describe("「つぎ」のステージ", () => {
  it("1→2、2→3、3→4、最後（4）のあとはタイトル", () => {
    expect(nextAfter(1)).toBe(2);
    expect(nextAfter(2)).toBe(3);
    expect(nextAfter(3)).toBe(4);
    expect(nextAfter(4)).toBe(5);
    expect(nextAfter(5)).toBe("title");
  });

  it("ステージを開く URL は相対（GitHub Pages の /nori-adventure/ の下で開く）。タイトルは ./", () => {
    expect(stageUrl(3)).toBe("./?stage=3");
    expect(stageUrl("title")).toBe("./");
  });
});

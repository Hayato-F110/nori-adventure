import { describe, expect, it } from "vitest";
import { LOOK } from "../../src/config";
import { createTitleJudge } from "../../src/render/titleJudge";

// NORI-76 一覧 2（docs/test-plans/NORI-76.md）：タイトルでの測り方（docs/game-rules.md）。
// sample は 1 秒ごとの平均 FPS。素材を貼った知らせ（start）のあとから数え、最初の 1 秒（LOOK.settleSeconds）は数えない
const judge = () => createTitleJudge(LOOK);

describe("NORI-76 一覧 2：タイトルの判定", () => {
  it("start より前の値は数えない", () => {
    const j = judge();
    for (let i = 0; i < 10; i++) j.sample(10);
    expect(j.result).toBeNull();
    expect(j.state).toBe("waiting");
    j.start();
    expect(j.state).toBe("measuring");
  });

  it("1 秒目は数えず、2〜4 秒目が 3 回とも 40 未満なら low", () => {
    const j = judge();
    j.start();
    j.sample(60); // 1 秒目：数えない
    j.sample(39.9);
    j.sample(39.9);
    expect(j.result).toBeNull(); // 4 秒目より前は結果なし
    j.sample(39.9);
    expect(j.result).toBe("low");
    expect(j.state).toBe("done");
  });

  it("1 秒目が遅くても数えない（2〜4 秒目が速ければ high）", () => {
    const j = judge();
    j.start();
    j.sample(5);
    j.sample(60);
    j.sample(60);
    j.sample(60);
    expect(j.result).toBe("high");
  });

  it("1 回でも 40 以上なら high（境目の 40 は「遅い」に入らない）", () => {
    const j = judge();
    j.start();
    j.sample(60);
    j.sample(39.9);
    j.sample(40);
    j.sample(39.9);
    expect(j.result).toBe("high");
  });

  it("結果が出たら、そのあとの値で変わらない", () => {
    const j = judge();
    j.start();
    for (const fps of [60, 60, 60, 60]) j.sample(fps);
    expect(j.result).toBe("high");
    for (let i = 0; i < 5; i++) j.sample(1);
    expect(j.result).toBe("high");
  });

  it("素材が読めなかった知らせ（skip）のあとは、値を渡しても結果なし", () => {
    const j = judge();
    j.skip();
    j.start();
    for (let i = 0; i < 6; i++) j.sample(10);
    expect(j.result).toBeNull();
    expect(j.state).toBe("skipped");
  });

  it("測る秒の数はルールの値（1 ＋ 3）", () => {
    expect(LOOK.settleSeconds + LOOK.lowFpsSeconds).toBe(4);
  });
});

import { describe, expect, it } from "vitest";
import { GALLERY_GAP, GALLERY_ORDER, galleryLayout } from "../../src/render/modelGallery.ts";

// ?models の確認用の画面（NORI-20〜23）で、乗り物を重ならずに並べる計算
describe("galleryLayout", () => {
  it("全体の中心が 0 で、隣どうしは幅の半分ずつ＋すき間だけ離れる", () => {
    const widths = [2, 4, 3];
    const xs = galleryLayout(widths);
    const left = (xs[0] ?? 0) - 1;
    const right = (xs[2] ?? 0) + 1.5;
    expect(left + right).toBeCloseTo(0, 9);
    expect((xs[1] ?? 0) - (xs[0] ?? 0)).toBeCloseTo(1 + GALLERY_GAP + 2, 9);
    expect((xs[2] ?? 0) - (xs[1] ?? 0)).toBeCloseTo(2 + GALLERY_GAP + 1.5, 9);
  });

  it("1台なら真ん中、0台なら空", () => {
    expect(galleryLayout([3])).toEqual([0]);
    expect(galleryLayout([])).toEqual([]);
  });

  it("並べる順は、ステージの順（車・列車・飛行機・潜水艇・ローバー）、最後に木2種類", () => {
    expect(GALLERY_ORDER).toEqual(["car", "train", "plane", "sub", "rover", "tree-a", "tree-b"]);
  });
});

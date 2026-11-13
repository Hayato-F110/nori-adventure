// docs/game-rules.md「街をにぎやかに」の雲・ランプ（NORI-61）。一覧は docs/test-plans/NORI-61.md の 9・10。
import { describe, expect, it } from "vitest";
import { CITY_SKY, SIM, TRAFFIC } from "../../src/config/index.ts";
import { cloudPositions, lampsOn } from "../../src/core/citySky.ts";

const { clouds } = CITY_SKY;

// 一覧 10：雲8個は 1 m/s で +x へ流れ、x が 150 を超えたら −150 へ戻る
describe("雲（cloudPositions）", () => {
  it(`${clouds.count} 個。はじめの x・z は ±${clouds.wrapX} m、高さは ${clouds.minHeight}〜${clouds.maxHeight} m`, () => {
    const at0 = cloudPositions(0, CITY_SKY);
    expect(at0).toHaveLength(clouds.count);
    for (const c of at0) {
      expect(Math.abs(c.x)).toBeLessThanOrEqual(clouds.wrapX);
      expect(Math.abs(c.z)).toBeLessThanOrEqual(clouds.wrapX);
      expect(c.y).toBeGreaterThanOrEqual(clouds.minHeight);
      expect(c.y).toBeLessThanOrEqual(clouds.maxHeight);
    }
  });

  it("1 秒（60 刻み）で +x へ 1 m 流れ、y・z は変わらない", () => {
    const a = cloudPositions(0, CITY_SKY);
    const b = cloudPositions(Math.round(1 / SIM.fixedDt), CITY_SKY);
    a.forEach((c, i) => {
      const d = b[i];
      if (!d) throw new Error("雲が足りない");
      // 端を越えて戻った雲は 300 m の差になる
      const dx = d.x - c.x;
      expect(
        Math.abs(dx - clouds.speed) < 1e-9 || Math.abs(dx - clouds.speed + 2 * clouds.wrapX) < 1e-9,
      ).toBe(true);
      expect(d.y).toBe(c.y);
      expect(d.z).toBe(c.z);
    });
  });

  it(`どれだけ時間がたっても x は ±${clouds.wrapX} m の中（1 時間分を 1 秒ごとに）`, () => {
    for (let s = 0; s <= 3600; s++) {
      for (const c of cloudPositions(Math.round(s / SIM.fixedDt), CITY_SKY)) {
        expect(c.x).toBeGreaterThanOrEqual(-clouds.wrapX);
        expect(c.x).toBeLessThan(clouds.wrapX);
      }
    }
  });

  it("同じ刻み → 同じ位置（乱数・時刻を使わない）", () => {
    expect(cloudPositions(12345, CITY_SKY)).toEqual(cloudPositions(12345, CITY_SKY));
  });
});

// 一覧 9：ランプは 0.5 秒ごとに入れかわる。動きを減らす設定の端末では両方つけたまま
describe("パトカー・消防車のランプ（lampsOn）", () => {
  const swapTicks = Math.round(TRAFFIC.lampSwapSeconds / SIM.fixedDt);

  it(`${TRAFFIC.lampSwapSeconds} 秒（${swapTicks} 刻み）ごとに赤と青が入れかわり、片方だけがつく`, () => {
    expect(lampsOn(0, TRAFFIC, false)).toEqual({ red: true, blue: false });
    expect(lampsOn(swapTicks - 1, TRAFFIC, false)).toEqual({ red: true, blue: false });
    expect(lampsOn(swapTicks, TRAFFIC, false)).toEqual({ red: false, blue: true });
    expect(lampsOn(2 * swapTicks, TRAFFIC, false)).toEqual({ red: true, blue: false });
  });

  it("光に敏感な子のため、1 秒に 3 回より少なく入れかわる", () => {
    let swaps = 0;
    const second = Math.round(1 / SIM.fixedDt);
    for (let t = 1; t <= second; t++) {
      if (lampsOn(t, TRAFFIC, false).red !== lampsOn(t - 1, TRAFFIC, false).red) swaps++;
    }
    expect(swaps).toBeLessThan(3);
  });

  it("動きを減らす設定では、いつでも両方つけたまま", () => {
    for (const t of [0, swapTicks, 2 * swapTicks + 7])
      expect(lampsOn(t, TRAFFIC, true)).toEqual({ red: true, blue: true });
  });
});

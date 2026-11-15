import { describe, expect, it } from "vitest";
import { STAGE5 } from "../../src/config";
import {
  distanceToPath,
  jumpPads,
  nearestPathD,
  pathHeading,
  pathPoint,
  starPositions,
} from "../../src/core/stage5Layout";

// docs/game-rules.md「ステージ5」のコース（NORI-29）。テストの一覧の 9・10
describe("道すじ", () => {
  it("d = 0 がスタート (0, 85)、d = 110 が広場の入口 (0, −25)", () => {
    const a = pathPoint(0);
    const b = pathPoint(STAGE5.pathLength);
    expect(a.x).toBeCloseTo(0, 9);
    expect(a.z).toBeCloseTo(85, 9);
    expect(b.x).toBeCloseTo(0, 9);
    expect(b.z).toBeCloseTo(-25, 9);
  });

  it("波の幅は 12 m（左右にいちばん離れても 12 m）", () => {
    const xs = Array.from({ length: 1101 }, (_, i) => pathPoint(i / 10).x);
    expect(Math.max(...xs)).toBeCloseTo(12, 3);
    expect(Math.min(...xs)).toBeCloseTo(-12, 3);
  });

  it("道すじの向きは、進む向き（d が増える向き）", () => {
    for (const d of [0, 27.5, 55, 90]) {
      const h = pathHeading(d);
      const p = pathPoint(d);
      const q = pathPoint(d + 0.01);
      // heading 0 は −Z 向き：前は (−sin h, −cos h)
      const fx = -Math.sin(h);
      const fz = -Math.cos(h);
      const len = Math.hypot(q.x - p.x, q.z - p.z);
      expect((q.x - p.x) / len).toBeCloseTo(fx, 3);
      expect((q.z - p.z) / len).toBeCloseTo(fz, 3);
    }
  });

  it("いちばん近い道すじの点の d を返す", () => {
    expect(nearestPathD(pathPoint(42).x + 0.5, pathPoint(42).z)).toBeCloseTo(42, 0);
    expect(nearestPathD(0, 200)).toBe(0);
    expect(nearestPathD(0, -200)).toBe(STAGE5.pathLength);
  });
});

describe("ジャンプ台とほし", () => {
  it("ジャンプ台は d = 30・70 の道すじの上", () => {
    const pads = jumpPads();
    expect(pads.map((p) => p.d)).toEqual([30, 70]);
    for (const p of pads) {
      expect(p.x).toBeCloseTo(pathPoint(p.d).x, 9);
      expect(p.z).toBeCloseTo(pathPoint(p.d).z, 9);
      expect(p.heading).toBeCloseTo(pathHeading(p.d), 9);
    }
  });

  it("ほしは 12 個：地面の 6 個（d = 6・13・20・64・102・107、高さ 0）＋ 空中の 6 個", () => {
    const stars = starPositions();
    expect(stars).toHaveLength(12);
    STAGE5.groundStars.forEach((d, i) => {
      expect(stars[i]?.x).toBeCloseTo(pathPoint(d).x, 9);
      expect(stars[i]?.z).toBeCloseTo(pathPoint(d).z, 9);
      expect(stars[i]?.y).toBe(0);
    });
  });

  it("空中のほしは、台の中心から台の向きにまっすぐ 8・14.8・21.6 m 先、高さ 2.2・2.8・2.2 m", () => {
    const stars = starPositions();
    const ground = STAGE5.groundStars.length;
    jumpPads().forEach((pad, k) => {
      STAGE5.airStars.forEach((a, j) => {
        const s = stars[ground + k * STAGE5.airStars.length + j];
        expect(s?.x).toBeCloseTo(pad.x - Math.sin(pad.heading) * a.ahead, 9);
        expect(s?.z).toBeCloseTo(pad.z - Math.cos(pad.heading) * a.ahead, 9);
        expect(s?.y).toBe(a.height);
      });
    });
  });
});

describe("景色の岩", () => {
  it("6 つとも、道すじから 8 m 以上離れている（岩の端から）", () => {
    expect(STAGE5.rocks).toHaveLength(6);
    for (const r of STAGE5.rocks) {
      expect(distanceToPath(r.x, r.z) - r.radius).toBeGreaterThanOrEqual(8);
    }
  });

  // NORI-70（初見レビュー R2-29-21）：ルール「景色の岩 6 つ（半径 1.5〜3 m の半球）」
  it("6 つとも半径 1.5〜3 m", () => {
    for (const r of STAGE5.rocks) {
      expect(r.radius).toBeGreaterThanOrEqual(1.5);
      expect(r.radius).toBeLessThanOrEqual(3);
    }
  });

  it("広場（中心から 30 m）とジャンプ台に重ならない", () => {
    for (const r of STAGE5.rocks) {
      const c = STAGE5.arenaCenter;
      expect(Math.hypot(r.x - c.x, r.z - c.z)).toBeGreaterThan(STAGE5.arenaRadius + r.radius);
    }
  });
});

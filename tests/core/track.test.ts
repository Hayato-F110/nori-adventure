import { describe, expect, it } from "vitest";
import { STAGE2 } from "../../src/config";
import { createTrack, wrapDistance } from "../../src/core/track";

// docs/game-rules.md「ステージ2」の「線路・駅・見え方」（NORI-26）
// テストの一覧：1（線路の形）・3（輪をまたいでつながる）
const track = createTrack(STAGE2.trackPoints);

/** 線路を step m ごとに区切った点 */
const samples = (step: number) =>
  Array.from({ length: Math.floor(track.length / step) }, (_, i) => track.pointAt(i * step));

describe("線路の形（STAGE2.trackPoints）", () => {
  it("長さは STAGE2.trackLength ±1%", () => {
    expect(Math.abs(track.length - STAGE2.trackLength) / STAGE2.trackLength).toBeLessThanOrEqual(
      STAGE2.trackTolerance,
    );
  });

  it("閉じた輪：最後の点は最初の点に戻る", () => {
    const start = track.pointAt(0);
    const end = track.pointAt(track.length - 1e-6);
    expect(Math.hypot(end.x - start.x, end.y - start.y, end.z - start.z)).toBeLessThan(1e-3);
  });

  it("1つ目の制御点を通る（スタートの場所）", () => {
    const first = STAGE2.trackPoints[0];
    const p = track.pointAt(STAGE2.startDistance);
    expect(p.x).toBeCloseTo(first.x, 6);
    expect(p.y).toBeCloseTo(first.y, 6);
    expect(p.z).toBeCloseTo(first.z, 6);
  });

  it("傾きは STAGE2.maxSlope 以下、高低差は 9 m 以下", () => {
    const pts = samples(1);
    const ys = pts.map((p) => p.y);
    expect(Math.max(...ys) - Math.min(...ys)).toBeLessThanOrEqual(9 + 1e-9);
    for (let s = 0; s < track.length; s += 1) {
      expect(Math.abs(track.slopeAt(s)), `${s} m`).toBeLessThanOrEqual(STAGE2.maxSlope);
    }
  });

  it("曲がりの半径は STAGE2.minCurveRadius 以上（上から見て）", () => {
    const pts = samples(2);
    for (let i = 0; i < pts.length; i++) {
      const a = pts[(i + pts.length - 1) % pts.length];
      const b = pts[i];
      const c = pts[(i + 1) % pts.length];
      if (a === undefined || b === undefined || c === undefined) throw new Error("点がない");
      // 3点を通る円の半径（外接円）
      const ab = Math.hypot(b.x - a.x, b.z - a.z);
      const bc = Math.hypot(c.x - b.x, c.z - b.z);
      const ca = Math.hypot(a.x - c.x, a.z - c.z);
      const cross = Math.abs((b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x));
      const radius = cross < 1e-12 ? Number.POSITIVE_INFINITY : (ab * bc * ca) / (2 * cross);
      expect(radius, `${i * 2} m`).toBeGreaterThanOrEqual(STAGE2.minCurveRadius);
    }
  });

  it("区切りの長さは、点の間のまっすぐな距離とほぼ同じ（長さの表が正しい）", () => {
    for (let s = 0; s < track.length - 1; s += 37) {
      const p = track.pointAt(s);
      const q = track.pointAt(s + 1);
      expect(Math.hypot(q.x - p.x, q.y - p.y, q.z - p.z)).toBeCloseTo(1, 2);
    }
  });

  it("向き（heading）は、進む向き（距離が増える向き）を指す", () => {
    for (let s = 0; s < track.length; s += 50) {
      const p = track.pointAt(s);
      const q = track.pointAt(s + 0.5);
      const h = track.headingAt(s);
      // heading 0 のとき −Z を向く（types.ts の Pose2D）
      const fx = -Math.sin(h);
      const fz = -Math.cos(h);
      const len = Math.hypot(q.x - p.x, q.z - p.z);
      expect(((q.x - p.x) * fx + (q.z - p.z) * fz) / len, `${s} m`).toBeGreaterThan(0.99);
    }
  });
});

describe("輪をまたいでつながる（前にも後ろにも）", () => {
  it("wrapDistance は 0 以上・長さ未満に収める", () => {
    expect(wrapDistance(-1, 600)).toBeCloseTo(599, 9);
    expect(wrapDistance(601, 600)).toBeCloseTo(1, 9);
    expect(wrapDistance(600, 600)).toBe(0);
    expect(wrapDistance(-1200.5, 600)).toBeCloseTo(599.5, 9);
  });

  it("輪の長さの外の距離でも、同じ場所を返す", () => {
    const p = track.pointAt(10);
    const q = track.pointAt(10 + track.length);
    const r = track.pointAt(10 - track.length);
    expect(q.x).toBeCloseTo(p.x, 6);
    expect(r.z).toBeCloseTo(p.z, 6);
  });

  it("0 m のすぐ後ろ（−0.5 m）は、輪の終わりの近く", () => {
    const back = track.pointAt(-0.5);
    const start = track.pointAt(0);
    expect(Math.hypot(back.x - start.x, back.z - start.z)).toBeCloseTo(0.5, 2);
  });
});

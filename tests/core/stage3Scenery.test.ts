import { describe, expect, it } from "vitest";
import { SIM, STAGE3 } from "../../src/config";
import { runReplay } from "../../src/core/replay";
import { createStage3Game, type Stage3State } from "../../src/core/stage3";
import {
  birdPose,
  driftBalloonPosition,
  otherPlaneLapSeconds,
  otherPlanePose,
  sceneryTrees,
} from "../../src/core/stage3Scenery";
import type { InputFrame } from "../../src/core/types";

// docs/game-rules.md「ステージ3：空をにぎやかに」（NORI-60）。テストの一覧の 1〜5
const game = createStage3Game();
const rings = [game.goal, ...game.rings];
const dt = SIM.fixedDt;

/** 0〜lap 秒を、1 秒ごとに見る tick の列 */
const ticksOver = (sec: number) => Array.from({ length: Math.ceil(sec) + 1 }, (_, s) => Math.round(s / dt));
const dist3 = (a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }) =>
  Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
/** 山（円すい）の面より外か：その高さでの山の半径より、横の距離が clearance 以上大きい */
const outsideMountains = (p: { x: number; y: number; z: number }, clearance: number) =>
  STAGE3.mountains.every((m) => {
    const rAtY = p.y >= m.height ? 0 : m.radius * (1 - p.y / m.height);
    return Math.hypot(p.x - m.x, p.z - m.z) - rAtY >= clearance;
  });

/** 動く景色の点を、1周（またはゆれの1往復）ぶん全部 */
const movingPoints = () => [
  ...STAGE3.otherPlanes.flatMap((_, i) =>
    ticksOver(otherPlaneLapSeconds(i)).map((t) => ({ what: `飛行機${i}`, p: otherPlanePose(i, t) })),
  ),
  ...STAGE3.driftBalloons.flatMap((_, i) =>
    ticksOver(STAGE3.driftPeriod).map((t) => ({ what: `気球${i}`, p: driftBalloonPosition(i, t) })),
  ),
  ...STAGE3.birdFlocks.flatMap((_, f) =>
    Array.from({ length: STAGE3.birdsPerFlock }, (_, j) =>
      ticksOver((2 * Math.PI * STAGE3.birdCircleRadius) / STAGE3.birdSpeed).map((t) => ({
        what: `鳥${f}-${j}`,
        p: birdPose(f, j, t),
      })),
    ).flat(),
  ),
];

describe("1. 時刻だけで決まる", () => {
  it("同じ tick なら同じ位置。1周（1往復）の時間がたつと元の位置に戻る", () => {
    const t = 1234;
    expect(otherPlanePose(1, t)).toEqual(otherPlanePose(1, t));
    expect(birdPose(2, 3, t)).toEqual(birdPose(2, 3, t));
    for (let i = 0; i < STAGE3.otherPlanes.length; i++) {
      const lapTicks = otherPlaneLapSeconds(i) / dt;
      const a = otherPlanePose(i, t);
      const b = otherPlanePose(i, t + lapTicks);
      expect(b.x).toBeCloseTo(a.x, 6);
      expect(b.z).toBeCloseTo(a.z, 6);
    }
    for (let i = 0; i < STAGE3.driftBalloons.length; i++) {
      expect(driftBalloonPosition(i, t + STAGE3.driftPeriod / dt).y).toBeCloseTo(
        driftBalloonPosition(i, t).y,
        6,
      );
    }
  });
});

describe("2. ほかの飛行機", () => {
  it.each(STAGE3.otherPlanes.map((p, i) => ({ i, ...p })))(
    "飛行機 $i：半径 $radius m・高さ $height m・速さ STAGE3.otherPlaneSpeed、進む向きを向く",
    ({ i, radius, height }) => {
      for (const t of [0, 600, 4321]) {
        const a = otherPlanePose(i, t);
        const b = otherPlanePose(i, t + 1);
        expect(Math.hypot(a.x, a.z)).toBeCloseTo(radius, 6);
        expect(a.y).toBe(height);
        const speed = Math.hypot(b.x - a.x, b.z - a.z) / dt;
        expect(speed).toBeCloseTo(STAGE3.otherPlaneSpeed, 2);
        // 前は (−sin h, −cos h)。動いた向きと同じ
        const fx = -Math.sin(a.heading);
        const fz = -Math.cos(a.heading);
        expect(((b.x - a.x) * fx + (b.z - a.z) * fz) / (speed * dt)).toBeCloseTo(1, 3);
      }
    },
  );
});

describe("3. 輪・山・柵から離れている", () => {
  const points = movingPoints();

  it(`動く景色は、どの時刻でも、輪とゴールの中心から STAGE3.sceneryClearance m 以上`, () => {
    const near = points.filter(({ p }) => rings.some((r) => dist3(p, r) < STAGE3.sceneryClearance));
    expect(near.map((n) => n.what)).toEqual([]);
  });

  it("動く景色は、山の面から 5 m 以上、飛べる範囲の中、雲の下（中心が 50 m 以下）", () => {
    const bad = points.filter(
      ({ p }) =>
        !outsideMountains(p, 5) ||
        Math.max(Math.abs(p.x), Math.abs(p.z)) > STAGE3.boundsHalfSize ||
        p.y > 50 ||
        p.y < 10,
    );
    expect(bad.map((n) => n.what)).toEqual([]);
  });

  it("動く景色は、止まっている気球（当たる）から 10 m 以上", () => {
    const bad = points.filter(({ p }) => STAGE3.balloons.some((b) => dist3(p, b) - b.radius < 10));
    expect(bad.map((n) => n.what)).toEqual([]);
  });
});

describe("4. 気球と木", () => {
  it("ただよう気球は、中心 ± STAGE3.driftBob の中だけを上下する", () => {
    STAGE3.driftBalloons.forEach((b, i) => {
      const ys = ticksOver(STAGE3.driftPeriod * 3).map((t) => driftBalloonPosition(i, t).y);
      expect(Math.min(...ys)).toBeGreaterThanOrEqual(b.y - STAGE3.driftBob - 1e-9);
      expect(Math.max(...ys)).toBeLessThanOrEqual(b.y + STAGE3.driftBob + 1e-9);
      expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThan(STAGE3.driftBob);
    });
  });

  it("木は山の数 × STAGE3.treesPerMountain 本。山の外、輪の通り道から 20 m 以上、飛べる範囲の中", () => {
    const trees = sceneryTrees();
    expect(trees).toHaveLength(STAGE3.mountains.length * STAGE3.treesPerMountain);
    for (const t of trees) {
      expect(outsideMountains({ ...t, y: 0 }, STAGE3.treeRingMin - 1e-9)).toBe(true);
      expect(Math.abs(Math.hypot(t.x, t.z) - STAGE3.ringPathRadius)).toBeGreaterThanOrEqual(20);
      expect(Math.max(Math.abs(t.x), Math.abs(t.z))).toBeLessThanOrEqual(STAGE3.boundsHalfSize);
      expect(t.scale).toBeGreaterThanOrEqual(STAGE3.treeScaleMin);
      expect(t.scale).toBeLessThanOrEqual(STAGE3.treeScaleMax);
    }
    expect(sceneryTrees()).toEqual(trees);
  });
});

describe("5. 当たり判定はない", () => {
  it("ただよう気球の中を飛んでも、押し戻されず、速さも変わらない", () => {
    const tick = 0;
    const b = driftBalloonPosition(0, tick);
    // 気球の中心の 10 m 手前から、気球へまっすぐ（heading 0 は −Z へ進む）
    const s0 = game.initial();
    const start: Stage3State = {
      ...s0,
      tick,
      plane: { ...s0.plane, x: b.x, y: b.y, z: b.z + 10, heading: 0, pitch: 0, bank: 0 },
    };
    const none: InputFrame = { throttle: 0, steer: 0 };
    const end = runReplay(
      game,
      start,
      Array.from({ length: 90 }, () => none),
    );
    expect(end.plane.x).toBeCloseTo(b.x, 6);
    expect(end.plane.z).toBeLessThan(b.z - 5);
    expect(end.plane.speed).toBeCloseTo(start.plane.speed, 6);
  });
});

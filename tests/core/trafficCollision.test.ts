// 一覧 7（docs/test-plans/NORI-61.md）：子どもの車がほかの車・自転車・バイク・人にぶつかったら、建物と同じ扱い
// （速度が CAR.bumpSpeedFactor に落ちるだけ。最初に戻さない）。docs/game-rules.md「街をにぎやかに」。
//
// 決めた API：createCarPhysics(layout, PHYSICS, CAR.collisionRadius, movers) の movers は動く物の形（数と形は最初に決める）。
// step(state, input, dt, CAR, STAGE1, poses) の poses は、その刻みの動く物の位置と向き（movers と同じ順）。
import { beforeAll, describe, expect, it } from "vitest";
import { ASSET, CAR, PHYSICS, SIM, STAGE1, TRAFFIC } from "../../src/config";
import { createCarState } from "../../src/core/car";
import { createCarPhysics, type CarPhysics, type MoverShape } from "../../src/core/physics";
import { createStage1Layout } from "../../src/core/stage1Layout";
import type { CarState, InputFrame, Pose2D } from "../../src/core/types";

const dt = SIM.fixedDt;
const GAS: InputFrame = { throttle: 1, steer: 0 };
const SKIN = 0.05;
const bus = ASSET.city.sizes.bus;
const shapes: MoverShape[] = [
  { kind: "box", halfWidth: bus.width / 2, halfLength: bus.length / 2 },
  { kind: "circle", radius: TRAFFIC.personRadius },
];
/** スタート（道の真ん中、−z を向く）。前は空いている道 */
const start = (): CarState => createCarState(STAGE1.start);
const away: Pose2D = { x: 1000, z: 1000, heading: 0 };

/** 上から見た、点と「向きのある箱」の間の距離（箱の中なら 0） */
const distanceToBox = (x: number, z: number, pose: Pose2D, hw: number, hl: number): number => {
  const dx = x - pose.x;
  const dz = z - pose.z;
  // 箱の向きの座標へ：前（−z を heading だけ回した向き）と右
  const f = { x: -Math.sin(pose.heading), z: -Math.cos(pose.heading) };
  const along = dx * f.x + dz * f.z;
  const side = dx * -f.z + dz * f.x;
  return Math.hypot(Math.max(Math.abs(side) - hw, 0), Math.max(Math.abs(along) - hl, 0));
};

let physics: CarPhysics;
beforeAll(async () => {
  physics = await createCarPhysics(createStage1Layout(STAGE1), PHYSICS, CAR.collisionRadius, shapes);
});

const run = (poses: (tick: number) => Pose2D[], seconds: number, each: (s: CarState) => void): CarState => {
  let s = start();
  for (let t = 0; t < Math.round(seconds / dt); t++) {
    s = physics.step(s, GAS, dt, CAR, STAGE1, poses(t));
    each(s);
  }
  return s;
};

describe("ほかの車・人にぶつかったとき（建物と同じ扱い）", () => {
  // 道を横切る向きに止まっているバス（スタートの 25 m 先）
  const busPose: Pose2D = { x: 0, z: -25, heading: Math.PI / 2 };

  it("正面から当たると止まり、バスの中に入らない。触れている", () => {
    let minDistance = Infinity;
    const end = run(
      () => [busPose, away],
      5,
      (s) => {
        minDistance = Math.min(minDistance, distanceToBox(s.x, s.z, busPose, bus.width / 2, bus.length / 2));
      },
    );
    expect(minDistance).toBeGreaterThanOrEqual(CAR.collisionRadius - SKIN);
    expect(Math.abs(end.speed)).toBeLessThan(0.5);
    expect(end.touching).toBe(true);
  });

  it(`当たった瞬間に速度が ${CAR.bumpSpeedFactor * 100}% になる（1回だけ）。最初の場所には戻らない`, () => {
    let before = 0;
    let atImpact: number | null = null;
    const end = run(
      () => [busPose, away],
      5,
      (s) => {
        if (atImpact === null && s.touching) atImpact = Math.abs(s.speed);
        else if (atImpact === null) before = Math.abs(s.speed);
      },
    );
    expect(before).toBeGreaterThan(5);
    expect(atImpact ?? Infinity).toBeLessThanOrEqual(
      before * CAR.bumpSpeedFactor + CAR.acceleration * dt + 1e-6,
    );
    // バスの手前にいる（スタートに戻されていない）
    expect(end.z).toBeLessThan(-15);
  });

  it(`人（半径 ${TRAFFIC.personRadius} m）にも当たって止まり、重ならない`, () => {
    const person: Pose2D = { x: 0, z: -20, heading: 0 };
    let minDistance = Infinity;
    const end = run(
      () => [away, person],
      5,
      (s) => {
        minDistance = Math.min(minDistance, Math.hypot(s.x - person.x, s.z - person.z));
      },
    );
    expect(minDistance).toBeGreaterThanOrEqual(CAR.collisionRadius + TRAFFIC.personRadius - SKIN);
    expect(end.touching).toBe(true);
  });

  it("動く物の位置は刻みごとに置き直される：はじめ遠くにいたバスが、途中で前に来たら当たる", () => {
    let touched = false;
    run(
      (t) => [t < 30 ? away : busPose, away],
      5,
      (s) => {
        touched ||= s.touching;
      },
    );
    expect(touched).toBe(true);
  });

  it("動く物がいなければ（遠く）、前の 25 m は何にも触れない", () => {
    let touched = false;
    run(
      () => [away, away],
      2,
      (s) => {
        touched ||= s.touching;
      },
    );
    expect(touched).toBe(false);
  });
});

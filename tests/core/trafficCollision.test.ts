// 一覧 7（docs/test-plans/NORI-61.md）：子どもの車がほかの車・自転車・バイク・人にぶつかったら、建物と同じ扱い
// （速度が CAR.bumpSpeedFactor に落ちるだけ。最初に戻さない）。docs/game-rules.md「街をにぎやかに」。
//
// 決めた API：createCarPhysics(layout, PHYSICS, CAR.collisionRadius, movers) の movers は動く物の形（数と形は最初に決める）。
// step(state, input, dt, CAR, STAGE1, poses) の poses は、その刻みの動く物の位置と向き（movers と同じ順）。
import { beforeAll, describe, expect, it } from "vitest";
import { ASSET, CAR, PHYSICS, SIM, STAGE1, TRAFFIC } from "../../src/config";
import { createCarState } from "../../src/core/car";
import { trafficShapes } from "../../src/core/game";
import { createCarPhysics, type CarPhysics, type MoverShape } from "../../src/core/physics";
import { createStage1Layout } from "../../src/core/stage1Layout";
import { createTraffic } from "../../src/core/traffic";
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

// NORI-70（初見レビュー 61-3・61-28・R2-61-2・R2-61-30）：上の節はテスト用の手作りの形（バスと人だけ）。
// ここはゲームと同じ形（trafficShapes）で、自転車・バイク（半径 0.6 m）と、「30% は当たった瞬間だけ」を確かめる
describe("ゲームと同じ当たりの形（NORI-70）", () => {
  const traffic = createTraffic(TRAFFIC, ASSET.city.sizes, STAGE1.route, CAR.collisionRadius);
  const first = traffic.initial();
  const shapes = trafficShapes(first);
  const nVehicles = TRAFFIC.vehicles.length;
  const nBikes = first.bikes.length;
  let game: CarPhysics;
  beforeAll(async () => {
    game = await createCarPhysics(createStage1Layout(STAGE1), PHYSICS, CAR.collisionRadius, shapes);
  });
  /** 動く物の位置：k 番目だけ pose に置き、ほかは遠く */
  const only = (k: number, pose: Pose2D): Pose2D[] => shapes.map((_, i) => (i === k ? pose : away));

  it("形は traffic.poses と同じ順・同じ数。車はモデルの幅・長さの箱、自転車・バイクは 0.6 m、人は 0.4 m の円", () => {
    const poses = traffic.poses(first);
    expect(shapes).toHaveLength(poses.vehicles.length + poses.bikes.length + poses.people.length);
    TRAFFIC.vehicles.forEach((v, i) => {
      const size = ASSET.city.sizes[v.model];
      expect(shapes[i]).toEqual({ kind: "box", halfWidth: size.width / 2, halfLength: size.length / 2 });
    });
    for (let i = 0; i < nBikes; i++) {
      expect(shapes[nVehicles + i]).toEqual({ kind: "circle", radius: TRAFFIC.bikeRadius });
    }
    for (let i = nVehicles + nBikes; i < shapes.length; i++) {
      expect(shapes[i]).toEqual({ kind: "circle", radius: TRAFFIC.personRadius });
    }
  });

  it(`自転車・バイク（半径 ${TRAFFIC.bikeRadius} m）にも当たって止まり、重ならない`, () => {
    const bike: Pose2D = { x: 0, z: -20, heading: 0 };
    let s = start();
    let minDistance = Infinity;
    let touched = false;
    for (let t = 0; t < Math.round(5 / dt); t++) {
      s = game.step(s, GAS, dt, CAR, STAGE1, only(nVehicles, bike));
      touched ||= s.touching;
      minDistance = Math.min(minDistance, Math.hypot(s.x - bike.x, s.z - bike.z));
    }
    expect(minDistance).toBeGreaterThanOrEqual(CAR.collisionRadius + TRAFFIC.bikeRadius - SKIN);
    expect(touched).toBe(true);
  });

  it(`横に止まったバスに触れたまま並んで走ると、速さが ${CAR.bumpSpeedFactor * 100}% になるのは触れた最初の刻みだけ`, () => {
    const bus0 = TRAFFIC.vehicles.findIndex((v) => v.model === "bus");
    const size = ASSET.city.sizes.bus;
    // 子どもの車（x 0 を −z へ）の右に、同じ向きのバス。横のすき間は「触れている」と数える幅（touchMargin）の半分
    const side: Pose2D = {
      x: size.width / 2 + CAR.collisionRadius + PHYSICS.touchMargin / 2,
      z: -15,
      heading: 0,
    };
    let s: CarState = { ...start(), speed: 6 };
    let firstTouch: { before: number; after: number } | null = null;
    let touchingTicks = 0;
    for (let t = 0; t < Math.round(3 / dt); t++) {
      const before = s;
      s = game.step(s, GAS, dt, CAR, STAGE1, only(bus0, side));
      if (s.touching && !before.touching && firstTouch === null) {
        firstTouch = { before: before.speed, after: s.speed };
      } else if (s.touching && before.touching) {
        touchingTicks++;
        // 触れ続けている間は、もう落とさない（横に動けるので、加速して速くなる）
        expect(s.speed).toBeGreaterThanOrEqual(before.speed - 1e-6);
      }
    }
    expect(firstTouch).not.toBeNull();
    expect(firstTouch?.after).toBeLessThanOrEqual(
      (firstTouch?.before ?? 0) * CAR.bumpSpeedFactor + CAR.acceleration * dt + 1e-6,
    );
    expect(touchingTicks).toBeGreaterThan(10); // 本当に触れたまま並んで走った
    expect(s.z).toBeLessThan(side.z - size.length / 2); // バスの横を通りぬけた
  });
});

// NORI-63（docs/test-plans/NORI-63.md の 1〜3）：ほかの車は、次の刻みの位置で体（長さ × 幅）を
// 「子どもの車の半径 ＋ TRAFFIC.overlapMargin」だけ広げた角の丸い四角に子どもの車の中心が入り、しかも今より近づくなら、
// その刻みは進まない（離れていく・同じ距離のまま並んで進むときは止めない）
describe("ほかの車は、動いて子どもの車に食いこまない（NORI-63）", () => {
  const traffic = createTraffic(TRAFFIC, ASSET.city.sizes, STAGE1.route, CAR.collisionRadius);
  const size = ASSET.city.sizes[TRAFFIC.vehicles[0]?.model ?? "traffic-car"] ?? { width: 1.8, length: 4.2 };
  const keep = CAR.collisionRadius + TRAFFIC.overlapMargin;
  /** 車 0 の前の端から front m 先・中心線から side m（進む向きの右が正。NORI-69 の2回目の初見レビューで「左」の誤りを直した）の点 */
  const pointNear = (front: number, side: number) => {
    const pose = traffic.poses(traffic.initial()).vehicles[0] as Pose2D;
    const f = { x: -Math.sin(pose.heading), z: -Math.cos(pose.heading) };
    const along = size.length / 2 + front;
    return { x: pose.x + f.x * along + f.z * -side, z: pose.z + f.z * along - f.x * -side };
  };
  const vehicle0 = (s: ReturnType<typeof traffic.initial>) => traffic.poses(s).vehicles[0] as Pose2D;
  // 物理の当たりの形も、ほかの車（traffic-car）の大きさで作る
  let carPhysics: CarPhysics;
  beforeAll(async () => {
    carPhysics = await createCarPhysics(createStage1Layout(STAGE1), PHYSICS, CAR.collisionRadius, [
      { kind: "box", halfWidth: size.width / 2, halfLength: size.length / 2 },
      { kind: "circle", radius: TRAFFIC.personRadius },
    ]);
  });

  it("1. 先頭のすぐ前（止まりきれない 2.25 m より内側の 1.5 m）に入られても、体と 1.3 m の間をあけて止まる", () => {
    const child = pointNear(1.5, 0);
    let s = traffic.initial();
    let minGap = Infinity;
    let biggestDrop = 0; // 1刻みで落ちた速さのいちばん大きいもの
    for (let t = 0; t < 120; t++) {
      const before = s.vehicles[0]?.speed ?? 0;
      s = traffic.step(s, child, dt);
      biggestDrop = Math.max(biggestDrop, before - (s.vehicles[0]?.speed ?? 0));
      minGap = Math.min(
        minGap,
        distanceToBox(child.x, child.z, vehicle0(s), size.width / 2, size.length / 2),
      );
    }
    // 角の丸い四角（体から keep）の中へは、1刻みも入らない（NORI-69 の初見レビュー：前は 0.1 m ゆるめていた）
    expect(minGap).toBeGreaterThan(keep);
    expect(s.vehicles[0]?.speed).toBe(0);
    // ブレーキ（8 m/s² × 1/60 秒 ≈ 0.13 m/s）を待たず、その刻みで速さを 0 にした
    expect(biggestDrop).toBeGreaterThan(TRAFFIC.braking * dt * 2);
  });

  // NORI-69 の初見レビュー：前の 2 は子どもの車を「止まる範囲（前 10 m・左右 3 m）」の中に置いていて、ふだんのブレーキで止まり、
  // NORI-63 の判定を一度も通らなかった（判定を外しても通った）。ルールに足した「近づくときだけ止まる」を確かめる形に作り直した
  it("2. 体の右横 1.0 m（角の丸い四角の中）に止まっている子どもの車からは、止まらずに離れていく（近づかないので止めない）", () => {
    // 体の真横（前の端より 1 m 後ろ）。ここは「止まる範囲」（前の端より前）の外
    const child = pointNear(-1, size.width / 2 + 1.0);
    let s = traffic.initial();
    const first = distanceToBox(child.x, child.z, vehicle0(s), size.width / 2, size.length / 2);
    expect(first).toBeLessThanOrEqual(keep); // はじめから中にいる
    let minGap = first;
    for (let t = 0; t < 120; t++) {
      s = traffic.step(s, child, dt);
      // 1刻みも止めない（最後の速さだけでは、途中で止まって 3 m/s² で戻った場合も通ってしまう）
      expect(s.vehicles[0]?.speed).toBe(TRAFFIC.speed);
      minGap = Math.min(
        minGap,
        distanceToBox(child.x, child.z, vehicle0(s), size.width / 2, size.length / 2),
      );
    }
    expect(minGap).toBeGreaterThanOrEqual(first - 1e-9); // 近づかない
    expect(s.vehicles[0]?.speed).toBe(TRAFFIC.speed); // 止まったままにならない
    const last = distanceToBox(child.x, child.z, vehicle0(s), size.width / 2, size.length / 2);
    expect(last).toBeGreaterThan(keep); // 2 秒で離れた
  });

  it("3. 走っている子どもの車が、動いている車へ横から入っても、すり抜けない（重ならない）", () => {
    // 車 0 の 4 m 先の横 8 m から、車の道を横切る向きに全速で
    const from = pointNear(4, 8);
    const to = pointNear(4, -8);
    let car: CarState = {
      ...createCarState({ x: from.x, z: from.z, heading: Math.atan2(-(to.x - from.x), -(to.z - from.z)) }),
      speed: CAR.maxForwardSpeed,
    };
    let s = traffic.initial();
    let minGap = Infinity;
    let touched = false;
    for (let t = 0; t < 180; t++) {
      s = traffic.step(s, { x: car.x, z: car.z }, dt);
      const poses = traffic.poses(s);
      car = carPhysics.step(car, GAS, dt, CAR, STAGE1, [poses.vehicles[0] as Pose2D, away]);
      touched ||= car.touching;
      minGap = Math.min(
        minGap,
        distanceToBox(car.x, car.z, poses.vehicles[0] as Pose2D, size.width / 2, size.length / 2),
      );
    }
    // 車の体と子どもの車（半径）が重ならない（物理の皮 SKIN の分だけ近づいてよい）
    expect(minGap).toBeGreaterThanOrEqual(CAR.collisionRadius - SKIN);
    // 本当に当たった（前を通り過ぎただけで通るテストにしない。NORI-69 の2回目の初見レビュー）
    expect(touched).toBe(true);
  });
});

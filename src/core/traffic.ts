// ステージ1の街のほかの車・自転車・バイク・歩行者（NORI-61。docs/game-rules.md「街をにぎやかに」）。
// 位置は刻みごとにここで決める（子どもの車の位置で止まるので、描画では決められない）。
// 純粋な関数：同じ状態・同じ子どもの位置 → 同じ結果。元の状態は書き換えない。JSON にそのまま保存できる形だけ。
import { pointAlong, type Point } from "./course";
import { createLoopPath, type LoopPath } from "./loopPath";
import { wrapDistance } from "./track";
import type { Pose2D } from "./types";

/** 道の上の1台：道の上の距離（m）と速さ（m/s） */
export type Mover = { readonly s: number; readonly speed: number };
export type BikeKind = "bicycle" | "motorbike";
export type Bike = Mover & { readonly kind: BikeKind };
/** 歩行者：辺の中の歩く所の始まりからの距離 u（0〜sideLength m）と、歩く向き（1 = 前、−1 = 後ろ） */
export type Walker = { readonly u: number; readonly dir: 1 | -1 };

export type TrafficState = {
  /** 四角い道を回る車（TRAFFIC.vehicles と同じ順。start の小さい順） */
  readonly vehicles: readonly Mover[];
  /** コースの左を回る自転車・バイク（start の小さい順。i の前は i+1、最後の前は最初） */
  readonly bikes: readonly Bike[];
  /** 歩行者（TRAFFIC.people.blockSides と同じ順） */
  readonly people: readonly Walker[];
};

type BikeGroup = { readonly count: number; readonly speed: number; readonly starts: readonly number[] };

export type TrafficConfig = {
  readonly loop: readonly Point[];
  readonly laneOffset: number;
  readonly cornerRadius: number;
  readonly vehicles: readonly { readonly model: string; readonly start: number }[];
  readonly speed: number;
  readonly acceleration: number;
  readonly braking: number;
  readonly stopAhead: number;
  readonly stopSide: number;
  readonly followGap: number;
  readonly bikeOffset: number;
  readonly bicycles: BikeGroup;
  readonly motorbikes: BikeGroup;
  readonly bikeStopRadius: number;
  readonly bikeFollowGap: number;
  readonly people: {
    readonly count: number;
    readonly sideLength: number;
    readonly offset: number;
    readonly blockLength: number;
    readonly blockSides: readonly number[];
  };
  readonly walkSpeed: number;
  readonly walkStopRadius: number;
};

export type TrafficPoses = {
  readonly vehicles: readonly Pose2D[];
  readonly bikes: readonly Pose2D[];
  readonly people: readonly Pose2D[];
};

export type Traffic = {
  /** ほかの車の道 */
  readonly path: LoopPath;
  /** 自転車・バイクの道 */
  readonly bikePath: LoopPath;
  initial(): TrafficState;
  /** 1刻み進める。child は子どもの車の中心 */
  step(state: TrafficState, child: Point, dt: number): TrafficState;
  /** 上から見た位置と向き（描画・当たり判定が使う） */
  poses(state: TrafficState): TrafficPoses;
};

/** 速さを目標へ近づける（上げるときは up、下げるときは down） */
const approach = (speed: number, target: number, up: number, down: number, dt: number): number =>
  speed < target ? Math.min(target, speed + up * dt) : Math.max(target, speed - down * dt);

const headingOf = (dx: number, dz: number): number => Math.atan2(-dx, -dz);
const near = (a: Point, b: Point, radius: number): boolean => Math.hypot(a.x - b.x, a.z - b.z) <= radius;

const checkStarts = (starts: readonly number[], what: string): void => {
  if (starts.some((s, i) => i > 0 && s <= (starts[i - 1] as number))) {
    throw new Error(`${what} は start の小さい順に並べる（前を決めるため）`);
  }
};

export const createTraffic = (
  config: TrafficConfig,
  sizes: Readonly<Record<string, { readonly length: number }>>,
  courseRoute: readonly Point[],
): Traffic => {
  const lengthOfModel = (model: string): number => {
    const size = sizes[model];
    if (!size) throw new Error(`モデル ${model} の大きさがない`);
    return size.length;
  };

  // ---- 車 ----
  const path = createLoopPath(config.loop, config.laneOffset, config.cornerRadius);
  const lengths = config.vehicles.map((v) => lengthOfModel(v.model));
  checkStarts(
    config.vehicles.map((v) => v.start),
    "TRAFFIC.vehicles",
  );
  const n = lengths.length;
  const lengthOf = (i: number): number => lengths[i] as number;

  /** 子どもの車が、車 i の前の端から前へ stopAhead m・左右 stopSide m の中にいるか */
  const childAhead = (v: Mover, i: number, child: Point): boolean => {
    const p = path.pointAt(v.s);
    const h = path.headingAt(v.s);
    const fx = -Math.sin(h);
    const fz = -Math.cos(h);
    const dx = child.x - p.x;
    const dz = child.z - p.z;
    const ahead = dx * fx + dz * fz - lengthOf(i) / 2; // 前の端からの距離
    const side = dx * fz - dz * fx; // 中心線からの左右（左が正）
    return ahead >= 0 && ahead <= config.stopAhead && Math.abs(side) <= config.stopSide;
  };

  /** 輪の上で、i の前の端から i+1 の後ろの端まで */
  const gapOnLoop = (movers: readonly Mover[], i: number, loopLength: number, len: (k: number) => number) => {
    const j = (i + 1) % movers.length;
    return (
      wrapDistance((movers[j] as Mover).s - (movers[i] as Mover).s, loopLength) - len(i) / 2 - len(j) / 2
    );
  };

  // ---- 自転車・バイク ----
  const bikePath = createLoopPath(courseRoute, config.bikeOffset, config.cornerRadius);
  const groups: [BikeKind, BikeGroup][] = [
    ["bicycle", config.bicycles],
    ["motorbike", config.motorbikes],
  ];
  for (const [kind, g] of groups) {
    if (g.starts.length !== g.count) throw new Error(`TRAFFIC の ${kind} の starts の数が count と違う`);
  }
  const bikeOrder = groups
    .flatMap(([kind, g]) => g.starts.map((start) => ({ kind, start, speed: g.speed })))
    .sort((a, b) => a.start - b.start);
  checkStarts(
    bikeOrder.map((b) => b.start),
    "TRAFFIC の自転車・バイク",
  );
  const bikeLengths = bikeOrder.map((b) => lengthOfModel(b.kind));

  // ---- 歩行者 ----
  const people = config.people;
  if (people.blockSides.length !== people.count)
    throw new Error("TRAFFIC.people の blockSides の数が count と違う");
  const closedRoute = [...courseRoute, courseRoute[0] as Point];
  const margin = (people.blockLength - people.sideLength) / 2;
  const sides = people.blockSides.map((side, k) => {
    const a = pointAlong(closedRoute, side * people.blockLength);
    const b = pointAlong(closedRoute, (side + 1) * people.blockLength);
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    const dir = { x: (b.x - a.x) / len, z: (b.z - a.z) / len };
    const sign = k % 2 === 0 ? 1 : -1; // 左・右・左…
    const left = { x: dir.z * sign * people.offset, z: -dir.x * sign * people.offset };
    return { start: { x: a.x + dir.x * margin + left.x, z: a.z + dir.z * margin + left.z }, dir };
  });
  const walkerAt = (w: Walker, k: number): Point => {
    const side = sides[k] as (typeof sides)[number];
    return { x: side.start.x + side.dir.x * w.u, z: side.start.z + side.dir.z * w.u };
  };

  const stepWalker = (w: Walker, k: number, child: Point, dt: number): Walker => {
    if (near(walkerAt(w, k), child, config.walkStopRadius)) return w;
    const u = w.u + w.dir * config.walkSpeed * dt;
    if (u > people.sideLength) return { u: 2 * people.sideLength - u, dir: -1 };
    if (u < 0) return { u: -u, dir: 1 };
    return { u, dir: w.dir };
  };

  const poseOn = (loop: LoopPath, s: number): Pose2D => ({ ...loop.pointAt(s), heading: loop.headingAt(s) });

  return {
    path,
    bikePath,
    initial: () => ({
      vehicles: config.vehicles.map((v) => ({ s: v.start, speed: config.speed })),
      bikes: bikeOrder.map((b) => ({ kind: b.kind, s: b.start, speed: b.speed })),
      people: people.blockSides.map((_, k) => ({
        u: (people.sideLength * k) / people.count,
        dir: 1 as const,
      })),
    }),
    step: (state, child, dt) => ({
      vehicles: state.vehicles.map((v, i) => {
        const blocked = n > 1 && gapOnLoop(state.vehicles, i, path.length, lengthOf) < config.followGap;
        const stop = childAhead(v, i, child) || blocked;
        const speed = approach(v.speed, stop ? 0 : config.speed, config.acceleration, config.braking, dt);
        return { s: wrapDistance(v.s + speed * dt, path.length), speed };
      }),
      bikes: state.bikes.map((b, i) => {
        const blocked =
          state.bikes.length > 1 &&
          gapOnLoop(state.bikes, i, bikePath.length, (k) => bikeLengths[k] as number) < config.bikeFollowGap;
        const stop = blocked || near(bikePath.pointAt(b.s), child, config.bikeStopRadius);
        const speed = stop ? 0 : (bikeOrder[i]?.speed ?? 0);
        return { kind: b.kind, s: wrapDistance(b.s + speed * dt, bikePath.length), speed };
      }),
      people: state.people.map((w, k) => stepWalker(w, k, child, dt)),
    }),
    poses: (state) => ({
      vehicles: state.vehicles.map((v) => poseOn(path, v.s)),
      bikes: state.bikes.map((b) => poseOn(bikePath, b.s)),
      people: state.people.map((w, k) => {
        const dir = (sides[k] as (typeof sides)[number]).dir;
        return { ...walkerAt(w, k), heading: headingOf(dir.x * w.dir, dir.z * w.dir) };
      }),
    }),
  };
};

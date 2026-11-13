// ステージ1の街のほかの車・自転車・バイク・歩行者（NORI-61。docs/game-rules.md「街をにぎやかに」）。
// 位置は刻みごとにここで決める（子どもの車の位置で止まるので、描画では決められない）。
// 純粋な関数：同じ状態・同じ子どもの位置 → 同じ結果。元の状態は書き換えない。JSON にそのまま保存できる形だけ。
import type { Point } from "./course";
import type { LoopPath } from "./loopPath";
import { wrapDistance } from "./track";

/** 道の上の1台：道の上の距離（m）と速さ（m/s） */
export type Mover = { readonly s: number; readonly speed: number };

export type TrafficState = {
  /** 四角い道を回る車（TRAFFIC.vehicles と同じ順） */
  readonly vehicles: readonly Mover[];
};

export type TrafficConfig = {
  readonly vehicles: readonly { readonly model: string; readonly start: number }[];
  readonly speed: number;
  readonly acceleration: number;
};

export const createTrafficState = (config: TrafficConfig): TrafficState => ({
  vehicles: config.vehicles.map((v) => ({ s: v.start, speed: config.speed })),
});

/** 速さを目標へ近づける（上げるときは acceleration、下げるときは braking） */
const approach = (speed: number, target: number, up: number, down: number, dt: number): number =>
  speed < target ? Math.min(target, speed + up * dt) : Math.max(target, speed - down * dt);

export const stepTraffic = (
  state: TrafficState,
  _child: Point,
  dt: number,
  config: TrafficConfig,
  path: LoopPath,
): TrafficState => ({
  vehicles: state.vehicles.map((v) => {
    const speed = approach(v.speed, config.speed, config.acceleration, config.acceleration, dt);
    return { s: wrapDistance(v.s + speed * dt, path.length), speed };
  }),
});

// ステージ1の街のほかの車・自転車・バイク・歩行者（NORI-61。docs/game-rules.md「街をにぎやかに」）。
// 位置は刻みごとにここで決める（子どもの車の位置で止まるので、描画では決められない）。
// 純粋な関数：同じ状態・同じ子どもの位置 → 同じ結果。元の状態は書き換えない。JSON にそのまま保存できる形だけ。
import type { Point } from "./course";
import { createLoopPath, type LoopPath } from "./loopPath";
import { wrapDistance } from "./track";

/** 道の上の1台：道の上の距離（m）と速さ（m/s） */
export type Mover = { readonly s: number; readonly speed: number };

export type TrafficState = {
  /** 四角い道を回る車（TRAFFIC.vehicles と同じ順。start の小さい順に並べる） */
  readonly vehicles: readonly Mover[];
};

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
};

export type Traffic = {
  /** ほかの車の道（描画もこれを使う） */
  readonly path: LoopPath;
  initial(): TrafficState;
  /** 1刻み進める。child は子どもの車の中心 */
  step(state: TrafficState, child: Point, dt: number): TrafficState;
};

/** 速さを目標へ近づける（上げるときは up、下げるときは down） */
const approach = (speed: number, target: number, up: number, down: number, dt: number): number =>
  speed < target ? Math.min(target, speed + up * dt) : Math.max(target, speed - down * dt);

export const createTraffic = (
  config: TrafficConfig,
  sizes: Readonly<Record<string, { readonly length: number }>>,
): Traffic => {
  const path = createLoopPath(config.loop, config.laneOffset, config.cornerRadius);
  const lengths = config.vehicles.map((v) => {
    const size = sizes[v.model];
    if (!size) throw new Error(`車のモデル ${v.model} の大きさがない`);
    return size.length;
  });
  const starts = config.vehicles.map((v) => v.start);
  if (starts.some((s, i) => i > 0 && s <= (starts[i - 1] as number))) {
    throw new Error("TRAFFIC.vehicles は start の小さい順に並べる（前の車を決めるため）");
  }
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

  /** 車 i の前の端から、前の車（i+1。最後の車の前は最初の車）の後ろの端まで */
  const gapAhead = (vehicles: readonly Mover[], i: number): number => {
    const j = (i + 1) % n;
    const me = vehicles[i] as Mover;
    const front = vehicles[j] as Mover;
    return wrapDistance(front.s - me.s, path.length) - lengthOf(i) / 2 - lengthOf(j) / 2;
  };

  return {
    path,
    initial: () => ({ vehicles: config.vehicles.map((v) => ({ s: v.start, speed: config.speed })) }),
    step: (state, child, dt) => ({
      vehicles: state.vehicles.map((v, i) => {
        const stop = childAhead(v, i, child) || (n > 1 && gapAhead(state.vehicles, i) < config.followGap);
        const speed = approach(v.speed, stop ? 0 : config.speed, config.acceleration, config.braking, dt);
        return { s: wrapDistance(v.s + speed * dt, path.length), speed };
      }),
    }),
  };
};

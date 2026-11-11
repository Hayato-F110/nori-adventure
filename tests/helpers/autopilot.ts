// テストと E2E の入力記録づくりに使う「自動運転」。ゲームには入らない（隠れた補正ではない）。
// 道すじ（道の中心線）の上で、今いる所より少し先の点を追いかける（pure pursuit）。角の手前では速度を落とす。
import type { GameState, InputFrame } from "../../src/core/types";

type Point = { readonly x: number; readonly z: number };

const LOOK_AHEAD = 4; // m
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

/** 道すじの区間 from 以降で、いちばん近い点までの、道すじの最初からの距離 */
const progressOn = (route: readonly Point[], from: number, p: Point): number => {
  let best = { d: Number.POSITIVE_INFINITY, s: 0 };
  let s0 = 0;
  for (let i = 1; i < route.length; i++) {
    const a = route[i - 1] as Point;
    const b = route[i] as Point;
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    if (i - 1 >= from) {
      const t = Math.max(
        0,
        Math.min(1, ((p.x - a.x) * (b.x - a.x) + (p.z - a.z) * (b.z - a.z)) / (len * len)),
      );
      const d = Math.hypot(a.x + (b.x - a.x) * t - p.x, a.z + (b.z - a.z) * t - p.z);
      if (d < best.d) best = { d, s: s0 + t * len };
    }
    s0 += len;
  }
  return best.s;
};

const pointAt = (route: readonly Point[], s: number): Point => {
  let left = s;
  for (let i = 1; i < route.length; i++) {
    const a = route[i - 1] as Point;
    const b = route[i] as Point;
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    if (left <= len) return { x: a.x + ((b.x - a.x) * left) / len, z: a.z + ((b.z - a.z) * left) / len };
    left -= len;
  }
  return route[route.length - 1] as Point;
};

/** 次の角までの距離（道すじに沿って） */
const toNextCorner = (route: readonly Point[], s: number): number => {
  let acc = 0;
  for (let i = 1; i < route.length; i++) {
    const a = route[i - 1] as Point;
    const b = route[i] as Point;
    acc += Math.hypot(b.x - a.x, b.z - a.z);
    if (acc > s) return acc - s;
  }
  return 0;
};

export const autopilot = (state: GameState, route: readonly Point[]): InputFrame => {
  const { car } = state;
  const s = progressOn(route, state.course.nextCheckpoint, car);
  const target = pointAt(route, s + LOOK_AHEAD);
  const want = Math.atan2(-(target.x - car.x), -(target.z - car.z));
  const error = wrap(want - car.heading);
  // heading は左回りが正。ハンドル +1（右）で heading が減る
  const steer = Math.max(-1, Math.min(1, -error * 3));
  // 角の手前と、向きが大きくずれているときはゆっくり
  const slow = toNextCorner(route, s) < 10 || Math.abs(error) > 0.4;
  const throttle = slow ? (car.speed > 4 ? -0.3 : 0.6) : 1;
  return { throttle, steer };
};

// NORI-37：E2E の運転役（src/input/testDriver.ts）。ページを開く前に入れ、ゲームの刻みごとに入力を決める。
// 本物の時間でキーを押す代わりに、状態だけから入力を決めるので、フレームの速さ（CI の 3 fps でも）に関係なく
// 毎回同じ入力の並び → 同じ結果になる。運転の仕方はここ（テストの側）だけに置く。
import type { Page } from "@playwright/test";

export type Waypoint = { x: number; z: number };

export type CarDriverOptions = {
  /** 順に目指す点（最後まで行ったら、loop なら最初へ戻る。そうでなければ最後の点を目指し続ける） */
  waypoints: readonly Waypoint[];
  /** この距離（m）まで近づいたら、次の点へ */
  turnAhead: number;
  loop: boolean;
  /** 向きのずれ（rad）にかけて、ハンドルの量にする */
  steerGain: number;
  /** 向きのずれがこれより大きいときは、アクセルを slowThrottle にゆるめる */
  slowAngle: number;
  slowThrottle: number;
};

/**
 * ステージ1の車の運転役を入れる。page.goto の前に呼ぶ。
 * 状態は GameState（car.x・z・heading）。heading 0 は −Z 向き、左へ切ると heading が増える。steer は −1 が左
 */
export const installCarDriver = (page: Page, options: CarDriverOptions) =>
  page.addInitScript((o: CarDriverOptions) => {
    let target = 0;
    const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
    const clamp = (v: number) => Math.max(-1, Math.min(1, v));
    globalThis.__noriDriver = {
      record: [],
      drive(raw) {
        const car = (raw as { car: { x: number; z: number; heading: number } }).car;
        const last = o.waypoints.length - 1;
        const here = o.waypoints[target] ?? { x: 0, z: 0 };
        if (Math.hypot(here.x - car.x, here.z - car.z) < o.turnAhead) {
          target = o.loop ? (target + 1) % o.waypoints.length : Math.min(last, target + 1);
        }
        const aim = o.waypoints[target] ?? here;
        const wanted = Math.atan2(-(aim.x - car.x), -(aim.z - car.z));
        const error = wrap(wanted - car.heading);
        return {
          throttle: Math.abs(error) > o.slowAngle ? o.slowThrottle : 1,
          steer: clamp(-error * o.steerGain),
        };
      },
    };
  }, options);

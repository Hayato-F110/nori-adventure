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

export type TrainDriverOptions = {
  /** 駅の場所（線路の上の距離 m。STAGE2.stations） */
  stations: readonly number[];
  /** ブレーキの減速（m/s²。TRAIN.brakeDeceleration）。止まれる距離 v² / 2a を求める */
  brake: number;
  /** 駅のこの距離（m）より近くで、ほぼ止まったら待つ（ホームの半分 STAGE2.stationStopLength / 2 より短く） */
  closeEnough: number;
  /** 止まったと見なす速さ（m/s）。STAGE2.stationStopSpeed より小さく */
  slowSpeed: number;
};

/**
 * ステージ2の列車の運転役を入れる。page.goto の前に呼ぶ。状態は Stage2State（train.distance・speed、nextStation）。
 * 次の駅までの距離が、ブレーキで止まれる距離に近づいたらブレーキ、駅でほぼ止まったら手を離して待つ
 */
export const installTrainDriver = (page: Page, options: TrainDriverOptions) =>
  page.addInitScript((o: TrainDriverOptions) => {
    globalThis.__noriDriver = {
      record: [],
      drive(raw) {
        const s = raw as { train: { distance: number; speed: number }; nextStation: number };
        const target = o.stations[s.nextStation];
        if (target === undefined) return { throttle: 0, steer: 0 };
        const left = target - s.train.distance;
        const v = s.train.speed;
        if (Math.abs(left) <= o.closeEnough && Math.abs(v) <= o.slowSpeed) return { throttle: 0, steer: 0 };
        if (left < 0) return { throttle: -1, steer: 0 }; // 行きすぎたら、ブレーキ（止まったらさがる）
        if (v <= o.slowSpeed) return { throttle: 0.5, steer: 0 }; // 手前で止まったら、ゆっくり進む
        const stopping = (v * v) / (2 * o.brake);
        return { throttle: left <= stopping + 1 ? -1 : 1, steer: 0 };
      },
    };
  }, options);

export type PlaneDriverOptions = {
  /** 向きのずれ（rad）にかけて、左右の傾きの量にする */
  steerGain: number;
  /** 高さの差（m）にかけて、上下の量にする */
  climbGain: number;
};

/**
 * ステージ3の飛行機の運転役を入れる。page.goto の前に呼ぶ。状態は Stage3State（plane・rings）。
 * まだくぐっていない輪を順に（最後はゴール）目指す。輪の場所は window.__nori.rings()（最後がゴール）。
 * steer は右が正（heading が減る）、throttle は上が正
 */
export const installPlaneDriver = (page: Page, options: PlaneDriverOptions) =>
  page.addInitScript((o: PlaneDriverOptions) => {
    const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
    const clamp = (v: number) => Math.max(-1, Math.min(1, v));
    globalThis.__noriDriver = {
      record: [],
      drive(raw) {
        const s = raw as { plane: { x: number; y: number; z: number; heading: number }; rings: boolean[] };
        const all = window.__nori?.rings?.() ?? [];
        const next = s.rings.findIndex((done) => !done);
        const ring = all[next === -1 ? all.length - 1 : next];
        if (ring === undefined) return { throttle: 0, steer: 0 };
        const p = s.plane;
        const wanted = Math.atan2(-(ring.x - p.x), -(ring.z - p.z));
        return {
          throttle: clamp((ring.y - p.y) * o.climbGain),
          steer: clamp(-wrap(wanted - p.heading) * o.steerGain),
        };
      },
    };
  }, options);

/**
 * ステージ4の潜水艇の運転役を入れる。page.goto の前に呼ぶ。状態は Stage4State（sub）。
 * たからばこ（window.__nori.treasureMarker().treasure）へ向きを合わせ、高さの差に比例して上下する
 */
export const installSubDriver = (page: Page, options: PlaneDriverOptions) =>
  page.addInitScript((o: PlaneDriverOptions) => {
    const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
    const clamp = (v: number) => Math.max(-1, Math.min(1, v));
    globalThis.__noriDriver = {
      record: [],
      drive(raw) {
        const p = (raw as { sub: { x: number; y: number; z: number; heading: number } }).sub;
        const t = window.__nori?.treasureMarker?.().treasure;
        if (t === undefined) return { throttle: 0, steer: 0 };
        const wanted = Math.atan2(-(t.x - p.x), -(t.z - p.z));
        return {
          throttle: clamp((t.y - p.y) * o.climbGain),
          steer: clamp(-wrap(wanted - p.heading) * o.steerGain),
        };
      },
    };
  }, options);

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

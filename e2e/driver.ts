// NORI-37：E2E の運転役（src/input/testDriver.ts）。ページを開く前に入れ、ゲームの刻みごとに入力を決める。
// 本物の時間でキーを押す代わりに、状態だけから入力を決めるので、フレームの速さ（CI の 3 fps でも）に関係なく
// 毎回同じ入力の並び → 同じ結果になる。運転の仕方はここ（テストの側）だけに置く。
import type { Page } from "@playwright/test";

export type Waypoint = { x: number; z: number };

/** E2E の早送り（NORI-66）：1フレームに進める刻みの数。クリアの E2E だけで使う（FPS を測るテストでは使わない） */
export type FastForwardOption = {
  stepsPerFrame?: number;
  /**
   * NORI-69：true なら、startDriving(page) を呼ぶまで入力 0（止まったまま）。始めの画面（表示が 0 など）を
   * 確かめてから走り出すため。早送りでも、確かめる前に進んでしまわない
   */
  waitForGo?: boolean;
};

/** waitForGo の運転役を走り出させる */
export const startDriving = (page: Page) =>
  page.evaluate(() => {
    (globalThis as { __noriGo?: boolean }).__noriGo = true;
  });

export type CarDriverOptions = FastForwardOption & {
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

export type TrainDriverOptions = FastForwardOption & {
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
      ...(o.stepsPerFrame === undefined ? {} : { stepsPerFrame: o.stepsPerFrame }),
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

export type PlaneDriverOptions = FastForwardOption & {
  /** NORI-69：ステージ3で、輪をこの数くぐったら手を離す（入力 0。水平に戻るのを確かめる） */
  releaseAfterRings?: number;
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
      ...(o.stepsPerFrame === undefined ? {} : { stepsPerFrame: o.stepsPerFrame }),
      drive(raw) {
        if (o.waitForGo === true && (globalThis as { __noriGo?: boolean }).__noriGo !== true) {
          return { throttle: 0, steer: 0 };
        }
        const s = raw as { plane: { x: number; y: number; z: number; heading: number }; rings: boolean[] };
        if (o.releaseAfterRings !== undefined && s.rings.filter(Boolean).length >= o.releaseAfterRings) {
          return { throttle: 0, steer: 0 };
        }
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
      ...(o.stepsPerFrame === undefined ? {} : { stepsPerFrame: o.stepsPerFrame }),
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

export type SubApproachOptions = PlaneDriverOptions & {
  /** 近づく生きもの（STAGE4.creatures の番号） */
  creature: number;
  /** 生きもののこの高さ（m）上を目指す（真後ろからだと潜水艇に隠れるので、上から見下ろす） */
  above: number;
  /** 目指す点まで、この距離（m）に近づいた刻みで時間を止める */
  stopAt: number;
};

/**
 * NORI-67：ステージ4で、生きものの上へ近づいて止まる運転役。page.goto の前に呼ぶ。
 * 近づいた刻みで window.__nori.freeze(true) を呼ぶ。早送り（stepsPerFrame）の刻みの区切りは毎回同じなので、
 * 止まる刻み・潜水艇・生きもの・カメラの位置は、PC の速さによらず毎回同じになる
 * （前は本物の時間でキーを押し、止まる位置が CI の遅さで変わって、測るきらきらが潜水艇の陰に入った）
 */
export const installSubApproachDriver = (page: Page, options: SubApproachOptions) =>
  page.addInitScript((o: SubApproachOptions) => {
    const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
    const clamp = (v: number) => Math.max(-1, Math.min(1, v));
    let stopped = false;
    globalThis.__noriDriver = {
      record: [],
      ...(o.stepsPerFrame === undefined ? {} : { stepsPerFrame: o.stepsPerFrame }),
      drive(raw) {
        if (stopped) return { throttle: 0, steer: 0 };
        if (o.waitForGo === true && (globalThis as { __noriGo?: boolean }).__noriGo !== true) {
          return { throttle: 0, steer: 0 };
        }
        const p = (raw as { sub: { x: number; y: number; z: number; heading: number } }).sub;
        const c = window.__nori?.creatures?.()[o.creature];
        if (c === undefined) return { throttle: 0, steer: 0 };
        const g = { x: c.x, y: c.y + o.above, z: c.z };
        if (Math.hypot(g.x - p.x, g.y - p.y, g.z - p.z) <= o.stopAt) {
          stopped = true;
          window.__nori?.freeze?.(true);
          (globalThis as { __noriApproachStopped?: boolean }).__noriApproachStopped = true;
          return { throttle: 0, steer: 0 };
        }
        const wanted = Math.atan2(-(g.x - p.x), -(g.z - p.z));
        return {
          throttle: clamp((g.y - p.y) * o.climbGain),
          steer: clamp(-wrap(wanted - p.heading) * o.steerGain),
        };
      },
    };
  }, options);

/** installSubApproachDriver が止まったか（page.waitForFunction の中で呼ぶ） */
export const approachStopped = (): boolean =>
  (globalThis as { __noriApproachStopped?: boolean }).__noriApproachStopped === true;

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
      ...(o.stepsPerFrame === undefined ? {} : { stepsPerFrame: o.stepsPerFrame }),
      drive(raw) {
        if (o.waitForGo === true && (globalThis as { __noriGo?: boolean }).__noriGo !== true) {
          return { throttle: 0, steer: 0 };
        }
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

export type RoverDriverOptions = FastForwardOption & {
  /** 道すじの点（スタート → 広場の入口） */
  path: readonly Waypoint[];
  /** この距離（m）まで近づいたら、道すじの次の点へ */
  turnAhead: number;
  /** なかよしの星の場所（friendStarPositions の順） */
  friends: readonly Waypoint[];
  /** 星が出直すまでの刻み */
  respawnTicks: number;
  /** ボスの円：中心・半径・1 刻みに進む角度（rad）。最初は −Z 側（角度 −π/2） */
  boss: { x: number; z: number; radius: number; perTick: number };
  /** 目標がこの距離（m）より近いと、slowSpeed まで落とす */
  slowNear: number;
  slowSpeed: number;
  maxSpeed: number;
  steerGain: number;
};

/**
 * ステージ5のローバーの運転役を入れる。page.goto の前に呼ぶ。状態は Stage5State（rover・carrying・friendTakenTick）。
 * 道すじを進み、終わったら「取れるいちばん近いなかよしの星 → ボス」をくり返す。
 * 目標が近いと遅くして、曲がりきれずに回り続けないようにする
 */
export const installRoverDriver = (page: Page, options: RoverDriverOptions) =>
  page.addInitScript((o: RoverDriverOptions) => {
    let next = 0;
    const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
    const clamp = (v: number) => Math.max(-1, Math.min(1, v));
    globalThis.__noriDriver = {
      record: [],
      ...(o.stepsPerFrame === undefined ? {} : { stepsPerFrame: o.stepsPerFrame }),
      drive(raw) {
        const s = raw as {
          tick: number;
          rover: { x: number; z: number; heading: number; speed: number };
          carrying: boolean;
          friendTakenTick: (number | null)[];
        };
        const r = s.rover;
        const dist = (p: Waypoint) => Math.hypot(p.x - r.x, p.z - r.z);
        let aim: Waypoint | undefined;
        if (next < o.path.length) {
          const here = o.path[next];
          if (here !== undefined && dist(here) < o.turnAhead) next++;
          aim = o.path[Math.min(next, o.path.length - 1)];
        } else if (s.carrying) {
          const a = -Math.PI / 2 + o.boss.perTick * (s.tick + 1);
          aim = { x: o.boss.x + Math.cos(a) * o.boss.radius, z: o.boss.z + Math.sin(a) * o.boss.radius };
        } else {
          const ready = o.friends.filter((_, i) => {
            const t = s.friendTakenTick[i];
            return t === null || t === undefined || s.tick - t >= o.respawnTicks;
          });
          aim = ready.sort((p, q) => dist(p) - dist(q))[0];
        }
        if (aim === undefined) return { throttle: 0, steer: 0 };
        const wanted = Math.atan2(-(aim.x - r.x), -(aim.z - r.z));
        const error = wrap(wanted - r.heading);
        const target = dist(aim) < o.slowNear || Math.abs(error) > 0.6 ? o.slowSpeed : o.maxSpeed;
        return {
          throttle: r.speed > target + 0.2 ? -0.5 : r.speed < target ? 1 : 0,
          steer: clamp(-error * o.steerGain),
        };
      },
    };
  }, options);

// ゲーム全体の状態を1刻み進める。描画（Three.js）からは状態を読むだけにする。
// 当たり判定（Rapier）の準備が非同期なので、createGame() で用意してから使う。
import { ASSET, CAR, PHYSICS, RESPAWN, SIM, STAGE1, TRAFFIC } from "../config";
import { createCarState } from "./car";
import { createCourseState, respawnPose, starPositions, stepCourse } from "./course";
import { createCarPhysics, type MoverShape } from "./physics";
import { createStage1Layout, type Stage1Layout } from "./stage1Layout";
import { createTraffic, type Traffic, type TrafficState } from "./traffic";
import type { GameState, InputFrame } from "./types";

export type Game = {
  /** ステージ1の街の配置（描画もこれを使う） */
  readonly layout: Stage1Layout;
  /** 街のほかの車・自転車・バイク・人（NORI-61。描画は traffic.poses(state.traffic) を読む） */
  readonly traffic: Traffic;
  /** ほしの場所（描画もこれを使う） */
  readonly stars: readonly { x: number; z: number }[];
  initial(): GameState;
  /** 純粋な関数として使える：同じ状態・入力 → 同じ結果。元の状態は書き換えない */
  step(state: GameState, input: InputFrame): GameState;
};

const NO_INPUT: InputFrame = { throttle: 0, steer: 0 };
const stuckLimit = Math.round(RESPAWN.stuckSeconds / SIM.fixedDt);
const invincibleLength = Math.round(RESPAWN.invincibleSeconds / SIM.fixedDt);

/**
 * 当たり判定の形：車は上から見た長方形（モデルの幅・長さ）、自転車・バイク・人は円（traffic.poses と同じ順）。
 * テストが同じ形を使えるように外に出した（NORI-70：初見レビュー 61-3。前のテストは手作りの形だった）
 */
export const trafficShapes = (first: TrafficState): MoverShape[] => [
  ...TRAFFIC.vehicles.map((v): MoverShape => {
    const size = ASSET.city.sizes[v.model];
    return { kind: "box", halfWidth: size.width / 2, halfLength: size.length / 2 };
  }),
  ...first.bikes.map((): MoverShape => ({ kind: "circle", radius: TRAFFIC.bikeRadius })),
  ...first.people.map((): MoverShape => ({ kind: "circle", radius: TRAFFIC.personRadius })),
];

export const createGame = async (): Promise<Game> => {
  const layout = createStage1Layout(STAGE1);
  const traffic = createTraffic(TRAFFIC, ASSET.city.sizes, STAGE1.route, CAR.collisionRadius);
  const physics = await createCarPhysics(
    layout,
    PHYSICS,
    CAR.collisionRadius,
    trafficShapes(traffic.initial()),
  );
  const stars = starPositions(STAGE1.route, STAGE1.starCount, STAGE1.starStart, STAGE1.starSpacing);
  return {
    layout,
    traffic,
    stars,
    initial: () => ({
      tick: 0,
      car: createCarState(STAGE1.start),
      course: createCourseState(STAGE1.starCount),
      stuckTicks: 0,
      invincibleTicks: 0,
      respawns: 0,
      traffic: traffic.initial(),
    }),
    step: (state, rawInput) => {
      const tick = state.tick + 1;
      // ゴールのあとは入力を受け付けない（手を離したときと同じ減速で止まる）
      const input = state.course.finishTick === null ? rawInput : NO_INPUT;
      const invincible = state.invincibleTicks > 0;
      // 無敵の間は「当たった瞬間の減速」をしない：触れていたことにして渡す（触れている間の上限はそのまま）
      const before = invincible ? { ...state.car, touching: true } : state.car;
      // 1. ほかの車などを、前の刻みの子どもの車の位置を見て進める 2. その位置に置いて、子どもの車を動かす
      const nextTraffic = traffic.step(state.traffic, state.car, SIM.fixedDt);
      const poses = traffic.poses(nextTraffic);
      const car = physics.step(before, input, SIM.fixedDt, CAR, STAGE1, [
        ...poses.vehicles,
        ...poses.bikes,
        ...poses.people,
      ]);
      const course = stepCourse(state.course, car, tick, STAGE1, stars);

      // ひっかかり：アクセルを入れているのに遅い刻みが続いたら、近くの道の中心線へ戻す
      const pushing = Math.abs(input.throttle) >= RESPAWN.stuckThrottle;
      const stuckTicks = pushing && Math.abs(car.speed) < RESPAWN.stuckSpeed ? state.stuckTicks + 1 : 0;
      if (stuckTicks >= stuckLimit) {
        return {
          tick,
          car: createCarState(respawnPose(course, STAGE1, car)),
          course,
          stuckTicks: 0,
          invincibleTicks: invincibleLength,
          respawns: state.respawns + 1,
          traffic: nextTraffic,
        };
      }
      return {
        tick,
        car,
        course,
        stuckTicks,
        invincibleTicks: Math.max(0, state.invincibleTicks - 1),
        respawns: state.respawns,
        traffic: nextTraffic,
      };
    },
  };
};

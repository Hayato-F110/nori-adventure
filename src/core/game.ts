// ゲーム全体の状態を1刻み進める。描画（Three.js）からは状態を読むだけにする。
// 当たり判定（Rapier）の準備が非同期なので、createGame() で用意してから使う。
import { CAR, RESPAWN, SIM, STAGE1 } from "../config";
import { createCarState } from "./car";
import { createCourseState, respawnPose, starPositions, stepCourse } from "./course";
import { createCarPhysics } from "./physics";
import { createStage1Layout, type Stage1Layout } from "./stage1Layout";
import type { GameState, InputFrame } from "./types";

export type Game = {
  /** ステージ1の街の配置（描画もこれを使う） */
  readonly layout: Stage1Layout;
  /** ほしの場所（描画もこれを使う） */
  readonly stars: readonly { x: number; z: number }[];
  initial(): GameState;
  /** 純粋な関数として使える：同じ状態・入力 → 同じ結果。元の状態は書き換えない */
  step(state: GameState, input: InputFrame): GameState;
};

const NO_INPUT: InputFrame = { throttle: 0, steer: 0 };
const stuckLimit = Math.round(RESPAWN.stuckSeconds / SIM.fixedDt);
const invincibleLength = Math.round(RESPAWN.invincibleSeconds / SIM.fixedDt);

export const createGame = async (): Promise<Game> => {
  const layout = createStage1Layout(STAGE1);
  const physics = await createCarPhysics(layout);
  const stars = starPositions(STAGE1.route, STAGE1.starCount, STAGE1.starStart, STAGE1.starSpacing);
  return {
    layout,
    stars,
    initial: () => ({
      tick: 0,
      car: createCarState(STAGE1.start),
      course: createCourseState(STAGE1.starCount),
      stuckTicks: 0,
      invincibleTicks: 0,
      respawns: 0,
    }),
    step: (state, rawInput) => {
      const tick = state.tick + 1;
      // ゴールのあとは入力を受け付けない（手を離したときと同じ減速で止まる）
      const input = state.course.finishTick === null ? rawInput : NO_INPUT;
      const invincible = state.invincibleTicks > 0;
      // 無敵の間は「当たった瞬間の減速」をしない：触れていたことにして渡す（触れている間の上限はそのまま）
      const before = invincible ? { ...state.car, touching: true } : state.car;
      const car = physics.step(before, input, SIM.fixedDt, CAR, STAGE1);
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
        };
      }
      return {
        tick,
        car,
        course,
        stuckTicks,
        invincibleTicks: Math.max(0, state.invincibleTicks - 1),
        respawns: state.respawns,
      };
    },
  };
};

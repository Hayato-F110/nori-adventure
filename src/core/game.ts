// ゲーム全体の状態を1刻み進める。描画（Three.js）からは状態を読むだけにする。
// 当たり判定（Rapier）の準備が非同期なので、createGame() で用意してから使う。
import { CAR, SIM, STAGE1 } from "../config";
import { createCarState } from "./car";
import { createCarPhysics } from "./physics";
import { createStage1Layout, type Stage1Layout } from "./stage1Layout";
import type { GameState, InputFrame } from "./types";

export type Game = {
  /** ステージ1の街の配置（描画もこれを使う） */
  readonly layout: Stage1Layout;
  initial(): GameState;
  /** 純粋な関数として使える：同じ状態・入力 → 同じ結果。元の状態は書き換えない */
  step(state: GameState, input: InputFrame): GameState;
};

export const createGame = async (): Promise<Game> => {
  const layout = createStage1Layout(STAGE1);
  const physics = await createCarPhysics(layout);
  return {
    layout,
    initial: () => ({ tick: 0, car: createCarState(STAGE1.start) }),
    step: (state, input) => ({
      tick: state.tick + 1,
      car: physics.step(state.car, input, SIM.fixedDt, CAR, STAGE1),
    }),
  };
};

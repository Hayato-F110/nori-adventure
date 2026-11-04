// ゲーム全体の状態を1刻み進める。描画（Three.js）からは状態を読むだけにする。
import { CAR, SIM, STAGE1 } from "../config";
import { createCarState, stepCar } from "./car";
import type { GameState, InputFrame } from "./types";

export const createGameState = (): GameState => ({
  tick: 0,
  car: createCarState(STAGE1.start),
});

export const stepGame = (state: GameState, input: InputFrame): GameState => ({
  tick: state.tick + 1,
  car: stepCar(state.car, input, SIM.fixedDt, CAR, STAGE1),
});

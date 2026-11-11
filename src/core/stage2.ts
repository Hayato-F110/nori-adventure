// ステージ2：山道を列車で進む（docs/game-rules.md「ステージ2」。NORI-26）。
// 線路の上の距離と速さだけを持つ。入力は「すすむ・さがる」だけで、ハンドルは使わない。
// 純粋な関数：同じ状態・入力 → 同じ結果。元の状態は書き換えない。当たり判定（Rapier）は使わない。
import { SIM, STAGE2, TRAIN } from "../config";
import { nextSpeed } from "./car";
import { createTrack, type Track, wrapDistance } from "./track";
import type { InputFrame } from "./types";

export type TrainState = {
  /** スタートからの線路の上の距離（m）。0 以上・線路の長さ未満 */
  distance: number;
  /** 線路に沿った速さ（m/s）。さがるときは負 */
  speed: number;
};

export type Stage2State = {
  tick: number;
  train: TrainState;
  /** 次に止まる駅の番号（0 から）。STAGE2.stationCount になったらゴール */
  nextStation: number;
  /** 次の駅のホームで止まっている刻みの数（動いたら 0 に戻す） */
  stoppedTicks: number;
  /** ゴール（最後の駅に着いた）の刻み。まだなら null */
  finishTick: number | null;
};

export type Stage2Game = {
  readonly track: Track;
  /** 駅の場所（線路の上の距離。描画もこれを使う） */
  readonly stations: readonly number[];
  initial(): Stage2State;
  step(state: Stage2State, input: InputFrame): Stage2State;
};

const NO_INPUT: InputFrame = { throttle: 0, steer: 0 };
const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

/** 輪の上で、a から b までの近いほうの距離（符号なし） */
const gap = (a: number, b: number, length: number): number => {
  const d = wrapDistance(a - b, length);
  return Math.min(d, length - d);
};

export const createStage2Game = (): Stage2Game => {
  const track = createTrack(STAGE2.trackPoints);
  const stations = STAGE2.stations;
  const waitTicks = Math.round(STAGE2.stationWaitSeconds / SIM.fixedDt);
  const dt = SIM.fixedDt;

  return {
    track,
    stations,
    initial: () => ({
      tick: 0,
      train: { distance: wrapDistance(STAGE2.startDistance, track.length), speed: 0 },
      nextStation: 0,
      stoppedTicks: 0,
      finishTick: null,
    }),
    step: (state, rawInput) => {
      const tick = state.tick + 1;
      // ゴールのあとは入力を受け付けない（手を離したときと同じ減速で止まる）
      const input = state.finishTick === null ? rawInput : NO_INPUT;
      const throttle = clamp(input.throttle, -1, 1);
      const speed = clamp(
        nextSpeed(state.train.speed, throttle, dt, TRAIN),
        -TRAIN.maxReverseSpeed,
        TRAIN.maxForwardSpeed,
      );
      const distance = wrapDistance(state.train.distance + speed * dt, track.length);
      const train = { distance, speed };

      if (state.finishTick !== null) return { ...state, tick, train, stoppedTicks: 0 };

      // 次の駅のホームの中で、ゆっくり（止まっている）なら数える。順番どおりの駅だけ
      const target = stations[state.nextStation];
      const inPlatform =
        target !== undefined && gap(distance, target, track.length) <= STAGE2.stationStopLength / 2;
      const stoppedTicks =
        inPlatform && Math.abs(speed) <= STAGE2.stationStopSpeed ? state.stoppedTicks + 1 : 0;
      if (stoppedTicks < waitTicks) return { ...state, tick, train, stoppedTicks };

      const nextStation = state.nextStation + 1;
      return {
        tick,
        train,
        nextStation,
        stoppedTicks: 0,
        finishTick: nextStation >= STAGE2.stationCount ? tick : null,
      };
    },
  };
};

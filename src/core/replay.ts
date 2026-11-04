// 入力記録の保存と再生。同じ記録 → 同じ結果（オンライン対戦・不具合の再現・自動録画に使う）。
import { stepGame } from "./game";
import type { GameState, InputFrame } from "./types";

export type Replay = {
  version: 1;
  inputs: InputFrame[];
};

export const runReplay = (initial: GameState, inputs: readonly InputFrame[]): GameState =>
  inputs.reduce(stepGame, initial);

export const serializeReplay = (replay: Replay): string => JSON.stringify(replay);

const isAxis = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= -1 && value <= 1;

/** 外から来た記録は信用せず、形と範囲を確かめてから使う */
export const parseReplay = (json: string): Replay => {
  const data: unknown = JSON.parse(json);
  if (typeof data !== "object" || data === null) throw new Error("記録の形が正しくありません");
  const { version, inputs } = data as { version?: unknown; inputs?: unknown };
  if (version !== 1 || !Array.isArray(inputs)) throw new Error("対応していない記録です");
  return {
    version: 1,
    inputs: inputs.map((frame: unknown, index) => {
      const { throttle, steer } = (frame ?? {}) as { throttle?: unknown; steer?: unknown };
      if (!isAxis(throttle) || !isAxis(steer)) throw new Error(`${index} 番目の入力が正しくありません`);
      return { throttle, steer };
    }),
  };
};

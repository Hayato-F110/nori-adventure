// NORI-37：E2E の運転役。E2E（Playwright）がページを開く前に window.__noriDriver を入れたときだけ、
// 刻みごとに運転役が状態から決めた入力を使い、記録する（同じ状態の並び → 同じ入力の並び → 同じ結果）。
// 本物の時間でキーを押すと、入力が入る刻みが回ごとに変わり、E2E がたまに落ちた（11/13 までに3回）。
// 運転の仕方はテストの側（e2e/）に置き、製品のコードには入れない。入れていなければ何も変わらない。
import type { InputFrame } from "../core/types";
import { mergeInputs } from "./merge";

export type TestDriver = {
  /** 今の状態から、この刻みの入力を決める（状態は書き換えない） */
  drive(state: unknown): InputFrame;
  /** 使った入力の記録（リプレイ・自動録画に使う） */
  record: InputFrame[];
  /** E2E の早送り：1フレームに進める刻みの数（NORI-66。fastForward）。なければ早送りしない */
  stepsPerFrame?: number;
};

declare global {
  // window と globalThis の両方から読むため var で宣言する（TypeScript の決まり）
  var __noriDriver: TestDriver | undefined;
}

/** 運転役があればその入力（-1〜1 に収める）を記録して返し、なければ input をそのまま返す */
export const drivenInput = (state: unknown, input: InputFrame): InputFrame => {
  const driver = globalThis.__noriDriver;
  if (driver === undefined) return input;
  const frame = mergeInputs([driver.drive(state)]);
  driver.record.push(frame);
  return frame;
};

/**
 * NORI-66：E2E の早送り。運転役が stepsPerFrame（1 以上）を決めたときだけ、1フレームの時間をその刻みの分にし、
 * 1フレームに進める刻みの上限もその数にする。遅い CI（約 3 fps）では、ふだんの上限（SIM.maxStepsPerFrame = 5）だと
 * ゲームの時間が 3 × 5 = 15 刻み/秒（本来 60）でしか進まず、クリアの E2E が待ち時間を超えた。
 * 3 fps で実時間どおりにするには 60 ÷ 3 = 20 刻み/フレーム。入力は運転役が刻みごとに状態から決めるので、結果は変わらない。
 * 運転役がない（遊ぶ子ども）・決めていないときは null（今と同じ）
 */
export const fastForward = (fixedDt: number): { frameSeconds: number; maxSteps: number } | null => {
  const n = globalThis.__noriDriver?.stepsPerFrame;
  if (n === undefined || !Number.isFinite(n) || n < 1) return null;
  const maxSteps = Math.floor(n);
  return { frameSeconds: maxSteps * fixedDt, maxSteps };
};

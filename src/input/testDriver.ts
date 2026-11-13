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

// いくつかの入力（キーボード・タッチ・ゲームパッド）を足して、-1〜1 に収める。
// 入力を変える補正はしない（docs/game-rules.md「入力」）。
import type { InputFrame } from "../core/types";

const clamp1 = (v: number) => (Number.isFinite(v) ? Math.max(-1, Math.min(1, v)) : 0);
const finite = (v: number) => (Number.isFinite(v) ? v : 0);

export const mergeInputs = (frames: readonly InputFrame[]): InputFrame => ({
  throttle: clamp1(frames.reduce((sum, f) => sum + finite(f.throttle), 0)),
  steer: clamp1(frames.reduce((sum, f) => sum + finite(f.steer), 0)),
});

/** 遊び（dead）の外を、遊びの端から 0、max で 1 になるように比例させる（符号つき） */
export const scaleWithDeadzone = (value: number, dead: number, max: number): number => {
  const size = Math.abs(value);
  if (!Number.isFinite(size) || size <= dead) return 0;
  return Math.sign(value) * Math.min(1, (size - dead) / (max - dead));
};

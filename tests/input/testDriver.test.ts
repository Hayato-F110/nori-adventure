// NORI-37：E2E の運転役（window.__noriDriver）。入れたときだけ、刻みごとに運転役の入力を使い、記録する。
// 入れていなければ、キーボードなどの入力をそのまま使う（遊ぶ子どもには何も変わらない）。
import { afterEach, describe, expect, it } from "vitest";
import { createFixedStepper } from "../../src/core/loop";
import { drivenInput, fastForward } from "../../src/input/testDriver";
import type { InputFrame } from "../../src/core/types";

type Holder = {
  __noriDriver?: { drive(state: unknown): InputFrame; record: InputFrame[]; stepsPerFrame?: number };
};
const g = globalThis as Holder;

afterEach(() => {
  delete g.__noriDriver;
});

describe("drivenInput", () => {
  const keyboard: InputFrame = { throttle: 0.5, steer: -1 };

  it("運転役がなければ、元の入力をそのまま返す", () => {
    expect(drivenInput({ tick: 1 }, keyboard)).toBe(keyboard);
  });

  it("運転役があれば、状態から決めた入力を返し、記録に足す", () => {
    g.__noriDriver = {
      drive: (state) => ({ throttle: 1, steer: (state as { tick: number }).tick === 2 ? 0.3 : 0 }),
      record: [],
    };
    expect(drivenInput({ tick: 1 }, keyboard)).toEqual({ throttle: 1, steer: 0 });
    expect(drivenInput({ tick: 2 }, keyboard)).toEqual({ throttle: 1, steer: 0.3 });
    expect(g.__noriDriver.record).toEqual([
      { throttle: 1, steer: 0 },
      { throttle: 1, steer: 0.3 },
    ]);
  });

  it("運転役の入力は -1〜1 に収める（ほかの入力と同じ決まり。docs/game-rules.md「入力」）", () => {
    g.__noriDriver = { drive: () => ({ throttle: 3, steer: -2 }), record: [] };
    expect(drivenInput({}, keyboard)).toEqual({ throttle: 1, steer: -1 });
  });

  it("数でない入力（NaN）は 0 にする", () => {
    g.__noriDriver = { drive: () => ({ throttle: Number.NaN, steer: 0.2 }), record: [] };
    expect(drivenInput({}, keyboard)).toEqual({ throttle: 0, steer: 0.2 });
  });
});

// NORI-66：遅い CI（約 3 fps）では、1フレーム最大 5 刻みだとゲームの時間が実時間の約 1/4 でしか進まない。
// 運転役が stepsPerFrame を決めたときだけ、1フレームにその数の刻みを進める（早送り）。結果は変わらない
describe("fastForward", () => {
  const dt = 1 / 60;

  it("運転役がない・stepsPerFrame がないときは早送りしない（今と同じ。最大 5 刻み/フレーム）", () => {
    expect(fastForward(dt)).toBeNull();
    g.__noriDriver = { drive: () => ({ throttle: 0, steer: 0 }), record: [] };
    expect(fastForward(dt)).toBeNull();
  });

  it("stepsPerFrame が 20 なら、1フレームは 20 刻み分の時間で、上限も 20 刻み", () => {
    g.__noriDriver = { drive: () => ({ throttle: 0, steer: 0 }), record: [], stepsPerFrame: 20 };
    const ff = fastForward(dt);
    expect(ff?.maxSteps).toBe(20);
    expect(ff?.frameSeconds).toBeCloseTo(20 * dt, 12);
    // 固定刻みのループに渡すと、どのフレームでもちょうど 20 刻み進む
    const stepper = createFixedStepper(dt, ff?.maxSteps ?? 0);
    let steps = 0;
    for (let f = 0; f < 10; f++) stepper.advance(ff?.frameSeconds ?? 0, () => steps++);
    expect(steps).toBe(200);
  });

  it("1 より小さい・数でない値は早送りしない", () => {
    for (const bad of [0, 0.5, Number.NaN, -3]) {
      g.__noriDriver = { drive: () => ({ throttle: 0, steer: 0 }), record: [], stepsPerFrame: bad };
      expect(fastForward(dt)).toBeNull();
    }
  });
});

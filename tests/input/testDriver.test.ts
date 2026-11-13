// NORI-37：E2E の運転役（window.__noriDriver）。入れたときだけ、刻みごとに運転役の入力を使い、記録する。
// 入れていなければ、キーボードなどの入力をそのまま使う（遊ぶ子どもには何も変わらない）。
import { afterEach, describe, expect, it } from "vitest";
import { drivenInput } from "../../src/input/testDriver";
import type { InputFrame } from "../../src/core/types";

type Holder = { __noriDriver?: { drive(state: unknown): InputFrame; record: InputFrame[] } };
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

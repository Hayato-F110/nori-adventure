import { describe, expect, it } from "vitest";
import { INPUT } from "../../src/config/index.ts";
import { gamepadToFrame, type PadSnapshot } from "../../src/input/gamepad.ts";
import { mergeInputs } from "../../src/input/merge.ts";
import { steerFromOffset } from "../../src/input/touch.ts";

// docs/game-rules.md「入力（全ステージ共通。NORI-14）」。数値は INPUT から読む。

describe("mergeInputs（キーボード・タッチ・ゲームパッドを足す）", () => {
  it("何もなければ 0", () => {
    expect(mergeInputs([])).toEqual({ throttle: 0, steer: 0 });
  });

  it("同じ向きを2つ同時に押しても -1〜1 に収まる", () => {
    expect(
      mergeInputs([
        { throttle: 1, steer: 1 },
        { throttle: 1, steer: 0.8 },
      ]),
    ).toEqual({ throttle: 1, steer: 1 });
  });

  it("逆向きを同時に押すと打ち消し合う", () => {
    expect(
      mergeInputs([
        { throttle: 1, steer: -1 },
        { throttle: -1, steer: 1 },
      ]),
    ).toEqual({ throttle: 0, steer: 0 });
  });

  it("数でない値（NaN）は 0 として扱う（壊れた入力で止まらない）", () => {
    expect(mergeInputs([{ throttle: Number.NaN, steer: 0.5 }])).toEqual({ throttle: 0, steer: 0.5 });
  });
});

describe("steerFromOffset（タッチのハンドル：中心からの横のずれ px → -1〜1）", () => {
  const { touchSteerRange: range, touchSteerDeadzone: dead } = INPUT;

  it("遊び以内は 0", () => {
    expect(steerFromOffset(0)).toBe(0);
    expect(steerFromOffset(dead)).toBe(0);
    expect(steerFromOffset(-dead)).toBe(0);
  });

  it("最大の距離で ±1、それより先も ±1 のまま", () => {
    expect(steerFromOffset(range)).toBe(1);
    expect(steerFromOffset(-range)).toBe(-1);
    expect(steerFromOffset(range * 3)).toBe(1);
  });

  it("遊びの外では、距離に比例して大きくなる（遊びの端から始まるので、急に飛ばない）", () => {
    const mid = (dead + range) / 2;
    expect(steerFromOffset(mid)).toBeCloseTo(0.5, 9);
    expect(steerFromOffset(dead + 0.001)).toBeLessThan(0.01);
  });
});

const pad = (overrides: Partial<{ axes: number[]; buttons: number[] }> = {}): PadSnapshot => {
  const buttons = Array.from({ length: 17 }, (_, i) => ({ value: overrides.buttons?.[i] ?? 0 }));
  return { connected: true, mapping: "standard", axes: overrides.axes ?? [0, 0, 0, 0], buttons };
};
// 標準の割り当て（W3C Gamepad の standard mapping）：0=A、1=B、6=LT、7=RT、axes[0]=左スティックの左右
const A = 0;
const B = 1;
const LT = 6;
const RT = 7;
const withButton = (index: number, value: number) => {
  const values: number[] = [];
  values[index] = value;
  return pad({ buttons: values });
};

describe("gamepadToFrame（ゲームパッド → InputFrame）", () => {
  it("A・RT ですすむ、B・LT でさがる", () => {
    expect(gamepadToFrame(withButton(A, 1)).throttle).toBe(1);
    expect(gamepadToFrame(withButton(RT, 1)).throttle).toBe(1);
    expect(gamepadToFrame(withButton(B, 1)).throttle).toBe(-1);
    expect(gamepadToFrame(withButton(LT, 1)).throttle).toBe(-1);
  });

  it("トリガーは押した量に比例する", () => {
    expect(gamepadToFrame(withButton(RT, 0.4)).throttle).toBeCloseTo(0.4, 9);
    expect(gamepadToFrame(withButton(LT, 0.25)).throttle).toBeCloseTo(-0.25, 9);
  });

  it("左スティックで曲がる。遊び以内は 0", () => {
    expect(gamepadToFrame(pad({ axes: [1, 0, 0, 0] })).steer).toBe(1);
    expect(gamepadToFrame(pad({ axes: [-1, 0, 0, 0] })).steer).toBe(-1);
    expect(gamepadToFrame(pad({ axes: [INPUT.stickDeadzone, 0, 0, 0] })).steer).toBe(0);
    expect(gamepadToFrame(pad({ axes: [-INPUT.stickDeadzone / 2, 0, 0, 0] })).steer).toBe(0);
  });

  it("遊びの外は、遊びの端から比例する（急に飛ばない）", () => {
    const mid = (INPUT.stickDeadzone + 1) / 2;
    expect(gamepadToFrame(pad({ axes: [mid, 0, 0, 0] })).steer).toBeCloseTo(0.5, 9);
  });

  it("つながっていない・null・標準の割り当てでないパッドは 0（例外を出さない）", () => {
    expect(gamepadToFrame(null)).toEqual({ throttle: 0, steer: 0 });
    expect(gamepadToFrame({ ...pad({ buttons: [1] }), connected: false })).toEqual({ throttle: 0, steer: 0 });
    expect(gamepadToFrame({ ...pad({ buttons: [1] }), mapping: "" })).toEqual({ throttle: 0, steer: 0 });
    expect(gamepadToFrame({ connected: true, mapping: "standard", axes: [], buttons: [] })).toEqual({
      throttle: 0,
      steer: 0,
    });
  });
});

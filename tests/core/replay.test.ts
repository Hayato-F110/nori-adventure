import { describe, expect, it } from "vitest";
import { createGameState, stepGame } from "../../src/core/game";
import { createFixedStepper } from "../../src/core/loop";
import { parseReplay, runReplay, serializeReplay } from "../../src/core/replay";
import type { InputFrame } from "../../src/core/types";

// 10秒分の、加速・左右のハンドル・ブレーキ・後退を含む入力記録
const recordedInputs = (): InputFrame[] =>
  Array.from({ length: 600 }, (_, tick) => ({
    throttle: tick < 400 ? 1 : tick < 480 ? -1 : 0.5,
    steer: tick < 120 ? 0 : tick < 240 ? -1 : tick < 330 ? 0.6 : 0,
  }));

describe("状態と描画の分離：同じ入力記録 → 同じ結果", () => {
  it("同じ入力を2回再生すると、最後の状態が完全に一致する", () => {
    const inputs = recordedInputs();
    const first = runReplay(createGameState(), inputs);
    const second = runReplay(createGameState(), inputs);
    expect(second).toStrictEqual(first);
    expect(first.tick).toBe(600);
  });

  it("JSON に保存して読み直した記録から、同じ結果を再現できる", () => {
    const inputs = recordedInputs();
    const json = serializeReplay({ version: 1, inputs });
    const restored = parseReplay(json);
    expect(runReplay(createGameState(), restored.inputs)).toStrictEqual(runReplay(createGameState(), inputs));
  });

  it("状態は JSON にそのまま保存できる（関数や Three.js のオブジェクトを含まない）", () => {
    const state = runReplay(createGameState(), recordedInputs());
    expect(JSON.parse(JSON.stringify(state))).toStrictEqual(state);
  });

  it("stepGame は元の状態を書き換えない", () => {
    const before = createGameState();
    const snapshot = structuredClone(before);
    stepGame(before, { throttle: 1, steer: 1 });
    expect(before).toStrictEqual(snapshot);
  });

  it("壊れた記録は読み込まない", () => {
    expect(() => parseReplay('{"version":1,"inputs":[{"throttle":"x"}]}')).toThrow();
    expect(() => parseReplay('{"version":1,"inputs":[{"throttle":5,"steer":0}]}')).toThrow();
  });
});

describe("固定刻みのループ", () => {
  it("描画のフレーム間隔がばらついても、進めた回数は経過時間どおり", () => {
    const stepper = createFixedStepper(1 / 60, 5);
    let steps = 0;
    for (const frame of [0.016, 0.017, 0.033, 0.008, 0.026]) steps += stepper.advance(frame, () => {}).steps;
    expect(steps).toBe(Math.floor(0.1 * 60 + 1e-9));
  });

  it("長く止まった後でも、1フレームで進める回数は上限まで", () => {
    const stepper = createFixedStepper(1 / 60, 5);
    expect(stepper.advance(3, () => {}).steps).toBe(5);
  });
});

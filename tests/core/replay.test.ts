import { beforeAll, describe, expect, it } from "vitest";
import { createGame, type Game } from "../../src/core/game";
import { createFixedStepper } from "../../src/core/loop";
import { parseReplay, runReplay, serializeReplay } from "../../src/core/replay";
import { createStage5Game } from "../../src/core/stage5";
import type { InputFrame } from "../../src/core/types";

// 10秒分の、加速・左右のハンドル・ブレーキ・後退を含む入力記録
const recordedInputs = (): InputFrame[] =>
  Array.from({ length: 600 }, (_, tick) => ({
    throttle: tick < 400 ? 1 : tick < 480 ? -1 : 0.5,
    steer: tick < 120 ? 0 : tick < 240 ? -1 : tick < 330 ? 0.6 : 0,
  }));

let game: Game;
beforeAll(async () => {
  game = await createGame();
});

describe("状態と描画の分離：同じ入力記録 → 同じ結果（当たり判定を含む）", () => {
  it("同じ入力を2回再生すると、最後の状態が完全に一致する", () => {
    const inputs = recordedInputs();
    const first = runReplay(game, game.initial(), inputs);
    const second = runReplay(game, game.initial(), inputs);
    expect(second).toStrictEqual(first);
    expect(first.tick).toBe(600);
  });

  it("別々に用意したゲーム（Rapier の世界が別）でも、同じ記録 → 同じ結果", async () => {
    const other = await createGame();
    const inputs = recordedInputs();
    expect(runReplay(other, other.initial(), inputs)).toStrictEqual(runReplay(game, game.initial(), inputs));
  });

  it("JSON に保存して読み直した記録から、同じ結果を再現できる", () => {
    const inputs = recordedInputs();
    const json = serializeReplay({ version: 1, inputs });
    const restored = parseReplay(json);
    expect(runReplay(game, game.initial(), restored.inputs)).toStrictEqual(
      runReplay(game, game.initial(), inputs),
    );
  });

  it("状態は JSON にそのまま保存できる（関数や Three.js のオブジェクトを含まない）", () => {
    const state = runReplay(game, game.initial(), recordedInputs());
    expect(JSON.parse(JSON.stringify(state))).toStrictEqual(state);
  });

  it("game.step は元の状態を書き換えない", () => {
    const before = game.initial();
    const snapshot = structuredClone(before);
    game.step(before, { throttle: 1, steer: 1 });
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

// NORI-29：ステージ5（ローバー・ジャンプ台・ボスの岩・なかよしの星）も、同じ入力記録 → 同じ結果
describe("ステージ5：同じ入力記録 → 同じ結果", () => {
  const stage5 = createStage5Game();
  // 40 秒分：道すじを走り、左右に曲がり、ブレーキもかける（ジャンプ台・岩・ボスの時刻をまたぐ）
  const inputs: InputFrame[] = Array.from({ length: 2400 }, (_, tick) => ({
    throttle: tick % 600 < 500 ? 1 : -1,
    steer: Math.sin(tick / 90) * 0.6,
  }));

  it("同じ入力を2回再生すると、最後の状態が完全に一致する。JSON の記録からも同じ", () => {
    const first = runReplay(stage5, stage5.initial(), inputs);
    expect(runReplay(stage5, stage5.initial(), inputs)).toStrictEqual(first);
    const restored = parseReplay(serializeReplay({ version: 1, inputs })).inputs;
    expect(runReplay(createStage5Game(), createStage5Game().initial(), restored)).toStrictEqual(first);
    expect(JSON.parse(JSON.stringify(first))).toStrictEqual(first);
  });

  it("step は元の状態を書き換えない", () => {
    const before = stage5.initial();
    const snapshot = structuredClone(before);
    stage5.step(before, { throttle: 1, steer: 1 });
    expect(before).toStrictEqual(snapshot);
  });
});

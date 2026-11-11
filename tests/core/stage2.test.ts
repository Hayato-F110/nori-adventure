import { describe, expect, it } from "vitest";
import { SIM, STAGE2, TRAIN } from "../../src/config";
import { parseReplay, runReplay, serializeReplay } from "../../src/core/replay";
import { createStage2Game, type Stage2State } from "../../src/core/stage2";
import { wrapDistance } from "../../src/core/track";
import type { InputFrame } from "../../src/core/types";

// docs/game-rules.md「ステージ2」（列車の動き・コース・線路・駅・見え方。NORI-26）
// テストの一覧：2（動き）・3（輪をまたぐ）・4（駅）・5（ゴール）・6（リプレイ）
const game = createStage2Game();
const dt = SIM.fixedDt;
const waitTicks = Math.round(STAGE2.stationWaitSeconds / dt);
const GO: InputFrame = { throttle: 1, steer: 0 };
const BACK: InputFrame = { throttle: -1, steer: 0 };
const NONE: InputFrame = { throttle: 0, steer: 0 };

const run = (state: Stage2State, input: InputFrame, ticks: number) =>
  runReplay(
    game,
    state,
    Array.from({ length: ticks }, () => input),
  );

const at = (distance: number, speed = 0, nextStation = 0): Stage2State => ({
  ...game.initial(),
  train: { distance, speed },
  nextStation,
});

describe("列車の動き（TRAIN）", () => {
  it("最初は 0 m（STAGE2.startDistance）で止まっている", () => {
    const s = game.initial();
    expect(s.train).toEqual({ distance: STAGE2.startDistance, speed: 0 });
    expect(s.nextStation).toBe(0);
    expect(s.finishTick).toBeNull();
  });

  it("すすむを押すと TRAIN.acceleration で速くなり、TRAIN.maxForwardSpeed で止まる", () => {
    const s1 = run(game.initial(), GO, 60);
    expect(s1.train.speed).toBeCloseTo(TRAIN.acceleration * 1, 6);
    const s2 = run(game.initial(), GO, 60 * 10);
    expect(s2.train.speed).toBe(TRAIN.maxForwardSpeed);
  });

  it("手を離すと TRAIN.coastDeceleration で遅くなる（惰性）", () => {
    const s = run(at(100, TRAIN.maxForwardSpeed), NONE, 60);
    expect(s.train.speed).toBeCloseTo(TRAIN.maxForwardSpeed - TRAIN.coastDeceleration, 6);
  });

  it("逆を押すと TRAIN.brakeDeceleration で止まり、0 を越えない（その刻みは止まる）", () => {
    const s = run(at(100, TRAIN.maxForwardSpeed), BACK, 30);
    expect(s.train.speed).toBeCloseTo(TRAIN.maxForwardSpeed - TRAIN.brakeDeceleration * 0.5, 6);
    const stopped = run(at(100, 1), BACK, 20);
    expect(stopped.train.speed).toBeLessThanOrEqual(0);
    expect(stopped.train.speed).toBeGreaterThan(-TRAIN.acceleration * dt * 20);
  });

  it("さがるは TRAIN.maxReverseSpeed まで", () => {
    const s = run(game.initial(), BACK, 60 * 5);
    expect(s.train.speed).toBe(-TRAIN.maxReverseSpeed);
  });

  it("ハンドルは効かない（steer を入れても同じ結果）", () => {
    const steered = runReplay(
      game,
      game.initial(),
      Array.from({ length: 300 }, (_, i) => ({ throttle: 1, steer: i % 2 === 0 ? 1 : -1 })),
    );
    expect(steered).toStrictEqual(run(game.initial(), GO, 300));
  });

  it("坂でも速さは変わらない（上り・下りで同じ加速）", () => {
    // 高さが変わる区間（1つ目と4つ目の制御点の間）でも、平らな所と同じ速さ
    const a = run(at(50), GO, 60);
    const b = run(at(250), GO, 60);
    expect(a.train.speed).toBeCloseTo(b.train.speed, 9);
  });
});

describe("輪をまたいでつながる", () => {
  it("さがると 0 m の後ろ（輪の終わり）へ回る", () => {
    const s = run(game.initial(), BACK, 120);
    expect(s.train.distance).toBeGreaterThan(game.track.length - 10);
    expect(s.train.distance).toBeLessThan(game.track.length);
  });

  it("すすむと、輪の終わりから 0 m のほうへ回る", () => {
    const s = run(at(game.track.length - 1, TRAIN.maxForwardSpeed), GO, 30);
    expect(s.train.distance).toBeGreaterThanOrEqual(0);
    expect(s.train.distance).toBeLessThan(5);
  });
});

describe("駅（STAGE2.stations）", () => {
  const first = STAGE2.stations[0];
  const half = STAGE2.stationStopLength / 2;

  it(`ホームの中で ${STAGE2.stationStopSpeed} m/s 以下を ${STAGE2.stationWaitSeconds} 秒 → 着いた（次の駅へ）`, () => {
    const before = run(at(first), NONE, waitTicks - 1);
    expect(before.nextStation).toBe(0);
    const after = run(at(first), NONE, waitTicks);
    expect(after.nextStation).toBe(1);
  });

  it("ホームの端（±6 m）でも止まれば着く。外（±6.5 m）では着かない", () => {
    expect(run(at(first + half - 0.01), NONE, waitTicks).nextStation).toBe(1);
    expect(run(at(first - half + 0.01), NONE, waitTicks).nextStation).toBe(1);
    expect(run(at(first + half + 0.5), NONE, waitTicks).nextStation).toBe(0);
  });

  it("速いまま通り過ぎても数えない（罰もない：速さ・位置はそのまま）", () => {
    const s = run(at(first - 20, TRAIN.maxForwardSpeed), GO, 300);
    expect(s.nextStation).toBe(0);
    expect(s.train.speed).toBe(TRAIN.maxForwardSpeed);
  });

  it("順番違い（2つ目の駅に先に止まる）は数えない", () => {
    const s = run(at(STAGE2.stations[1]), NONE, waitTicks * 2);
    expect(s.nextStation).toBe(0);
  });

  it("止まっている途中で動くと、待ち時間は最初から数え直す", () => {
    // 0.5 m/s を超えるまでの約10刻みは「止まっている」と数えるので、残りを 30 刻みにしておく
    const half1 = run(at(first), NONE, waitTicks - 30);
    const moved = run(half1, GO, 30); // 0.5 m/s を超える
    const back = run({ ...moved, train: { distance: first, speed: 0 } }, NONE, 20);
    expect(back.nextStation).toBe(0);
    expect(back.stoppedTicks).toBe(20);
  });

  it("駅を通り過ぎても、戻って止まれば着く", () => {
    const passed = at(first + 10);
    const s = run({ ...passed, train: { distance: first + 3, speed: 0 } }, NONE, waitTicks);
    expect(s.nextStation).toBe(1);
  });
});

describe("ゴール（3駅目）", () => {
  it("3駅目に着いたらゴール（finishTick）", () => {
    const s = run(at(STAGE2.stations[2], 0, 2), NONE, waitTicks);
    expect(s.nextStation).toBe(STAGE2.stationCount);
    expect(s.finishTick).toBe(s.tick);
  });

  it("ゴールのあとは入力を受け付けない（手を離したときと同じ減速で止まる）", () => {
    const goal = run(at(STAGE2.stations[2], 0, 2), NONE, waitTicks);
    const after = run(goal, GO, 120);
    expect(after.train.speed).toBe(0);
    expect(after.finishTick).toBe(goal.finishTick);
  });

  it("駅の場所は STAGE2.stationCount 個で、線路の長さの中", () => {
    expect(STAGE2.stations).toHaveLength(STAGE2.stationCount);
    for (const s of STAGE2.stations) {
      expect(s).toBeGreaterThan(0);
      expect(s).toBeLessThan(game.track.length);
    }
  });

  it("ブレーキで止まる運転で、最初から3駅を回ってゴールできる（2分以内）", () => {
    let s = game.initial();
    for (let i = 0; i < 60 * 120 && s.finishTick === null; i++) s = game.step(s, driver(s));
    expect(s.finishTick).not.toBeNull();
    expect(s.nextStation).toBe(STAGE2.stationCount);
  });
});

/** 次の駅の手前でブレーキをかけ、ホームで止まって待つ運転（テスト用） */
const driver = (s: Stage2State): InputFrame => {
  const target = STAGE2.stations[s.nextStation] ?? 0;
  const ahead = wrapDistance(target - s.train.distance, game.track.length);
  const brakeDistance = (s.train.speed * s.train.speed) / (2 * TRAIN.brakeDeceleration);
  if (ahead < 2 || ahead > game.track.length - 4) return NONE; // ホームの中：止まって待つ
  if (brakeDistance >= ahead - 1) return s.train.speed > 0.2 ? BACK : NONE;
  return GO;
};

describe("同じ入力記録 → 同じ結果（リプレイ）", () => {
  const inputs: InputFrame[] = Array.from({ length: 900 }, (_, t) => ({
    throttle: t < 400 ? 1 : t < 500 ? -1 : t < 700 ? 0 : -0.5,
    steer: 0,
  }));

  it("2回再生して、最後の状態が完全に一致する", () => {
    expect(runReplay(game, game.initial(), inputs)).toStrictEqual(runReplay(game, game.initial(), inputs));
  });

  it("別々に作ったゲームでも、JSON に保存した記録から同じ結果", () => {
    const other = createStage2Game();
    const restored = parseReplay(serializeReplay({ version: 1, inputs })).inputs;
    expect(runReplay(other, other.initial(), restored)).toStrictEqual(
      runReplay(game, game.initial(), inputs),
    );
  });

  it("元の状態を書き換えない", () => {
    const s = game.initial();
    const copy = structuredClone(s);
    game.step(s, GO);
    expect(s).toStrictEqual(copy);
  });
});

import { beforeAll, describe, expect, it } from "vitest";
import { createGame, type Game } from "../../src/core/game";
import { createFixedStepper } from "../../src/core/loop";
import { parseReplay, runReplay, serializeReplay } from "../../src/core/replay";
import { BOSS, ROVER, SIM, STAGE5 } from "../../src/config";
import { bossPosition, createStage5Game, type Stage5State } from "../../src/core/stage5";
import { friendStarPositions, pathPoint } from "../../src/core/stage5Layout";
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

// NORI-61 一覧 8（docs/test-plans/NORI-61.md）：ほかの車・自転車・バイク・人もゲームの状態に入り、同じ記録 → 同じ位置
describe("街のほかの車・人もリプレイでずれない（NORI-61）", () => {
  it("ほかの車などは状態に入っていて、10 秒で動き、2回の再生で一致する", () => {
    const inputs = recordedInputs();
    const first = runReplay(game, game.initial(), inputs);
    const second = runReplay(game, game.initial(), inputs);
    expect(first.traffic).toStrictEqual(second.traffic);
    expect(first.traffic).not.toStrictEqual(game.initial().traffic);
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

  // NORI-70（初見レビュー 29-52・R2-29-47）：上の記録は、ジャンプ・届ける・岩の場面を通ったかを見ていなかった
  // （通らなければ、それらの場面のずれは見つけられない）。E2E の運転役（e2e/driver.ts の installRoverDriver）と
  // 同じ決め方で、道すじ → なかよしの星 → ボスに届け、そのあと転がる岩へ向かって記録を作る
  it("運転して作った記録は、ジャンプ・届ける・岩に当たるの3つの場面を通り、2回再生しても完全に一致する", () => {
    const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
    const clamp = (v: number) => Math.max(-1, Math.min(1, v));
    const path = Array.from({ length: Math.floor(STAGE5.pathLength / 5) }, (_, i) => pathPoint((i + 1) * 5));
    const friends = friendStarPositions();
    let next = 0;
    const drive = (s: Stage5State): InputFrame => {
      const r = s.rover;
      const dist = (p: { x: number; z: number }) => Math.hypot(p.x - r.x, p.z - r.z);
      let aim: { x: number; z: number } | undefined;
      if (next < path.length) {
        if (dist(path[next] as { x: number; z: number }) < 3) next++;
        aim = path[Math.min(next, path.length - 1)];
      } else if (s.carrying) {
        aim = bossPosition(s.tick + 1);
      } else if (s.calm === 0) {
        aim = [...friends].sort((p, q) => dist(p) - dist(q))[0];
      } else {
        // 届けたあとは、次に転がる岩の通り道（出る刻みのボスの向き、中心から r0 + 12 m）で止まって待つ。
        // 岩は 4 m/s より速く外へ転がるので、今の位置を追うと追いつけない（測ると、いちばん近づいて 4.79 m だった）
        const interval = Math.round(BOSS.rockInterval / SIM.fixedDt);
        const a = bossPosition((Math.floor(s.tick / interval) + 1) * interval).angle;
        const r0 = BOSS.orbitRadius + BOSS.radius + BOSS.rockRadius + 12;
        const wait = {
          x: STAGE5.arenaCenter.x + Math.cos(a) * r0,
          z: STAGE5.arenaCenter.z + Math.sin(a) * r0,
        };
        if (dist(wait) < 1.5) return { throttle: r.speed > 0.2 ? -0.5 : 0, steer: 0 };
        aim = wait;
      }
      if (aim === undefined) return { throttle: 0, steer: 0 };
      const error = wrap(Math.atan2(-(aim.x - r.x), -(aim.z - r.z)) - r.heading);
      const target = dist(aim) < 8 || Math.abs(error) > 0.6 ? 4 : ROVER.maxForwardSpeed;
      return {
        throttle: r.speed > target + 0.2 ? -0.5 : r.speed < target ? 1 : 0,
        steer: clamp(-error * 3),
      };
    };
    // 記録を作りながら、場面を数え、刻みごとの状態を残す
    const inputs: InputFrame[] = [];
    const recorded: Stage5State[] = [];
    let s = stage5.initial();
    const seen = { jump: -1, deliver: -1, rock: -1 };
    for (let t = 0; t < Math.round(180 / SIM.fixedDt) && seen.rock < 0; t++) {
      const input = drive(s);
      inputs.push(input);
      const before = s;
      s = stage5.step(s, input);
      recorded.push(s);
      if (seen.jump < 0 && before.rover.y === 0 && s.rover.vy > 0) seen.jump = s.tick;
      if (seen.deliver < 0 && s.calm > before.calm) seen.deliver = s.tick;
      if (seen.rock < 0 && s.rockImmuneTicks > before.rockImmuneTicks) seen.rock = s.tick;
    }
    expect(seen.jump, "ジャンプした刻み").toBeGreaterThan(0);
    expect(seen.deliver, "届けた刻み").toBeGreaterThan(seen.jump);
    expect(seen.rock, "岩に当たった刻み").toBeGreaterThan(seen.deliver);
    // その記録を2回再生して、刻みごとの状態が作ったときと完全に一致する。最後の状態だけを比べると、
    // 着地で高さ・上向きの速さが 0 に戻るので、空中だけのずれ（ジャンプの場面）を見のがす（壊して確かめた）
    for (const replayGame of [stage5, createStage5Game()]) {
      let r = replayGame.initial();
      const states = inputs.map((input) => (r = replayGame.step(r, input)));
      expect(states).toStrictEqual(recorded);
    }
    expect(runReplay(stage5, stage5.initial(), inputs)).toStrictEqual(s);
  });

  it("step は元の状態を書き換えない", () => {
    const before = stage5.initial();
    const snapshot = structuredClone(before);
    stage5.step(before, { throttle: 1, steer: 1 });
    expect(before).toStrictEqual(snapshot);
  });
});

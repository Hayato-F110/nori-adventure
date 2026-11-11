import { describe, expect, it } from "vitest";
import { PLANE, SIM, STAGE3 } from "../../src/config";
import { parseReplay, runReplay, serializeReplay } from "../../src/core/replay";
import { createStage3Game, type Stage3State } from "../../src/core/stage3";
import type { InputFrame } from "../../src/core/types";

// docs/game-rules.md「ステージ3：空（飛行機）」（NORI-27）。テストの一覧の 1〜8
const game = createStage3Game();
const dt = SIM.fixedDt;
const NONE: InputFrame = { throttle: 0, steer: 0 };
const UP: InputFrame = { throttle: 1, steer: 0 };
const DOWN: InputFrame = { throttle: -1, steer: 0 };
const RIGHT: InputFrame = { throttle: 0, steer: 1 };

const run = (state: Stage3State, input: InputFrame, ticks: number) =>
  runReplay(
    game,
    state,
    Array.from({ length: ticks }, () => input),
  );

/** 置いた場所・向きから飛ぶ（ほかは初期のまま） */
const at = (x: number, y: number, z: number, heading = 0): Stage3State => {
  const s = game.initial();
  return { ...s, plane: { ...s.plane, x, y, z, heading, pitch: 0, bank: 0 } };
};

describe("輪とゴールの並べ方", () => {
  const all = [game.goal, ...game.rings];

  it(`輪は STAGE3.ringCount 個。ゴールと合わせて円の上に STAGE3.ringSpacing m ずつ`, () => {
    expect(game.rings).toHaveLength(STAGE3.ringCount);
    for (let i = 0; i < all.length; i++) {
      const a = all[i];
      const b = all[(i + 1) % all.length];
      if (a === undefined || b === undefined) throw new Error("輪がない");
      // 円の上の弧の長さ（角度の差 × 半径）
      const da = Math.atan2(b.z, b.x) - Math.atan2(a.z, a.x);
      const arc = Math.abs(Math.atan2(Math.sin(da), Math.cos(da))) * STAGE3.ringPathRadius;
      expect(arc).toBeCloseTo(STAGE3.ringSpacing, 0);
    }
  });

  it("輪の高さは ringBaseHeight ± ringHeightWave の中。ゴールは ringBaseHeight", () => {
    for (const r of game.rings) {
      expect(Math.abs(r.y - STAGE3.ringBaseHeight)).toBeLessThanOrEqual(STAGE3.ringHeightWave + 1e-9);
    }
    expect(game.goal.y).toBe(STAGE3.ringBaseHeight);
  });

  it("山は輪の通り道から 40 m 以上、気球は 25 m 以上離れている", () => {
    for (const m of STAGE3.mountains) {
      expect(Math.abs(Math.hypot(m.x, m.z) - STAGE3.ringPathRadius) - m.radius).toBeGreaterThanOrEqual(40);
    }
    for (const b of STAGE3.balloons) {
      expect(Math.abs(Math.hypot(b.x, b.z) - STAGE3.ringPathRadius) - b.radius).toBeGreaterThanOrEqual(25);
    }
  });

  it("スタートはゴールの輪の STAGE3.startAfterGoal m 先で、円に沿って進む向き", () => {
    const p = game.initial().plane;
    expect(Math.hypot(p.x - game.goal.x, p.z - game.goal.z)).toBeCloseTo(STAGE3.startAfterGoal, 0);
    expect(p.y).toBe(STAGE3.ringBaseHeight);
    expect(p.speed).toBe(PLANE.cruiseSpeed);
    // 1秒まっすぐ飛ぶと、ゴールから遠ざかる（最初にゴールをくぐらない）
    const s = run(game.initial(), NONE, 60);
    expect(Math.hypot(s.plane.x - game.goal.x, s.plane.z - game.goal.z)).toBeGreaterThan(
      STAGE3.startAfterGoal,
    );
    expect(s.finishTick).toBeNull();
  });
});

describe("飛行機の動き（PLANE）", () => {
  it("手を離すと、いつも PLANE.cruiseSpeed で前に進む（止まらない）", () => {
    const s = run(at(0, 40, 200, 0), NONE, 60);
    expect(s.plane.speed).toBe(PLANE.cruiseSpeed);
    expect(s.plane.z).toBeCloseTo(200 - PLANE.cruiseSpeed, 6);
  });

  it("↑ で上へ・↓ で下へ。上下の角度は PLANE.maxPitch まで", () => {
    const up = run(at(0, 40, 200), UP, 120);
    expect(up.plane.y).toBeGreaterThan(40);
    expect(up.plane.pitch).toBeCloseTo(PLANE.maxPitch, 9);
    const down = run(at(0, 40, 200), DOWN, 60);
    expect(down.plane.y).toBeLessThan(40);
    expect(down.plane.pitch).toBeGreaterThanOrEqual(-PLANE.maxPitch);
  });

  it("→ で右に傾いて右へ曲がる。傾きは PLANE.maxBank まで、曲がる速さは PLANE.maxTurnRate まで", () => {
    const s = run(at(0, 40, 200, 0), RIGHT, 120);
    expect(s.plane.bank).toBeCloseTo(PLANE.maxBank, 9);
    // heading が減る＝右へ（車と同じ向き）
    const before = s.plane.heading;
    const next = game.step(s, RIGHT);
    expect(before - next.plane.heading).toBeCloseTo(PLANE.maxTurnRate * dt, 9);
  });

  it("手を離すと、自動で水平に戻る（PLANE.autoLevelRate。最大の傾きから約0.6秒）", () => {
    const tilted = run(run(at(0, 40, 200), RIGHT, 120), UP, 1);
    const ticks = Math.ceil(Math.max(PLANE.maxBank, PLANE.maxPitch) / PLANE.autoLevelRate / dt);
    const level = run(tilted, NONE, ticks);
    expect(level.plane.bank).toBe(0);
    expect(level.plane.pitch).toBe(0);
  });

  it(`高さは PLANE.minAltitude〜PLANE.maxAltitude の外に出ない（墜落しない）`, () => {
    expect(run(at(0, 10, 250), DOWN, 600).plane.y).toBe(PLANE.minAltitude);
    expect(run(at(0, 70, 250), UP, 600).plane.y).toBe(PLANE.maxAltitude);
  });

  it(`見えない柵（STAGE3.boundsHalfSize）の外に出ない`, () => {
    const s = run(at(0, 40, -280, 0), NONE, 600);
    expect(Math.abs(s.plane.z)).toBeLessThanOrEqual(STAGE3.boundsHalfSize);
    expect(Math.abs(s.plane.x)).toBeLessThanOrEqual(STAGE3.boundsHalfSize);
  });
});

describe("山・気球に当たったとき（罰なし）", () => {
  const mountain = STAGE3.mountains[0];
  const balloon = STAGE3.balloons[0];

  it("山に飛び込むと、遅くなり（PLANE.bumpSpeedFactor、PLANE.minSpeed より遅くならない）、上に押し戻される", () => {
    // 中心の山へ、低い所から向かう
    const s = run(at(mountain.x, 10, mountain.z + mountain.radius + 5, 0), NONE, 60);
    expect(s.plane.speed).toBeGreaterThanOrEqual(PLANE.minSpeed);
    expect(s.plane.speed).toBeLessThan(PLANE.cruiseSpeed);
    const d = Math.hypot(s.plane.x - mountain.x, s.plane.z - mountain.z);
    const surface = mountain.height * (1 - Math.max(0, d - PLANE.collisionRadius) / mountain.radius);
    expect(s.plane.y).toBeGreaterThanOrEqual(surface - 1e-6);
  });

  it("当たった瞬間だけ遅くする（触れ続けても、さらに遅くならない）", () => {
    const first = run(at(mountain.x, 10, mountain.z + mountain.radius + 2, 0), NONE, 45);
    expect(first.plane.touching).toBe(true);
    // 当たった瞬間に max(minSpeed, 速さ × bumpSpeedFactor) になり、そのあとは戻る一方（2度目の減速はない）
    const bumped = Math.max(PLANE.minSpeed, PLANE.cruiseSpeed * PLANE.bumpSpeedFactor);
    expect(first.plane.speed).toBeGreaterThanOrEqual(bumped);
    expect(first.plane.speed).toBeLessThanOrEqual(bumped + PLANE.speedChange * dt * 45);
  });

  it("当たったあと、PLANE.speedChange でふつうの速さに戻る", () => {
    const hit = run(at(mountain.x, 10, mountain.z + mountain.radius + 2, 0), NONE, 45);
    const later = run({ ...hit, plane: { ...hit.plane, x: 0, y: 70, z: 200, heading: 0 } }, NONE, 120);
    expect(later.plane.speed).toBe(PLANE.cruiseSpeed);
  });

  it("気球に飛び込むと、外へ押し戻される", () => {
    const s = run(at(balloon.x, balloon.y, balloon.z + balloon.radius + 10, 0), NONE, 90);
    const d = Math.hypot(s.plane.x - balloon.x, s.plane.y - balloon.y, s.plane.z - balloon.z);
    expect(d).toBeGreaterThanOrEqual(balloon.radius + PLANE.collisionRadius - 1e-6);
    expect(s.plane.speed).toBeGreaterThanOrEqual(PLANE.minSpeed);
  });
});

/** 輪の手前 10 m から、輪に向かってまっすぐ飛ぶ状態 */
const before = (
  ring: { x: number; y: number; z: number; heading: number },
  offset = 0,
  back = 10,
): Stage3State => {
  const fx = -Math.sin(ring.heading);
  const fz = -Math.cos(ring.heading);
  return at(
    ring.x - fx * back + Math.cos(ring.heading) * offset,
    ring.y,
    ring.z - fz * back - Math.sin(ring.heading) * offset,
    ring.heading,
  );
};

describe("輪をくぐる（順番は自由、外れても罰なし）", () => {
  it("輪の中心を通ると、その輪を数える", () => {
    const ring = game.rings[3];
    if (ring === undefined) throw new Error("輪がない");
    const s = run(before(ring), NONE, 60);
    expect(s.rings[3]).toBe(true);
    expect(s.rings.filter(Boolean)).toHaveLength(1);
  });

  it("どの順番でもよい（最後の輪から先にくぐっても数える）", () => {
    const ring = game.rings[STAGE3.ringCount - 1];
    if (ring === undefined) throw new Error("輪がない");
    expect(run(before(ring), NONE, 60).rings[STAGE3.ringCount - 1]).toBe(true);
  });

  it("輪の外（半径の外）を通ると数えない。速さ・向きは変わらない（罰なし）", () => {
    const ring = game.rings[0];
    if (ring === undefined) throw new Error("輪がない");
    const s = run(before(ring, STAGE3.ringRadius + 2), NONE, 60);
    expect(s.rings[0]).toBe(false);
    expect(s.plane.speed).toBe(PLANE.cruiseSpeed);
  });

  it("逆の向きからくぐっても数える", () => {
    const ring = game.rings[5];
    if (ring === undefined) throw new Error("輪がない");
    const rev = { ...ring, heading: ring.heading + Math.PI };
    expect(run(before(rev), NONE, 60).rings[5]).toBe(true);
  });
});

describe("ゴール", () => {
  it("ゴールの輪をくぐると終わる（くぐった輪の数によらない）", () => {
    const s = run(before(game.goal), NONE, 60);
    expect(s.finishTick).not.toBeNull();
    expect(s.rings.filter(Boolean)).toHaveLength(0);
  });

  it("ゴールのあとは入力を受け付けず、水平に戻ってまっすぐ飛ぶ", () => {
    const goal = run(before(game.goal), NONE, 60);
    const after = run(goal, { throttle: 1, steer: 1 }, 120);
    expect(after.plane.bank).toBe(0);
    expect(after.plane.pitch).toBe(0);
    expect(after.finishTick).toBe(goal.finishTick);
  });

  it("手を離したまま1周すると、輪をいくつかくぐってゴールに戻る（円に沿って曲がる運転）", () => {
    let s = game.initial();
    for (let i = 0; i < 60 * 90 && s.finishTick === null; i++) s = game.step(s, circleDriver(s));
    expect(s.finishTick).not.toBeNull();
    expect(s.rings.filter(Boolean).length).toBeGreaterThanOrEqual(5);
  });
});

/** 輪の円に沿って飛ぶ運転（テスト用）：円の接線に向けて曲がり、次の輪の高さへ上下する */
const circleDriver = (s: Stage3State): InputFrame => {
  const p = s.plane;
  const a = Math.atan2(p.z, p.x) + 30 / STAGE3.ringPathRadius; // 30 m 先の円の上をねらう
  const tx = Math.cos(a) * STAGE3.ringPathRadius;
  const tz = Math.sin(a) * STAGE3.ringPathRadius;
  const want = Math.atan2(-(tx - p.x), -(tz - p.z));
  const diff = Math.atan2(Math.sin(want - p.heading), Math.cos(want - p.heading));
  const next = game.rings.reduce((best, r) =>
    Math.hypot(r.x - p.x, r.z - p.z) < Math.hypot(best.x - p.x, best.z - p.z) ? r : best,
  );
  return {
    steer: Math.max(-1, Math.min(1, -diff * 3)),
    throttle: Math.max(-1, Math.min(1, (next.y - p.y) / 5)),
  };
};

describe("同じ入力記録 → 同じ結果（リプレイ）", () => {
  const inputs: InputFrame[] = Array.from({ length: 900 }, (_, t) => ({
    throttle: t < 200 ? 1 : t < 400 ? -0.5 : 0,
    steer: t < 300 ? 0.7 : t < 600 ? -1 : 0,
  }));

  it("2回再生して、最後の状態が完全に一致する。JSON に保存した記録からも同じ", () => {
    const first = runReplay(game, game.initial(), inputs);
    expect(runReplay(game, game.initial(), inputs)).toStrictEqual(first);
    const other = createStage3Game();
    const restored = parseReplay(serializeReplay({ version: 1, inputs })).inputs;
    expect(runReplay(other, other.initial(), restored)).toStrictEqual(first);
  });

  it("元の状態を書き換えない", () => {
    const s = game.initial();
    const copy = structuredClone(s);
    game.step(s, UP);
    expect(s).toStrictEqual(copy);
  });
});

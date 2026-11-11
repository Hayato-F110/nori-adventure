import { describe, expect, it } from "vitest";
import { SIM, STAGE4, SUB } from "../../src/config";
import { parseReplay, runReplay, serializeReplay } from "../../src/core/replay";
import { createStage4Game, creaturePosition, type Stage4State } from "../../src/core/stage4";
import type { InputFrame } from "../../src/core/types";

// docs/game-rules.md「ステージ4：海（潜水艇）」（NORI-28）。案A：←→ で曲がる、↑↓ で上下、速さは一定
const game = createStage4Game();
const dt = SIM.fixedDt;
const NONE: InputFrame = { throttle: 0, steer: 0 };
const UP: InputFrame = { throttle: 1, steer: 0 };
const DOWN: InputFrame = { throttle: -1, steer: 0 };
const RIGHT: InputFrame = { throttle: 0, steer: 1 };
const SEABED = -STAGE4.maxDepth;

const run = (state: Stage4State, input: InputFrame, ticks: number) =>
  runReplay(
    game,
    state,
    Array.from({ length: ticks }, () => input),
  );

/** 置いた場所・向きから進む（ほかは初期のまま） */
const at = (x: number, y: number, z: number, heading = 0, tick = 0): Stage4State => {
  const s = game.initial();
  return { ...s, tick, sub: { ...s.sub, x, y, z, heading, tilt: 0 } };
};

/** 点 p から、手がかりの道（スタート → 手がかり → たからばこ の折れ線）までの最短距離 */
const distanceToPath = (p: { x: number; y: number; z: number }) => {
  const s = game.initial().sub;
  const pts = [{ x: s.x, y: s.y, z: s.z }, ...game.hints, game.treasure];
  let best = Infinity;
  for (let i = 0; i + 1 < pts.length; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    if (a === undefined || b === undefined) continue;
    for (let k = 0; k <= 50; k++) {
      const t = k / 50;
      best = Math.min(
        best,
        Math.hypot(a.x + (b.x - a.x) * t - p.x, a.y + (b.y - a.y) * t - p.y, a.z + (b.z - a.z) * t - p.z),
      );
    }
  }
  return best;
};

describe("コース：スタート・たからばこ・手がかり・岩・生きもの", () => {
  it("スタートは STAGE4.start（深さ・−Z の向き）。速さはふつうの速さ", () => {
    const s = game.initial();
    expect(s.sub).toMatchObject({ x: STAGE4.start.x, y: -STAGE4.start.depth, z: STAGE4.start.z, heading: 0 });
    expect(s.sub.speed).toBe(SUB.cruiseSpeed);
    expect(s.found).toEqual(Array.from({ length: STAGE4.creatureCount }, () => false));
    expect(s.finishTick).toBeNull();
  });

  it("たからばこは STAGE4.treasure（海底の上）", () => {
    expect(game.treasure).toEqual({ x: STAGE4.treasure.x, y: -STAGE4.treasure.depth, z: STAGE4.treasure.z });
    expect(game.treasure.y).toBeGreaterThan(SEABED);
  });

  it(`手がかりは STAGE4.hintCount か所。スタートからたからばこへ順に並び、左右の波は ±STAGE4.hintWave m 以内`, () => {
    expect(game.hints).toHaveLength(STAGE4.hintCount);
    const s = game.initial().sub;
    let last = Math.hypot(s.x - game.treasure.x, s.z - game.treasure.z);
    for (const h of game.hints) {
      const d = Math.hypot(h.x - game.treasure.x, h.z - game.treasure.z);
      expect(d).toBeLessThan(last); // だんだん近づく
      last = d;
      expect(Math.abs(h.x - STAGE4.start.x)).toBeLessThanOrEqual(STAGE4.hintWave + 1e-9);
      expect(h.y).toBeLessThan(0);
      expect(h.y).toBeGreaterThan(SEABED);
    }
  });

  it(`手がかりのあわは、いちばん遠いところで STAGE4.hintBubbles 個、近いほど 1 個ずつ多い`, () => {
    game.hints.forEach((h, i) => expect(h.bubbles).toBe(STAGE4.hintBubbles + i));
  });

  it("岩は手がかりの道から 8 m 以上離れている（よけなくても、道に沿えば当たらない）", () => {
    for (const r of STAGE4.rocks) {
      const d = distanceToPath({ x: r.x, y: SEABED, z: r.z }) - r.radius - SUB.collisionRadius;
      expect(d).toBeGreaterThanOrEqual(8);
    }
  });

  it(`生きものは STAGE4.creatureCount 種類（みな違う）。いつでも海の中・範囲の中`, () => {
    expect(STAGE4.creatures).toHaveLength(STAGE4.creatureCount);
    expect(new Set(STAGE4.creatures.map((c) => c.kind)).size).toBe(STAGE4.creatureCount);
    for (const c of STAGE4.creatures) {
      for (let tick = 0; tick < c.seconds / dt; tick += 30) {
        const p = creaturePosition(c, tick);
        expect(p.y).toBeLessThan(-SUB.minDepth);
        expect(p.y).toBeGreaterThan(SEABED);
        expect(Math.abs(p.x)).toBeLessThan(STAGE4.boundsHalfSize);
        expect(Math.abs(p.z)).toBeLessThan(STAGE4.boundsHalfSize);
      }
    }
  });

  it("生きものは円の上を泳ぎ、1周の秒数で元の場所に戻る（同じ時刻 → 同じ場所）", () => {
    for (const c of STAGE4.creatures) {
      const p0 = creaturePosition(c, 0);
      const half = creaturePosition(c, Math.round(c.seconds / 2 / dt));
      const full = creaturePosition(c, Math.round(c.seconds / dt));
      expect(Math.hypot(half.x - p0.x, half.z - p0.z)).toBeCloseTo(2 * c.radius, 1);
      expect(full.x).toBeCloseTo(p0.x, 6);
      expect(full.z).toBeCloseTo(p0.z, 6);
      expect(creaturePosition(c, 123)).toEqual(creaturePosition(c, 123));
    }
  });

  it("生きものは手がかりの道から 25 m 以内を泳ぐ（道に沿って進めば見える）", () => {
    for (const c of STAGE4.creatures) {
      expect(distanceToPath({ x: c.x, y: -c.depth, z: c.z }) - c.radius).toBeLessThanOrEqual(25);
    }
  });
});

describe("潜水艇の動き", () => {
  it("手を離すと、ふつうの速さでまっすぐ進み、深さは変わらない", () => {
    const s0 = at(0, -10, 50);
    const s = run(s0, NONE, 60);
    expect(s.sub.z).toBeCloseTo(50 - SUB.cruiseSpeed, 6);
    expect(s.sub.x).toBeCloseTo(0, 9);
    expect(s.sub.y).toBeCloseTo(-10, 9);
    expect(s.sub.speed).toBe(SUB.cruiseSpeed);
  });

  it("→ で右へ曲がる（heading が減る）。曲がる速さは SUB.turnRate", () => {
    const s = run(at(0, -10, 50), RIGHT, 60);
    expect(s.sub.heading).toBeCloseTo(-SUB.turnRate, 6);
  });

  it("↑ で上へ・↓ で下へ、SUB.verticalSpeed で。手を離すとその深さで止まる", () => {
    const up = run(at(0, -20, 50), UP, 60);
    expect(up.sub.y).toBeCloseTo(-20 + SUB.verticalSpeed, 6);
    const down = run(at(0, -20, 50), DOWN, 60);
    expect(down.sub.y).toBeCloseTo(-20 - SUB.verticalSpeed, 6);
    const rest = run(up, NONE, 60);
    expect(rest.sub.y).toBeCloseTo(up.sub.y, 9);
  });

  it("見た目の傾きは、↑↓ の間 SUB.maxTilt まで。手を離すと 0 に戻る", () => {
    const up = run(at(0, -20, 50), UP, 120);
    expect(up.sub.tilt).toBeCloseTo(SUB.maxTilt, 6);
    const down = run(at(0, -20, 50), DOWN, 120);
    expect(down.sub.tilt).toBeCloseTo(-SUB.maxTilt, 6);
    expect(run(up, NONE, 120).sub.tilt).toBeCloseTo(0, 9);
  });

  it(`海面から SUB.minDepth m より上へは出ない。海底より下へは行かない`, () => {
    expect(run(at(0, -3, 50), UP, 180).sub.y).toBeCloseTo(-SUB.minDepth, 9);
    const low = run(at(0, SEABED + 3, 50), DOWN, 180);
    expect(low.sub.y).toBeCloseTo(SEABED + SUB.collisionRadius, 9);
  });

  it(`範囲（±STAGE4.boundsHalfSize m）の外へは出ない`, () => {
    const s = run(at(0, -10, -STAGE4.boundsHalfSize + 2), NONE, 300);
    expect(s.sub.z).toBeGreaterThanOrEqual(-STAGE4.boundsHalfSize);
  });

  it("岩に当たると外へ押し出され、少し遅くなるだけ（最初に戻らない）。そのあと元の速さに戻る", () => {
    const rock = STAGE4.rocks[0];
    if (rock === undefined) throw new Error("岩がない");
    // 岩の真上の少し北から、岩の中心へ向けて進む
    const s0 = at(rock.x, SEABED + rock.radius - 1, rock.z + rock.radius + SUB.collisionRadius + 1);
    let s = s0;
    let hitSpeed = Infinity;
    for (let i = 0; i < 120; i++) {
      s = game.step(s, NONE);
      if (s.sub.touching) hitSpeed = Math.min(hitSpeed, s.sub.speed);
      const d = Math.hypot(s.sub.x - rock.x, s.sub.y - SEABED, s.sub.z - rock.z);
      expect(d).toBeGreaterThanOrEqual(rock.radius + SUB.collisionRadius - 1e-6);
    }
    expect(hitSpeed).toBeCloseTo(Math.max(SUB.minSpeed, SUB.cruiseSpeed * SUB.bumpSpeedFactor), 1);
    expect(Math.hypot(s.sub.x - s0.sub.x, s.sub.z - s0.sub.z)).toBeLessThan(30); // 遠くのスタートへ戻されない
    const later = run({ ...s, sub: { ...s.sub, x: 0, y: -10, z: 50, touching: false } }, NONE, 180);
    expect(later.sub.speed).toBe(SUB.cruiseSpeed);
  });
});

describe("生きもの・たからばこ", () => {
  it(`生きものから STAGE4.discoverRadius m 以内に入ると「見つけた」。遠いと数えない`, () => {
    const c = STAGE4.creatures[0];
    if (c === undefined) throw new Error("生きものがいない");
    const tick = 100;
    const p = creaturePosition(c, tick + 1);
    // 進む向き（−Z）の前に生きものがいるように、少し後ろ（+Z）に置く
    const near = game.step(
      at(p.x, p.y, p.z + STAGE4.discoverRadius - 1 + SUB.cruiseSpeed * dt, 0, tick),
      NONE,
    );
    expect(near.found[0]).toBe(true);
    const far = game.step(at(p.x, p.y, p.z + STAGE4.discoverRadius + 3, 0, tick), NONE);
    expect(far.found[0]).toBe(false);
  });

  it("一度見つけた生きものは、離れても見つけたまま", () => {
    const s = at(0, -10, 50);
    const found = { ...s, found: s.found.map((_, i) => i === 0) };
    expect(run(found, NONE, 60).found[0]).toBe(true);
  });

  it(`たからばこから STAGE4.treasureRadius m 以内でゴール。生きものを見つけていなくてもよい`, () => {
    const t = game.treasure;
    const s = game.step(at(t.x, t.y, t.z + STAGE4.treasureRadius - 0.5), NONE);
    expect(s.finishTick).toBe(1);
    expect(s.found.every((f) => !f)).toBe(true);
  });

  it("ゴールのあとは入力を受け付けず、ゆっくり止まる", () => {
    const t = game.treasure;
    const done = game.step(at(t.x, t.y + 1, t.z + 2), NONE);
    expect(done.finishTick).not.toBeNull();
    const after = run(done, UP, 600);
    expect(after.sub.speed).toBe(0);
    expect(after.sub.y).toBeCloseTo(done.sub.y, 9);
    expect(after.sub.heading).toBe(done.sub.heading);
    expect(after.finishTick).toBe(done.finishTick);
  });
});

describe("決定的（リプレイ）", () => {
  it("同じ入力 → 同じ結果。記録を文字にして戻しても同じ", () => {
    const inputs: InputFrame[] = Array.from({ length: 900 }, (_, i) => ({
      throttle: i % 200 < 60 ? -1 : 0,
      steer: Math.sin(i / 50),
    }));
    const a = runReplay(game, game.initial(), inputs);
    const b = runReplay(game, game.initial(), parseReplay(serializeReplay({ version: 1, inputs })).inputs);
    expect(b).toEqual(a);
  });

  it("前の状態を書き換えない", () => {
    const s0 = game.initial();
    const copy = structuredClone(s0);
    game.step(s0, RIGHT);
    expect(s0).toEqual(copy);
  });
});

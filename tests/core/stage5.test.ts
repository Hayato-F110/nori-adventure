import { describe, expect, it } from "vitest";
import { RESPAWN, ROVER, SIM, STAGE5 } from "../../src/config";
import { runReplay } from "../../src/core/replay";
import { createStage5Game, type Stage5State } from "../../src/core/stage5";
import { jumpPads, nearestPathD, pathPoint, starPositions } from "../../src/core/stage5Layout";
import type { InputFrame } from "../../src/core/types";

// docs/game-rules.md「ステージ5：月面（ローバー）とボス」（NORI-29）。テストの一覧（docs/test-plans/NORI-29.md）の 1〜8・11・12
const game = createStage5Game();
const dt = SIM.fixedDt;
const NONE: InputFrame = { throttle: 0, steer: 0 };
const GO: InputFrame = { throttle: 1, steer: 0 };
const BACK: InputFrame = { throttle: -1, steer: 0 };

const run = (state: Stage5State, input: InputFrame, ticks: number) =>
  runReplay(
    game,
    state,
    Array.from({ length: ticks }, () => input),
  );

/** 置いた場所・向き・速さから進む（ほかは初期のまま） */
const at = (x: number, z: number, heading = 0, speed = 0, y = 0): Stage5State => {
  const s = game.initial();
  return { ...s, rover: { ...s.rover, x, z, heading, speed, y, vy: 0 } };
};

describe("ローバーの動き", () => {
  it("スタートは (0, 85)、−Z の向き、止まっている", () => {
    const r = game.initial().rover;
    expect([r.x, r.z, r.heading, r.speed, r.y]).toEqual([0, 85, 0, 0, 0]);
  });

  it("▶ で 4 m/s² で速くなり、8 m/s で止まる", () => {
    expect(run(game.initial(), GO, 60).rover.speed).toBeCloseTo(4, 6);
    expect(run(game.initial(), GO, 240).rover.speed).toBeCloseTo(ROVER.maxForwardSpeed, 9);
  });

  it("◀ は 10 m/s² のブレーキ。止まったら 3 m/s までさがる", () => {
    const fast = at(0, 85, 0, 8);
    expect(run(fast, BACK, 30).rover.speed).toBeCloseTo(3, 6);
    expect(run(fast, BACK, 600).rover.speed).toBeCloseTo(-ROVER.maxReverseSpeed, 9);
  });

  it("手を離すと 2 m/s² で遅くなる", () => {
    expect(run(at(0, 85, 0, 8), NONE, 60).rover.speed).toBeCloseTo(6, 6);
  });

  it("ハンドルいっぱい（右）で 1.6 rad/s で曲がる（右で heading が減る）", () => {
    const s = run(at(0, 50, 0, 8), { throttle: 1, steer: 1 }, 120);
    const next = game.step(s, { throttle: 1, steer: 1 });
    expect((s.rover.heading - next.rover.heading) / dt).toBeCloseTo(ROVER.maxTurnRate, 3);
  });
});

/** ジャンプ台 k の中心に、台の向きで、速さ v で置く */
const onPad = (k: number, v: number): Stage5State => {
  const pad = jumpPads()[k];
  if (pad === undefined) throw new Error("台がない");
  return at(pad.x, pad.z, pad.heading, v);
};

describe("ジャンプ", () => {
  it("8 m/s で台に入ると跳ぶ：いちばん高い所 2.78 m、空中 3.70 秒、29.6 m 先に着く", () => {
    let s = onPad(0, 8);
    let top = 0;
    let air = 0;
    let start: { x: number; z: number } | null = null;
    for (let i = 0; i < 400; i++) {
      s = game.step(s, GO);
      if (s.rover.vy > 0 && start === null) start = { x: s.rover.x, z: s.rover.z };
      if (s.rover.y > 0) air++;
      top = Math.max(top, s.rover.y);
      if (start !== null && s.rover.y === 0 && air > 0) break;
    }
    const jump = (ROVER.jumpSpeed * ROVER.jumpSpeed) / (2 * ROVER.gravity);
    const airSeconds = (2 * ROVER.jumpSpeed) / ROVER.gravity;
    expect(top).toBeCloseTo(jump, 1);
    expect(Math.abs(air - airSeconds / dt)).toBeLessThanOrEqual(1);
    expect(start).not.toBeNull();
    const dist = Math.hypot(s.rover.x - (start?.x ?? 0), s.rover.z - (start?.z ?? 0));
    expect(Math.abs(dist - 8 * airSeconds)).toBeLessThanOrEqual(0.2);
  });

  it("台の上で 1 m/s より遅いと跳ばない", () => {
    const s = run(onPad(0, 0.5), NONE, 60);
    expect(s.rover.y).toBe(0);
    expect(s.rover.vy).toBe(0);
  });

  it("後ろ向きに進んでいても跳ばない", () => {
    const s = run(onPad(0, -2), NONE, 30);
    expect(s.rover.y).toBe(0);
  });

  it("空中では曲がれるが、▶ ◀ を押しても速さは変わらない", () => {
    const up = run(onPad(0, 8), GO, 20);
    expect(up.rover.y).toBeGreaterThan(0);
    const braked = run(up, { throttle: -1, steer: 1 }, 60);
    expect(braked.rover.y).toBeGreaterThan(0);
    expect(braked.rover.speed).toBe(up.rover.speed);
    expect(braked.rover.heading).toBeLessThan(up.rover.heading);
  });
});

describe("当たったとき", () => {
  const rock = STAGE5.rocks[0];
  if (rock === undefined) throw new Error("岩がない");
  const contact = rock.radius + ROVER.collisionRadius;
  // 岩の +Z 側 contact + 0.5 m から −Z（岩の方）へ
  const facingRock = (speed: number, y = 0) => at(rock.x, rock.z + contact + 0.5, 0, speed, y);

  it("岩に当たると外へ押し戻され、速さが 0.3 倍になる", () => {
    let s = facingRock(8);
    let bumped = false;
    for (let i = 0; i < 30; i++) {
      const before = s.rover.speed;
      s = game.step(s, GO);
      expect(Math.hypot(s.rover.x - rock.x, s.rover.z - rock.z)).toBeGreaterThanOrEqual(contact - 1e-9);
      if (!bumped && s.rover.touching) {
        bumped = true;
        expect(s.rover.speed).toBeLessThanOrEqual(
          before * ROVER.bumpSpeedFactor + ROVER.acceleration * dt + 1e-9,
        );
      }
    }
    expect(bumped).toBe(true);
  });

  it("空中で岩の高さより上なら当たらない", () => {
    let s = facingRock(8, rock.radius + 0.9);
    s = run(s, GO, 15);
    expect(Math.hypot(s.rover.x - rock.x, s.rover.z - rock.z)).toBeLessThan(contact);
    expect(s.rover.speed).toBe(8);
  });

  it("中心から 100 m の柵より外へ出ない", () => {
    const s = run(at(99, 0, -Math.PI / 2, 8), GO, 120);
    expect(s.rover.x).toBeLessThanOrEqual(STAGE5.boundsHalfSize);
  });
});

describe("はまったとき", () => {
  it("2 秒ほぼ動けないと、道すじのいちばん近い点から再開し、2 秒の無敵", () => {
    // 柵に正面から押しつけると動けない
    const stuck = at(STAGE5.boundsHalfSize, -50, -Math.PI / 2, 0);
    const limit = Math.round(RESPAWN.stuckSeconds / dt);
    const before = run(stuck, GO, limit - 1);
    expect(before.respawns).toBe(0);
    const after = game.step(before, GO);
    expect(after.respawns).toBe(1);
    const p = pathPoint(nearestPathD(STAGE5.boundsHalfSize, -50));
    expect(after.rover.x).toBeCloseTo(p.x, 9);
    expect(after.rover.z).toBeCloseTo(p.z, 9);
    expect(after.rover.speed).toBe(0);
    expect(after.invincibleTicks).toBe(Math.round(RESPAWN.invincibleSeconds / dt));
  });
});

describe("ほし", () => {
  const airStars = (s: Stage5State, pad: number) => {
    const from = STAGE5.groundStars.length + pad * STAGE5.airStars.length;
    return s.stars.slice(from, from + STAGE5.airStars.length).filter(Boolean).length;
  };

  it.each([
    [8, 3],
    [6, 3],
    [4, 1],
  ])("%d m/s で台から跳ぶと、空中のほしが %d 個取れる", (v, n) => {
    const s = run(onPad(0, v), GO, 300);
    expect(airStars(s, 0)).toBe(n);
  });

  it("ほしは 2 m 以内で取れ、1 回だけ数える", () => {
    const star = starPositions()[0];
    if (star === undefined) throw new Error("ほしがない");
    const far = game.step(at(star.x + 2.5, star.z), NONE);
    expect(far.stars[0]).toBe(false);
    const near = game.step(at(star.x + 1.5, star.z), NONE);
    expect(near.stars[0]).toBe(true);
    const again = run(near, NONE, 30);
    expect(again.stars.filter(Boolean)).toHaveLength(1);
  });
});

import { describe, expect, it } from "vitest";
import { BOSS, ROVER, SIM, STAGE5 } from "../../src/config";
import { runReplay } from "../../src/core/replay";
import {
  bossAt,
  bossPosition,
  createStage5Game,
  friendAvailable,
  rocksAt,
  type Stage5State,
} from "../../src/core/stage5";
import { friendStarPositions } from "../../src/core/stage5Layout";
import type { InputFrame } from "../../src/core/types";

// docs/game-rules.md「ボスの広場（落ち着かせる）」（NORI-29）。テストの一覧（docs/test-plans/NORI-29.md）の 13〜20・25
const game = createStage5Game();
const dt = SIM.fixedDt;
const NONE: InputFrame = { throttle: 0, steer: 0 };
const C = STAGE5.arenaCenter;
const ticks = (seconds: number) => Math.round(seconds / dt);

const run = (state: Stage5State, input: InputFrame, n: number) =>
  runReplay(
    game,
    state,
    Array.from({ length: n }, () => input),
  );

/** 刻み tick に、場所 (x, z) に止まって置く（ほかは初期のまま） */
const at = (x: number, z: number, tick = 0, extra: Partial<Stage5State> = {}): Stage5State => {
  const s = game.initial();
  return { ...s, ...extra, tick, rover: { ...s.rover, x, z, speed: 0 } };
};

/** ボスの中心から外向きに r m の所（次の刻みのボスの位置で） */
const nearBoss = (tick: number, r: number) => {
  const b = bossPosition(tick + 1);
  const ox = b.x - C.x;
  const oz = b.z - C.z;
  const len = Math.hypot(ox, oz);
  return { x: b.x + (ox / len) * r, z: b.z + (oz / len) * r };
};

describe("ボスの動き", () => {
  it("最初は中心から −Z 側 10 m。中心から 10 m の円を 2 m/s で回る", () => {
    const b0 = bossPosition(0);
    expect(b0.x).toBeCloseTo(C.x, 9);
    expect(b0.z).toBeCloseTo(C.z - BOSS.orbitRadius, 9);
    for (const t of [0, 100, 1000, 5000]) {
      const b = bossPosition(t);
      expect(Math.hypot(b.x - C.x, b.z - C.z)).toBeCloseTo(BOSS.orbitRadius, 9);
    }
    // 1 秒で円の上を 2 m（角度で 0.2 rad）
    expect(bossPosition(60).angle - b0.angle).toBeCloseTo(BOSS.moveSpeed / BOSS.orbitRadius, 9);
  });

  it("上から見て時計回り（+X から +Z へ）：−Z 側から始めて、次は +X 側へ", () => {
    const quarter = (Math.PI / 2) * (BOSS.orbitRadius / BOSS.moveSpeed);
    const b = bossPosition(ticks(quarter));
    // 刻みに丸めるので、角度で最大 0.2 × (0.5 / 60) rad ずれる（円の上で 0.02 m 以内）
    expect(Math.abs(b.x - (C.x + BOSS.orbitRadius))).toBeLessThan(0.02);
    expect(Math.abs(b.z - C.z)).toBeLessThan(0.02);
  });
});

describe("なかよしの星", () => {
  it("8 個が広場の中心から 22 m の円に 45° おき、高さ 1 m", () => {
    const stars = friendStarPositions();
    expect(stars).toHaveLength(BOSS.friendStarCount);
    stars.forEach((s, i) => {
      expect(Math.hypot(s.x - C.x, s.z - C.z)).toBeCloseTo(BOSS.friendStarRing, 9);
      expect(s.y).toBe(BOSS.friendStarHeight);
      expect(Math.atan2(s.z - C.z, s.x - C.x)).toBeCloseTo(
        Math.atan2(Math.sin(i * (Math.PI / 4)), Math.cos(i * (Math.PI / 4))),
        9,
      );
    });
  });

  it("取ると持ち、10 秒後に同じ場所に出直す", () => {
    const star = friendStarPositions()[0];
    if (star === undefined) throw new Error("星がない");
    const s = game.step(at(star.x, star.z), NONE);
    expect(s.carrying).toBe(true);
    expect(friendAvailable(s, 0)).toBe(false);
    // 持ったまま離れて待つ
    const away = { ...s, rover: { ...s.rover, x: C.x, z: C.z + 28 } };
    expect(friendAvailable(run(away, NONE, ticks(BOSS.friendStarRespawnSeconds) - 2), 0)).toBe(false);
    expect(friendAvailable(run(away, NONE, ticks(BOSS.friendStarRespawnSeconds)), 0)).toBe(true);
  });

  // NORI-70（初見レビュー 29-36・R2-29-29）：ルール「なかよしの星を取る距離 2 m（ほしと同じ。高さも含めた距離）」。
  // 星は高さ 1 m なので、地面のローバーとは横に √(2² − 1²) ≈ 1.732 m がちょうど 2 m
  it("取る距離 2 m の境目：横に 1.70 m（合わせて約 1.97 m）なら取り、1.76 m（約 2.02 m）なら取らない", () => {
    const star = friendStarPositions()[4];
    if (star === undefined) throw new Error("星がない");
    expect(game.step(at(star.x + 1.7, star.z), NONE).carrying).toBe(true);
    expect(game.step(at(star.x + 1.76, star.z), NONE).carrying).toBe(false);
  });

  it("持っている間は、ほかの星を取らない", () => {
    const star = friendStarPositions()[2];
    if (star === undefined) throw new Error("星がない");
    const s = game.step(at(star.x, star.z, 0, { carrying: true }), NONE);
    expect(s.carrying).toBe(true);
    expect(friendAvailable(s, 2)).toBe(true);
  });
});

// NORI-69（初見レビュー 29-15・29-32）：ボスに当たったとき。ルールの行「ボスに当たったとき」「ボスの大きさ（当たり判定の半径）」
describe("ボスに当たったとき", () => {
  const contact = BOSS.radius + ROVER.collisionRadius;
  const GO: InputFrame = { throttle: 1, steer: 0 };
  /** 次の刻みのボスから contact + gap m の所に、ボスの中心へ向けて 8 m/s で置く */
  const facingBoss = (gap: number, y = 0): Stage5State => {
    const p = nearBoss(0, contact + gap);
    const b = bossPosition(1);
    const heading = Math.atan2(-(b.x - p.x), -(b.z - p.z)); // 前は (−sin, −cos)
    const s = game.initial();
    return { ...s, rover: { ...s.rover, x: p.x, z: p.z, heading, speed: ROVER.maxForwardSpeed, y, vy: 0 } };
  };

  it("ボスに当たると、半径 3 m＋ローバーの半径より内に入らず、当たり始めた刻みだけ速さが 0.3 倍", () => {
    let s = facingBoss(0.1);
    let bumped = false;
    let touchingAfter = 0;
    for (let i = 0; i < 30; i++) {
      const before = s.rover.speed;
      s = game.step(s, GO);
      const b = bossAt(s);
      expect(Math.hypot(s.rover.x - b.x, s.rover.z - b.z)).toBeGreaterThanOrEqual(contact - 1e-9);
      if (!bumped && s.rover.touching) {
        bumped = true;
        // 当たり始めた刻み：その刻みで加速したあとの速さ（上限 8 m/s）の 0.3 倍（NORI-69 の2回目の初見レビュー：前は上限だけ）
        const accelerated = Math.min(before + ROVER.acceleration * dt, ROVER.maxForwardSpeed);
        expect(s.rover.speed).toBeCloseTo(accelerated * ROVER.bumpSpeedFactor, 9);
      } else if (bumped && s.rover.touching) {
        // 触れ続けている間は、続けて 0.3 倍にしない（当たり始めた刻みだけ。ルールの文、レビュー 29-57）
        expect(s.rover.speed).toBeGreaterThanOrEqual(before - 1e-9);
        touchingAfter++;
      }
    }
    expect(bumped).toBe(true);
    expect(touchingAfter).toBeGreaterThan(0); // 触れ続けた刻みを本当に通った
  });

  it("ボスの高さ 6 m より上なら当たらない（通りぬける）", () => {
    const s = run(facingBoss(0.1, BOSS.height + 0.9), GO, 15);
    const b = bossAt(s);
    expect(Math.hypot(s.rover.x - b.x, s.rover.z - b.z)).toBeLessThan(contact);
    expect(s.rover.speed).toBe(ROVER.maxForwardSpeed);
  });
});

describe("届ける", () => {
  it("星を持ってボスの中心から 7 m 以内に入ると、回数が 1 増え、星がなくなる", () => {
    const p = nearBoss(0, BOSS.deliverRadius - 0.5);
    const s = game.step(at(p.x, p.z, 0, { carrying: true }), NONE);
    expect(s.calm).toBe(1);
    expect(s.carrying).toBe(false);
  });

  it("7 m より外、または星を持っていなければ増えない", () => {
    const out = nearBoss(0, BOSS.deliverRadius + 0.5);
    expect(game.step(at(out.x, out.z, 0, { carrying: true }), NONE).calm).toBe(0);
    const p = nearBoss(0, BOSS.deliverRadius - 0.5);
    expect(game.step(at(p.x, p.z), NONE).calm).toBe(0);
  });

  it("5 回届けるとクリア：finishTick が入り、岩が消え、ボスが止まる", () => {
    const t = ticks(BOSS.rockInterval) + 30; // 岩が転がっている時刻
    const p = nearBoss(t, BOSS.deliverRadius - 0.5);
    const s = game.step(at(p.x, p.z, t, { carrying: true, calm: BOSS.calmPoints - 1 }), NONE);
    expect(s.calm).toBe(BOSS.calmPoints);
    expect(s.finishTick).toBe(t + 1);
    expect(rocksAt(s)).toEqual([]);
    const later = run(s, NONE, 300);
    expect(bossAt(later)).toEqual(bossAt(s));
    expect(rocksAt(later)).toEqual([]);
  });

  // NORI-70（初見レビュー R2-29-40。11/13 オーナーの決定）：ルール「ゴール … そのあとは入力を受け付けず、手を離したときと同じ減速で止まる」
  it("クリアのあとは ▶・ハンドルを受け付けず、手を離したときと同じ 2 m/s² で遅くなる", () => {
    const t = 600;
    const p = nearBoss(t, BOSS.deliverRadius - 0.5);
    const start = at(p.x, p.z, t, { carrying: true, calm: BOSS.calmPoints - 1 });
    // ボスから外へ向けて走らせる（ボスに当たって 0.3 倍にならないように。前は (−sin, −cos)）
    const b = bossPosition(t + 1);
    const heading = Math.atan2(-(p.x - b.x), -(p.z - b.z));
    const moving = { ...start, rover: { ...start.rover, speed: 5, heading } };
    const cleared = game.step(moving, NONE);
    expect(cleared.finishTick).toBe(t + 1);
    const pushed = run(cleared, { throttle: 1, steer: 1 }, 60);
    const coasted = run(cleared, NONE, 60);
    expect(pushed.rover).toEqual(coasted.rover);
    expect(pushed.rover.speed).toBeCloseTo(cleared.rover.speed - ROVER.coastDeceleration, 9);
    expect(pushed.rover.heading).toBe(cleared.rover.heading);
  });
});

describe("岩", () => {
  it("5 秒ごとに、広場の中心 → ボスの向きへ 4 m/s で出て、中心から 30 m で消える", () => {
    const launch = ticks(BOSS.rockInterval);
    expect(rocksAt(at(0, 0, launch - 1))).toEqual([]);
    const first = rocksAt(at(0, 0, launch));
    expect(first).toHaveLength(1);
    const b = bossPosition(launch);
    const r0 = BOSS.orbitRadius + BOSS.radius + BOSS.rockRadius;
    expect(first[0]?.x).toBeCloseTo(C.x + Math.cos(b.angle) * r0, 9);
    expect(first[0]?.z).toBeCloseTo(C.z + Math.sin(b.angle) * r0, 9);
    const oneSecond = rocksAt(at(0, 0, launch + 60))[0];
    expect(Math.hypot((oneSecond?.x ?? 0) - C.x, (oneSecond?.z ?? 0) - C.z)).toBeCloseTo(
      r0 + BOSS.rockSpeed,
      9,
    );
    const life = ticks((STAGE5.arenaRadius - r0) / BOSS.rockSpeed);
    expect(rocksAt(at(0, 0, launch + life))).toHaveLength(1);
    expect(rocksAt(at(0, 0, launch + life + 1))).toEqual([]);
  });

  // NORI-70（初見レビュー 29-40・R2-29-33）：2回目以降も同じ決まり（10・15 秒に、そのときのボスの向きへ）
  it.each([2, 3])("%d 回目の岩も、5 秒おきに、そのときの中心 → ボスの向きへ出る", (k) => {
    const launch = k * ticks(BOSS.rockInterval);
    const r0 = BOSS.orbitRadius + BOSS.radius + BOSS.rockRadius;
    expect(rocksAt(at(0, 0, launch - 1))).toEqual([]); // 前の岩は消え、次はまだ
    const rock = rocksAt(at(0, 0, launch))[0];
    const b = bossPosition(launch);
    expect(rock?.x).toBeCloseTo(C.x + Math.cos(b.angle) * r0, 9);
    expect(rock?.z).toBeCloseTo(C.z + Math.sin(b.angle) * r0, 9);
  });

  // NORI-70（初見レビュー R2-29-34）：岩の位置の関数だけでなく、ゲームを進めて（step）確かめる
  it("ゲームを 1 秒進めた岩は、出た刻みの中心 → ボスの向きにあり、ローバーの場所・動きで変わらない", () => {
    const launch = ticks(BOSS.rockInterval);
    // 2台は広場の中心の左右（x の正と負）に置く（同じ側だと、場所で向きを変える実装を見のがす）
    const a = run(at(30, 60), { throttle: 1, steer: 0 }, launch + 60);
    expect(a.rover.x).toBeGreaterThan(0);
    const b = run(at(-40, -80), { throttle: 1, steer: 1 }, launch + 60);
    expect(a.tick).toBe(launch + 60);
    const rock = rocksAt(a)[0];
    if (rock === undefined) throw new Error("岩がない");
    expect(rocksAt(b)).toEqual(rocksAt(a));
    const angle = bossPosition(launch).angle;
    expect(Math.atan2(rock.z - C.z, rock.x - C.x)).toBeCloseTo(
      Math.atan2(Math.sin(angle), Math.cos(angle)),
      9,
    );
  });

  // NORI-70（初見レビュー R2-29-37）：ルール「中心どうしが 2 m より近いと当たる。押し戻さない。そのあと 2 秒は当たらない」
  it("岩の当たる距離 2 m の境目、押し戻さないこと、2 秒たつとまた当たること", () => {
    const t = ticks(BOSS.rockInterval) + 60;
    const rock = rocksAt(at(0, 0, t + 1))[0];
    if (rock === undefined) throw new Error("岩がない");
    const contact = BOSS.rockRadius + ROVER.collisionRadius;
    // 止まったまま、岩の中心から +X へ d m に置く（止まっているので、ローバーは動かない）
    const near = (d: number, tick = t, extra: Partial<Stage5State> = {}) =>
      at(rock.x + d, rock.z, tick, extra);
    const moving = (s: Stage5State) => ({ ...s, rover: { ...s.rover, speed: 2 } });
    expect(game.step(moving(near(contact - 0.01)), NONE).rockImmuneTicks).toBe(
      ticks(BOSS.rockInvincibleSeconds),
    );
    expect(game.step(moving(near(contact + 0.01)), NONE).rockImmuneTicks).toBe(0);
    // 押し戻さない：止まっていれば、重なったままの場所にいる
    const hit = game.step(near(0.5), NONE);
    expect(hit.rockImmuneTicks).toBeGreaterThan(0);
    expect([hit.rover.x, hit.rover.z]).toEqual([rock.x + 0.5, rock.z]);
    // 2 秒のあと：残りが 0 になった次の刻みに、また岩の中にいれば当たる
    const later = rocksAt(at(0, 0, t + 1 + ticks(BOSS.rockInvincibleSeconds) + 1))[0];
    if (later === undefined) throw new Error("岩がない");
    const again = game.step(
      at(later.x, later.z, t + ticks(BOSS.rockInvincibleSeconds) + 1, { rockImmuneTicks: 0 }),
      NONE,
    );
    expect(again.rockImmuneTicks).toBe(ticks(BOSS.rockInvincibleSeconds));
    const stillImmune = game.step(
      at(later.x, later.z, t + ticks(BOSS.rockInvincibleSeconds) + 1, { rockImmuneTicks: 1 }),
      NONE,
    );
    expect(stillImmune.rockImmuneTicks).toBe(0);
  });

  it("一度に転がっている岩は 1 つだけ。ローバーの場所を変えても、岩の動きは同じ", () => {
    for (let t = 0; t < ticks(60); t += 7) {
      const a = rocksAt(at(0, 0, t));
      expect(a.length).toBeLessThanOrEqual(1);
      expect(rocksAt(at(50, -50, t))).toEqual(a);
    }
  });

  it("岩に当たると速さ 0.3 倍、持っている星は落とさない、2 秒は岩に当たらない", () => {
    const t = ticks(BOSS.rockInterval) + 60;
    const rock = rocksAt(at(0, 0, t + 1))[0];
    if (rock === undefined) throw new Error("岩がない");
    const start: Stage5State = { ...at(rock.x, rock.z, t, { carrying: true }) };
    const moving = { ...start, rover: { ...start.rover, speed: 8, heading: Math.PI / 2 } };
    const hit = game.step(moving, NONE);
    expect(hit.rover.speed).toBeCloseTo((8 - ROVER.coastDeceleration * dt) * BOSS.rockBumpSpeedFactor, 9);
    expect(hit.carrying).toBe(true);
    expect(hit.rockImmuneTicks).toBe(ticks(BOSS.rockInvincibleSeconds));
    // 重なったままでも、続けては遅くならない
    const next = game.step(hit, NONE);
    expect(next.rover.speed).toBeCloseTo(hit.rover.speed - ROVER.coastDeceleration * dt, 9);
  });
});

describe("補正なし", () => {
  it("回数 0 と 4 で、岩の出方・ボスの動きが同じ（隠れた補正がない）", () => {
    for (let t = 0; t < ticks(40); t += 13) {
      const a = at(0, 0, t, { calm: 0 });
      const b = at(0, 0, t, { calm: 4 });
      expect(rocksAt(b)).toEqual(rocksAt(a));
      expect(bossAt(b)).toEqual(bossAt(a));
    }
  });
});

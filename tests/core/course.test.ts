import { beforeAll, describe, expect, it } from "vitest";
import { CAR, RESPAWN, SIM, STAGE1 } from "../../src/config";
import {
  createCourseState,
  headingToward,
  pointAlong,
  routeLength,
  starPositions,
  stepCourse,
} from "../../src/core/course";
import { createGame, type Game } from "../../src/core/game";
import { createStage1Layout, roadLines } from "../../src/core/stage1Layout";
import type { GameState, InputFrame } from "../../src/core/types";
import { autopilot } from "../helpers/autopilot";

// docs/game-rules.md「ステージ1」の「コース」「コースの道すじ」「ぶつかったとき・やり直し」（NORI-25）
const route = STAGE1.route;
const at = (x: number, z: number) => ({ x, z });

describe("道すじ（STAGE1.route）", () => {
  it("長さは 360 m（80 + 80 + 120 + 80）", () => {
    expect(routeLength(route)).toBeCloseTo(360, 9);
  });

  it("チェックポイントは STAGE1.checkpointCount 個（最初と最後の間の点）", () => {
    expect(route.length - 2).toBe(STAGE1.checkpointCount);
  });

  it("角の点は、すべて道の交差点の上（道の中心線どうしが交わる所）", () => {
    const lines = roadLines(STAGE1);
    for (const p of route) {
      expect(lines, `(${p.x}, ${p.z})`).toContain(p.x);
      expect(lines, `(${p.x}, ${p.z})`).toContain(p.z);
    }
  });

  it("pointAlong は道すじの上の位置を返す（角をまたいでも続く）", () => {
    expect(pointAlong(route, 0)).toEqual(at(0, 0));
    expect(pointAlong(route, 90)).toEqual(at(10, -80));
    expect(pointAlong(route, 360)).toEqual(at(0, 40));
  });
});

const starsOf = () => starPositions(route, STAGE1.starCount, STAGE1.starStart, STAGE1.starSpacing);

describe("ほしの場所（STAGE1.starCount・starStart・starSpacing）", () => {
  const stars = starsOf();
  const layout = createStage1Layout(STAGE1);

  it("20 個。最初は 3 m（スタートのすぐ前）、間は 18 m", () => {
    expect(stars).toHaveLength(STAGE1.starCount);
    expect(stars[0]?.x).toBe(0);
    expect(stars[0]?.z).toBeCloseTo(-3, 9);
    expect(stars[1]?.z).toBeCloseTo(-21, 9);
  });

  it("最後のほしはゴールより手前", () => {
    const last = STAGE1.starStart + STAGE1.starSpacing * (STAGE1.starCount - 1);
    expect(last).toBeLessThan(routeLength(route));
  });

  it("どの角（チェックポイント）からも 5 m 以上離れている（角では曲がる線が人ごとに違う）", () => {
    for (const s of stars) {
      for (const corner of route.slice(1, -1)) {
        expect(Math.hypot(s.x - corner.x, s.z - corner.z), `(${s.x}, ${s.z})`).toBeGreaterThanOrEqual(
          5 - 1e-9,
        );
      }
    }
  });

  it("すべて道の中心線の上で、走れる範囲の中、建物にめり込まない", () => {
    const lines = roadLines(STAGE1);
    for (const s of stars) {
      expect(lines.includes(s.x) || lines.includes(s.z), `(${s.x}, ${s.z})`).toBe(true);
      expect(Math.abs(s.x)).toBeLessThanOrEqual(STAGE1.boundsHalfSize);
      expect(Math.abs(s.z)).toBeLessThanOrEqual(STAGE1.boundsHalfSize);
      for (const b of layout.buildings) {
        const inside = Math.abs(s.x - b.x) < b.halfWidth && Math.abs(s.z - b.z) < b.halfDepth;
        expect(inside, `ほし (${s.x}, ${s.z})`).toBe(false);
      }
    }
  });
});

describe("ほし・チェックポイント・ゴール（stepCourse）", () => {
  const stars = starsOf();
  const first = stars[0] ?? at(0, 0);

  it(`ほしは ${STAGE1.starPickupRadius} m 以内で取れ、それより遠いと取れない`, () => {
    const course = createCourseState(STAGE1.starCount);
    const near = stepCourse(course, at(first.x + STAGE1.starPickupRadius - 0.01, first.z), 1, STAGE1);
    expect(near.stars[0]).toBe(true);
    const far = stepCourse(course, at(first.x + STAGE1.starPickupRadius + 0.01, first.z), 1, STAGE1);
    expect(far.stars[0]).toBe(false);
  });

  it("同じほしは1回だけ数える（取ったあとも true のまま、数は増えない）", () => {
    let course = createCourseState(STAGE1.starCount);
    course = stepCourse(course, first, 1, STAGE1);
    course = stepCourse(course, first, 2, STAGE1);
    expect(course.stars.filter(Boolean)).toHaveLength(1);
  });

  it("チェックポイントは順番どおりだけ数える（先に2番目を通っても数えない。罰もない）", () => {
    let course = createCourseState(STAGE1.starCount);
    course = stepCourse(course, at(80, -80), 1, STAGE1); // 2番目
    expect(course.nextCheckpoint).toBe(0);
    course = stepCourse(course, at(0, -80 + STAGE1.checkpointRadius - 0.1), 2, STAGE1); // 1番目
    expect(course.nextCheckpoint).toBe(1);
  });

  it("交差点の内側の角ぎりぎり（道の端の角）を回っても、チェックポイントを数える", () => {
    const half = STAGE1.roadWidth / 2;
    // 1番目の角 (0, −80) の内側の角は (5, −75)。車の中心がそこを通る
    const course = stepCourse(createCourseState(STAGE1.starCount), at(half, -80 + half), 1, STAGE1);
    expect(course.nextCheckpoint).toBe(1);
  });

  it("ゴールは3か所を通ったあとだけ。通った刻みを記録する", () => {
    let course = createCourseState(STAGE1.starCount);
    course = stepCourse(course, at(0, 40), 5, STAGE1);
    expect(course.finishTick).toBeNull();
    for (const [i, p] of route.slice(1, -1).entries()) course = stepCourse(course, p, 10 + i, STAGE1);
    expect(course.nextCheckpoint).toBe(STAGE1.checkpointCount);
    course = stepCourse(course, at(0, 40 + STAGE1.checkpointRadius - 0.1), 99, STAGE1);
    expect(course.finishTick).toBe(99);
    // そのあとは変わらない（時間はゴールで止まる）
    expect(stepCourse(course, at(0, 40), 200, STAGE1).finishTick).toBe(99);
  });

  it("元の状態を書き換えない", () => {
    const course = createCourseState(STAGE1.starCount);
    stepCourse(course, first, 1, STAGE1);
    expect(course.stars[0]).toBe(false);
  });
});

describe("ゲームの中（game.step）", () => {
  let game: Game;
  beforeAll(async () => {
    game = await createGame();
  });
  const run = (state: GameState, ticks: number, input: (s: GameState) => InputFrame) => {
    let s = state;
    for (let i = 0; i < ticks; i++) s = game.step(s, input(s));
    return s;
  };

  it("道すじに沿って走ると、ほし20個を取り、3か所を通ってゴールできる（スタートからゴールまで遊べる）", () => {
    const end = run(game.initial(), 60 * 90, (s) =>
      s.course.finishTick === null ? autopilot(s, route) : { throttle: 0, steer: 0 },
    );
    expect(end.course.nextCheckpoint).toBe(STAGE1.checkpointCount);
    expect(end.course.finishTick).not.toBeNull();
    expect(end.course.stars.filter(Boolean)).toHaveLength(STAGE1.starCount);
    expect(end.respawns).toBe(0);
  });

  it("ゴールのあとは入力を受け付けず、手を離したときと同じ減速で止まる", () => {
    const finished: GameState = {
      ...game.initial(),
      car: { ...game.initial().car, speed: 8 },
      course: { ...createCourseState(STAGE1.starCount), nextCheckpoint: 3, finishTick: 1 },
    };
    const next = game.step(finished, { throttle: 1, steer: 1 });
    expect(next.car.speed).toBeCloseTo(8 - CAR.coastDeceleration * SIM.fixedDt, 9);
    expect(next.car.heading).toBe(finished.car.heading);
    const stopped = run(finished, 60 * 3, () => ({ throttle: 1, steer: 0 }));
    expect(stopped.car.speed).toBe(0);
  });

  it(`壁に向かってアクセルを入れたまま ${RESPAWN.stuckSeconds} 秒動けないと、スタート（まだチェックポイントを通っていない）に戻る。ほしは失わない`, () => {
    // 道（x = 0、端は x = 5）の上で +X を向き、横の建物へ押し付ける。z = −30 には、どの区画でも手前の角の建物
    // （z が −33〜−27 にかかる）がある
    const start = game.initial();
    const facingWall: GameState = {
      ...start,
      car: { ...start.car, x: 0, z: -30, heading: -Math.PI / 2 }, // +X を向く
      course: { ...start.course, stars: start.course.stars.map((_, i) => i === 0) },
    };
    const pushed = run(facingWall, 60 * 6, () => ({ throttle: 1, steer: 0 }));
    expect(pushed.respawns).toBeGreaterThanOrEqual(1);
    expect(pushed.course.stars[0]).toBe(true);
  });

  it("手を離して止まっているだけなら、何秒たっても戻らない", () => {
    const idle = run(game.initial(), 60 * 10, () => ({ throttle: 0, steer: 0 }));
    expect(idle.respawns).toBe(0);
    expect(idle.car.x).toBe(0);
    expect(idle.car.z).toBe(0);
  });

  it("戻る場所は、最後に通ったチェックポイントの上で、次の行き先を向く。無敵の時間が始まる", () => {
    const start = game.initial();
    const passedOne: GameState = {
      ...start,
      course: { ...start.course, nextCheckpoint: 1 },
      stuckTicks: Math.round(RESPAWN.stuckSeconds / SIM.fixedDt) - 1,
      car: { ...start.car, x: 3, z: -50, heading: -Math.PI / 2 },
    };
    // アクセルを入れても動けない最後の1刻み（速さ 0 のまま）
    const next = game.step({ ...passedOne, car: { ...passedOne.car, speed: 0 } }, { throttle: 1, steer: 0 });
    expect(next.respawns).toBe(1);
    expect(next.car.x).toBe(0);
    expect(next.car.z).toBe(-80);
    expect(next.car.heading).toBeCloseTo(headingToward(at(0, -80), at(80, -80)), 9);
    expect(next.car.speed).toBe(0);
    expect(next.invincibleTicks).toBe(Math.round(RESPAWN.invincibleSeconds / SIM.fixedDt));
  });

  it("無敵の間は、建物に当たっても速度が落ちない（当たった瞬間の減速をしない）", () => {
    // z = −30 で、+X から少し +Z 寄りのななめ向きに走り、道の横の建物へ当てる（ななめなので建物に沿って滑れる）。
    // 建物の端（z が −27 付近）を通り過ぎないよう、角度は小さく（0.3 rad）
    // 無敵あり・なしで、当たった最初の刻みの速さを比べる
    const start = game.initial();
    const base: GameState = {
      ...start,
      car: { ...start.car, z: -30, heading: -Math.PI / 2 - 0.3, speed: CAR.maxForwardSpeed },
    };
    const firstTouch = (s0: GameState) => {
      let s = s0;
      for (let i = 0; i < 120 && !s.car.touching; i++) s = game.step(s, { throttle: 1, steer: 0 });
      return s;
    };
    const normal = firstTouch(base);
    const invincible = firstTouch({ ...base, invincibleTicks: 600 });
    expect(normal.car.touching).toBe(true);
    expect(invincible.car.touching).toBe(true);
    expect(invincible.car.speed).toBeGreaterThan(normal.car.speed);
  });
});

describe("headingToward（heading 0 のとき −Z を向く）", () => {
  it("−Z へは 0、+X へは −π/2、−X へは π/2", () => {
    expect(headingToward(at(0, 0), at(0, -10))).toBeCloseTo(0, 9);
    expect(headingToward(at(0, 0), at(10, 0))).toBeCloseTo(-Math.PI / 2, 9);
    expect(headingToward(at(0, 0), at(-10, 0))).toBeCloseTo(Math.PI / 2, 9);
  });
});

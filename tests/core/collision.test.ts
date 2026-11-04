// NORI-13：物理エンジン（Rapier）と当たり判定。実装より先に書いたテスト（2026-11-04）。
//
// 完了条件（Jira）：壁に当たると止まる／跳ね返る
// このテストで確かめること（docs/game-rules.md「建物と木」「ぶつかったとき」）
//   1. 街の配置は区画の番号から決まり、毎回同じ。建物は道にはみ出さず、スタート地点は空いている
//   2. 建物に正面から当たると止まり、中に入らない
//   3. 当たった瞬間に速度が 30% になる（減速は1回だけ）
//   4. ななめに当たると、建物に沿って進み続ける
//   5. 60秒走り回っても、一度も建物・木の中に入らない（すり抜けない）
//   6. 物理を入れても、同じ入力 → 同じ結果
//
// 決めた API（実装は src/core/stage1Layout.ts と src/core/physics.ts）
//   createStage1Layout(STAGE1) → { buildings: Box[], trees: Tree[] }   … 純粋な関数
//   await createCarPhysics(layout) → { step(state, input, dt, CAR, STAGE1): CarState }
//   CarState に touching（建物・木に触れているか）を足す
import { beforeAll, describe, expect, it } from "vitest";
import { CAR, SIM, STAGE1 } from "../../src/config";
import { createCarState } from "../../src/core/car";
import { createCarPhysics, type CarPhysics } from "../../src/core/physics";
import { createStage1Layout, type Box, type Stage1Layout } from "../../src/core/stage1Layout";
import type { CarState, InputFrame, Pose2D } from "../../src/core/types";

const dt = SIM.fixedDt;
const GAS: InputFrame = { throttle: 1, steer: 0 };
// 当たり判定の誤差の許容（Rapier の接触の余白）
const SKIN = 0.05;

/** 上から見た、点と箱の間の距離（箱の中なら 0） */
const distanceToBox = (x: number, z: number, box: Box): number => {
  const dx = Math.max(Math.abs(x - box.x) - box.halfWidth, 0);
  const dz = Math.max(Math.abs(z - box.z) - box.halfDepth, 0);
  return Math.hypot(dx, dz);
};

const overlapsObstacle = (layout: Stage1Layout, x: number, z: number, radius: number): boolean =>
  layout.buildings.some((b) => distanceToBox(x, z, b) < radius) ||
  layout.trees.some((t) => Math.hypot(x - t.x, z - t.z) < radius + t.radius);

const run = (
  physics: CarPhysics,
  state: CarState,
  input: InputFrame,
  seconds: number,
  each?: (s: CarState) => void,
) => {
  let current = state;
  for (let i = 0; i < Math.round(seconds / dt); i++) {
    current = physics.step(current, input, dt, CAR, STAGE1);
    each?.(current);
  }
  return current;
};

let layout: Stage1Layout;
let physics: CarPhysics;

beforeAll(async () => {
  layout = createStage1Layout(STAGE1);
  physics = await createCarPhysics(layout);
});

/** 建物の +Z 側の面に向かって、まっすぐ走れる場所を探す（間にほかの物がない建物を選ぶ） */
const findHeadOnSetup = (gap: number): { building: Box; start: Pose2D } => {
  for (const building of layout.buildings) {
    const faceZ = building.z + building.halfDepth;
    const start = { x: building.x, z: faceZ + gap, heading: 0 }; // heading 0 は −Z 向き → 建物へ
    let clear = true;
    for (let z = faceZ + CAR.collisionRadius + 0.2; z <= start.z; z += 0.5) {
      if (overlapsObstacle(layout, start.x, z, CAR.collisionRadius + 0.2)) clear = false;
    }
    if (clear && Math.abs(start.z) < STAGE1.boundsHalfSize - 2) return { building, start };
  }
  throw new Error("正面から当たれる建物が見つかりません");
};

describe("街の配置（createStage1Layout）", () => {
  it("同じ設定からは、毎回まったく同じ街になる", () => {
    expect(createStage1Layout(STAGE1)).toStrictEqual(createStage1Layout(STAGE1));
  });

  it("4×4 の区画に、建物が1区画 2〜4 棟、木が1本ずつある", () => {
    expect(layout.trees).toHaveLength(16);
    expect(layout.buildings.length).toBeGreaterThanOrEqual(16 * STAGE1.buildingsPerBlockMin);
    expect(layout.buildings.length).toBeLessThanOrEqual(16 * STAGE1.buildingsPerBlockMax);
  });

  it("建物の大きさと高さは、ルールの範囲に入っている", () => {
    for (const b of layout.buildings) {
      for (const size of [b.halfWidth * 2, b.halfDepth * 2]) {
        expect(size).toBeGreaterThanOrEqual(STAGE1.buildingMinSize);
        expect(size).toBeLessThanOrEqual(STAGE1.buildingMaxSize);
      }
      expect(b.height).toBeGreaterThanOrEqual(STAGE1.buildingMinHeight);
      expect(b.height).toBeLessThanOrEqual(STAGE1.buildingMaxHeight);
    }
  });

  it("建物は道（とすき間）にはみ出さない", () => {
    const clearance = STAGE1.roadWidth / 2 + STAGE1.buildingMargin - 1e-9;
    const roadLines: number[] = [];
    for (let p = -80; p <= 80; p += STAGE1.roadSpacing) roadLines.push(p);
    for (const b of layout.buildings) {
      for (const line of roadLines) {
        expect(Math.abs(b.x - line) - b.halfWidth).toBeGreaterThanOrEqual(clearance);
        expect(Math.abs(b.z - line) - b.halfDepth).toBeGreaterThanOrEqual(clearance);
      }
    }
  });

  it("スタート地点は建物にも木にも重ならない", () => {
    expect(overlapsObstacle(layout, STAGE1.start.x, STAGE1.start.z, CAR.collisionRadius)).toBe(false);
  });
});

describe("建物との当たり判定（createCarPhysics）", () => {
  it("正面から当たると止まり、建物の中に入らない", () => {
    const { building, start } = findHeadOnSetup(12);
    let minDistance = Infinity;
    const end = run(physics, createCarState(start), GAS, 4, (s) => {
      minDistance = Math.min(minDistance, distanceToBox(s.x, s.z, building));
    });
    expect(minDistance).toBeGreaterThanOrEqual(CAR.collisionRadius - SKIN);
    expect(Math.abs(end.speed)).toBeLessThan(0.5);
    expect(end.touching).toBe(true);
  });

  it("当たった瞬間に速度が 30% になる（1回だけ）", () => {
    const { start } = findHeadOnSetup(12);
    let before = 0;
    let atImpact: number | null = null;
    run(physics, createCarState(start), GAS, 4, (s) => {
      if (atImpact === null && s.touching) atImpact = Math.abs(s.speed);
      else if (atImpact === null) before = Math.abs(s.speed);
    });
    expect(atImpact).not.toBeNull();
    expect(before).toBeGreaterThan(5); // 十分な速さで当たっている
    expect(atImpact ?? Infinity).toBeLessThanOrEqual(
      before * CAR.bumpSpeedFactor + CAR.acceleration * dt + 1e-6,
    );
  });

  it("ななめに当たると、建物に沿って進み続ける（止まりきらない）", () => {
    const { building, start } = findHeadOnSetup(3);
    // 左前（−X・−Z）へ 45°。建物の +Z 面に触れながら −X へ進むはず
    const diagonal = { ...start, x: building.x + building.halfWidth * 0.5, heading: Math.PI / 4 };
    let touched = false;
    let minDistance = Infinity;
    const end = run(physics, createCarState(diagonal), GAS, 1.2, (s) => {
      touched ||= s.touching;
      minDistance = Math.min(minDistance, distanceToBox(s.x, s.z, building));
    });
    expect(touched).toBe(true);
    expect(minDistance).toBeGreaterThanOrEqual(CAR.collisionRadius - SKIN);
    expect(diagonal.x - end.x).toBeGreaterThan(2);
    expect(Math.abs(end.speed)).toBeGreaterThan(2);
  });

  it("60秒走り回っても、一度も建物・木の中に入らない", () => {
    let state = createCarState(STAGE1.start);
    let violations = 0;
    for (let tick = 0; tick < 60 * 60; tick++) {
      // 2.5秒ごとに 左・まっすぐ・右・まっすぐ を繰り返し、ときどき後退する
      const phase = Math.floor(tick / 150) % 6;
      const input: InputFrame = {
        throttle: phase === 5 ? -1 : 1,
        steer: phase === 1 ? -1 : phase === 3 ? 1 : 0,
      };
      state = physics.step(state, input, dt, CAR, STAGE1);
      if (overlapsObstacle(layout, state.x, state.z, CAR.collisionRadius - SKIN)) violations++;
      expect(Math.abs(state.x)).toBeLessThanOrEqual(STAGE1.boundsHalfSize);
      expect(Math.abs(state.z)).toBeLessThanOrEqual(STAGE1.boundsHalfSize);
    }
    expect(violations).toBe(0);
  });

  it("物理を入れても、同じ入力 → 同じ結果になる", async () => {
    const other = await createCarPhysics(createStage1Layout(STAGE1));
    const script = (tick: number): InputFrame => ({ throttle: 1, steer: Math.sin(tick / 40) });
    let a = createCarState(STAGE1.start);
    let b = createCarState(STAGE1.start);
    for (let tick = 0; tick < 1200; tick++) {
      a = physics.step(a, script(tick), dt, CAR, STAGE1);
      b = other.step(b, script(tick), dt, CAR, STAGE1);
    }
    expect(b).toStrictEqual(a);
  });
});

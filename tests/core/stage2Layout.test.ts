import { describe, expect, it } from "vitest";
import { STAGE2 } from "../../src/config";
import { SIM } from "../../src/config";
import {
  createStage2Scenery,
  offsetOnTrack,
  passingTrainDistance,
  STAGE2_SCENERY,
} from "../../src/core/stage2Layout";
import { createTrack } from "../../src/core/track";

// ステージ2の景色の配置（NORI-26）。描画と光のベイク（Blender）が同じ配置を使うための、純粋な関数
const track = createTrack(STAGE2.trackPoints);
const scenery = createStage2Scenery(track, STAGE2.stations);
const samples = Array.from({ length: Math.ceil(track.length) }, (_, i) => track.pointAt(i));
const toTrack = (x: number, z: number) => Math.min(...samples.map((p) => Math.hypot(p.x - x, p.z - z)));

describe("ステージ2の景色の配置", () => {
  it("同じ線路・駅 → 同じ配置（乱数を使わない）", () => {
    expect(createStage2Scenery(createTrack(STAGE2.trackPoints), STAGE2.stations)).toStrictEqual(scenery);
  });

  it(`木は ${STAGE2_SCENERY.treeCount} 本。線路から 8 m 以上、ホームから 12 m 以上離れている`, () => {
    expect(scenery.trees).toHaveLength(STAGE2_SCENERY.treeCount);
    for (const t of scenery.trees) {
      expect(toTrack(t.x, t.z)).toBeGreaterThanOrEqual(7.9); // 4 m 間隔で調べた値なので、1 m 間隔では少し近くなりうる
      for (const p of scenery.platforms) expect(Math.hypot(p.x - t.x, p.z - t.z)).toBeGreaterThanOrEqual(12);
    }
  });

  it("山は線路にかからない（すそから線路まで 9 m 以上）", () => {
    expect(scenery.mountains.length).toBeGreaterThan(10);
    for (const m of scenery.mountains) expect(toTrack(m.x, m.z) - m.radius).toBeGreaterThan(9);
  });

  it("ホームは駅の数だけ、線路の右（STAGE2_SCENERY.platform.offset m）にある", () => {
    expect(scenery.platforms).toHaveLength(STAGE2.stationCount);
    scenery.platforms.forEach((p, i) => {
      const at = track.pointAt(STAGE2.stations[i] ?? 0);
      expect(Math.hypot(p.x - at.x, p.z - at.z)).toBeCloseTo(STAGE2_SCENERY.platform.offset, 6);
    });
  });

  it("すべて地面（大きさ STAGE2_SCENERY.groundSize）の中", () => {
    const half = STAGE2_SCENERY.groundSize / 2;
    for (const o of [...scenery.trees, ...scenery.mountains, ...scenery.platforms]) {
      expect(Math.abs(o.x)).toBeLessThan(half);
      expect(Math.abs(o.z)).toBeLessThan(half);
    }
  });
});

// NORI-59：すれ違う電車・海辺（docs/game-rules.md「景色と列車を増やす」）。テストの一覧の 2・3
describe("すれ違う電車と海辺", () => {
  const passing = samples.map((_, i) => offsetOnTrack(track, i, -STAGE2.passingOffset));
  const toPassing = (x: number, z: number) => Math.min(...passing.map((p) => Math.hypot(p.x - x, p.z - z)));

  it("すれ違う電車は時刻だけで決まり、逆向きに STAGE2.passingSpeed で進み、線路の長さで1周する", () => {
    const L = track.length;
    expect(passingTrainDistance(L, 0)).toBeCloseTo(STAGE2.passingStart, 9);
    expect(passingTrainDistance(L, 777)).toBe(passingTrainDistance(L, 777));
    const a = passingTrainDistance(L, 600);
    const b = passingTrainDistance(L, 601);
    expect(a - b).toBeCloseTo(STAGE2.passingSpeed * SIM.fixedDt, 9);
    const lap = L / STAGE2.passingSpeed / SIM.fixedDt;
    expect(passingTrainDistance(L, 600 + lap)).toBeCloseTo(a, 6);
    for (const t of [0, 1000, 5000, 99999]) {
      const d = passingTrainDistance(L, t);
      expect(d).toBeGreaterThanOrEqual(0);
      expect(d).toBeLessThan(L);
    }
  });

  it("2本目の線路は、自分の線路の中心から STAGE2.passingOffset m（どこでも 4 m 以上）・ホームから 5 m 以上離れる", () => {
    for (const p of passing) expect(toTrack(p.x, p.z)).toBeGreaterThan(4);
    for (const q of scenery.platforms) expect(toPassing(q.x, q.z)).toBeGreaterThanOrEqual(5);
  });

  it("木は2本目の線路から 6 m 以上離れる", () => {
    for (const t of scenery.trees) expect(toPassing(t.x, t.z)).toBeGreaterThanOrEqual(6);
  });

  it("海辺（z > STAGE2.seaFromZ）に山・木を置かない。線路は海辺から 15 m 以上離れる", () => {
    for (const m of scenery.mountains) expect(m.z + m.radius).toBeLessThanOrEqual(STAGE2.seaFromZ);
    for (const t of scenery.trees) expect(t.z + 3).toBeLessThanOrEqual(STAGE2.seaFromZ);
    for (const p of [...samples, ...passing]) expect(p.z).toBeLessThan(STAGE2.seaFromZ - 15);
  });
});

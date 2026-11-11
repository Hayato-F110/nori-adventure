import { describe, expect, it } from "vitest";
import { STAGE2 } from "../../src/config";
import { createStage2Scenery, STAGE2_SCENERY } from "../../src/core/stage2Layout";
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

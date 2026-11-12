import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { LOOK } from "../../src/config";
import {
  loadLook,
  STAGE_SURFACES,
  setBoxUvMeters,
  setGroundUv1,
  setPlaneUvMeters,
  surfacesFor,
} from "../../src/render/look";

// docs/game-rules.md「見た目」（NORI-56）
describe("UV をメートル単位にする（テクスチャが建物の大きさで伸びない）", () => {
  it("箱：+X 面は（奥行き, 高さ）、+Y 面は（幅, 奥行き）、+Z 面は（幅, 高さ）の大きさになる", () => {
    const geo = setBoxUvMeters(new THREE.BoxGeometry(6, 12, 9), 6, 12, 9);
    const uv = geo.getAttribute("uv");
    const range = (face: number) => {
      const us = [0, 1, 2, 3].map((i) => uv.getX(face * 4 + i));
      const vs = [0, 1, 2, 3].map((i) => uv.getY(face * 4 + i));
      return [Math.max(...us) - Math.min(...us), Math.max(...vs) - Math.min(...vs)];
    };
    expect(range(0)).toEqual([9, 12]);
    expect(range(2)).toEqual([6, 9]);
    expect(range(4)).toEqual([6, 12]);
  });

  it("平面：幅・長さのメートルになる", () => {
    const geo = setPlaneUvMeters(new THREE.PlaneGeometry(10, 190), 10, 190);
    const uv = geo.getAttribute("uv");
    const us = Array.from({ length: uv.count }, (_, i) => uv.getX(i));
    const vs = Array.from({ length: uv.count }, (_, i) => uv.getY(i));
    expect(Math.max(...us)).toBeCloseTo(10, 9);
    expect(Math.max(...vs)).toBeCloseTo(190, 9);
  });
});

describe("地面の陰の uv1（Blender の焼き付けと同じ向き）", () => {
  it("u = (x + 100) / 200、v = (−z + 100) / 200：画像の上の端が z = −100", () => {
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(200, 200));
    ground.rotation.x = -Math.PI / 2;
    setGroundUv1(ground, 200);
    const uv1 = ground.geometry.getAttribute("uv1");
    const pos = ground.geometry.getAttribute("position");
    for (let i = 0; i < pos.count; i++) {
      const world = new THREE.Vector3().fromBufferAttribute(pos, i).applyMatrix4(ground.matrixWorld);
      expect(uv1.getX(i)).toBeCloseTo((world.x + 100) / 200, 6);
      expect(uv1.getY(i)).toBeCloseTo((-world.z + 100) / 200, 6);
    }
    // 角の点：(−100, −100) は u=0・v=1
    const corner = [...Array(pos.count).keys()].find((i) => {
      const w = new THREE.Vector3().fromBufferAttribute(pos, i).applyMatrix4(ground.matrixWorld);
      return Math.abs(w.x + 100) < 1e-6 && Math.abs(w.z + 100) < 1e-6;
    });
    expect(corner).not.toBeUndefined();
    expect(uv1.getY(corner ?? 0)).toBeCloseTo(1, 6);
  });

  it("位置をずらした道でも、世界の位置から決まる", () => {
    const road = new THREE.Mesh(new THREE.PlaneGeometry(10, 10));
    road.rotation.x = -Math.PI / 2;
    road.position.set(40, 0, -40);
    setGroundUv1(road, 200);
    const uv1 = road.geometry.getAttribute("uv1");
    const us = Array.from({ length: uv1.count }, (_, i) => uv1.getX(i));
    // uv1 は Float32 で持つので、6 桁で比べる
    expect(Math.min(...us)).toBeCloseTo((35 + 100) / 200, 6);
  });
});

describe("loadLook：読めないときは null（単色のまま続ける）", () => {
  // WebGL のない Node では renderer を作れないので、最小の形だけ渡す（素材を読む前に止まる場合だけを確かめる）
  const renderer = { capabilities: { getMaxAnisotropy: () => 1 } } as unknown as THREE.WebGLRenderer;

  it("manifest が読めないと null", async () => {
    const look = await loadLook({
      base: "/x/",
      renderer,
      surfaces: LOOK.surfaces,
      fetchManifest: () => Promise.reject(new Error("404")),
    });
    expect(look).toBeNull();
  });

  it("manifest に必要なファイルがないと null（ないファイルを読みに行かない）", async () => {
    const look = await loadLook({
      base: "/x/",
      renderer,
      surfaces: LOOK.surfaces,
      fetchManifest: () => Promise.resolve({ textures: [] }),
    });
    expect(look).toBeNull();
  });
});

// 使わない素材は読まない（起動の直後を軽くする。PR #43 の CI でステージ1が遅くなった件）
describe("ステージごとに使う素材だけを読む", () => {
  it("砂はステージ4だけ。ステージ3は芝と樹皮（山のふもとの木。NORI-60）、ステージ4は砂だけ", () => {
    expect(STAGE_SURFACES.stage4).toEqual(["sand"]);
    expect(STAGE_SURFACES.stage3).toEqual(["grass", "bark"]);
    for (const s of ["stage1", "stage2", "stage3"] as const) expect(STAGE_SURFACES[s]).not.toContain("sand");
  });

  it("surfacesFor は、そのステージの素材だけを、設定（LOOK.surfaces）の値のまま返す", () => {
    const four = surfacesFor(LOOK.surfaces, "stage4");
    expect(Object.keys(four)).toEqual(["sand"]);
    expect(four.sand).toBe(LOOK.surfaces.sand);
    expect(Object.keys(surfacesFor(LOOK.surfaces, "stage1")).sort()).toEqual([
      "bark",
      "brick",
      "facade",
      "grass",
      "road",
    ]);
  });
});

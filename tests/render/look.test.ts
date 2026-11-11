import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { LOOK } from "../../src/config";
import { loadLook, setBoxUvMeters, setPlaneUvMeters } from "../../src/render/look";

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

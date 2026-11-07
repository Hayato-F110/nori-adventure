import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { ASSET } from "../../src/config/index.ts";
import { carViewFromModel, loadCarView } from "../../src/render/carModel.ts";

// docs/game-rules.md「読み込めなかったとき：今の試作の車（箱の形）で続ける」。
const modelWith = (names: readonly string[]): THREE.Group => {
  const g = new THREE.Group();
  for (const name of names) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.84, 0.84));
    m.name = name;
    g.add(m);
  }
  return g;
};

describe("carViewFromModel", () => {
  it("決まった名前がそろっていれば、車として使う", () => {
    const view = carViewFromModel(modelWith(ASSET.carNodes));
    expect(view).not.toBeNull();
  });

  it("名前が1つでも足りなければ null（箱の車で続ける）", () => {
    expect(carViewFromModel(modelWith(ASSET.carNodes.slice(1)))).toBeNull();
  });

  it("走ると全部のタイヤが回り、ハンドルで前輪だけが切れる", () => {
    const model = modelWith(ASSET.carNodes);
    const view = carViewFromModel(model);
    view?.update(1, 1);
    const wheel = (n: string) => model.getObjectByName(n) as THREE.Object3D;
    for (const n of ["wheel_FL", "wheel_FR", "wheel_RL", "wheel_RR"]) expect(wheel(n).rotation.x).not.toBe(0);
    expect(wheel("wheel_FL").rotation.y).not.toBe(0);
    expect(wheel("wheel_RL").rotation.y).toBe(0);
  });
});

describe("loadCarView", () => {
  it("manifest に car がなければ、GLB を読みに行かない（404 をコンソールに出さない）", async () => {
    let loaded = 0;
    const view = await loadCarView({
      base: "/",
      fetchManifest: () => Promise.resolve({ models: [] }),
      loadModel: () => {
        loaded++;
        return Promise.resolve(modelWith(ASSET.carNodes));
      },
    });
    expect(view).toBeNull();
    expect(loaded).toBe(0);
  });

  it("読み込みに失敗しても例外を出さず null（箱の車で続ける）", async () => {
    const view = await loadCarView({
      base: "/",
      fetchManifest: () => Promise.resolve({ models: [{ name: "car", file: "car.glb" }] }),
      loadModel: () => Promise.reject(new Error("壊れたファイル")),
    });
    expect(view).toBeNull();
  });

  it("manifest に car があれば、同じオリジンの models/car.glb を読む", async () => {
    const urls: string[] = [];
    const view = await loadCarView({
      base: "/nori-adventure/",
      fetchManifest: () => Promise.resolve({ models: [{ name: "car", file: "car.glb" }] }),
      loadModel: (url) => {
        urls.push(url);
        return Promise.resolve(modelWith(ASSET.carNodes));
      },
    });
    expect(view).not.toBeNull();
    expect(urls).toEqual(["/nori-adventure/models/car.glb"]);
  });
});

describe("前輪の切れる角度（ASSET.maxWheelSteer）", () => {
  it("ハンドルいっぱいで、前輪は ASSET.maxWheelSteer だけ切れる", () => {
    const model = modelWith(ASSET.carNodes);
    carViewFromModel(model)?.update(0, 1);
    expect(Math.abs((model.getObjectByName("wheel_FL") as THREE.Object3D).rotation.y)).toBeCloseTo(
      ASSET.maxWheelSteer,
      9,
    );
  });
});

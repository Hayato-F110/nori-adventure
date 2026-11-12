import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { ASSET, STAGE4 } from "../../src/config";
import { createStage4Game } from "../../src/core/stage4";
import { createStage4View } from "../../src/render/stage4View";

// docs/game-rules.md「ステージ4」「海の生きもののモデル」（NORI-28）
// テストの一覧：
//  1. 最初は簡単な形の生きもの6匹（名前は kind）
//  2. 自作モデル（sea-*）が読めたら、生きものを差し替える。位置・見つけた印（星）はそのまま
//  3. 読めないモデル・部品 body がないモデルは、その種類だけ簡単な形のまま
//  4. 群れの魚（sea-fish）が読めたら、群れごとに1つの InstancedMesh のまま差し替える。群れごとに色を変える
//  5. たからばこは光に左右されない色（明るさの比 3 以上を保つ）。霧は残す

const game = createStage4Game();
const newView = () => createStage4View(game.hints, game.treasure);

/** Blender の書き出しと同じ形：ルートの下に body、body の下に素材ごとの部品 */
const fakeSeaModel = (parts = 3, withBody = true): THREE.Object3D => {
  const scene = new THREE.Group();
  const body = new THREE.Group();
  body.name = withBody ? "body" : "other";
  body.position.set(0, 0.5, 0);
  for (let i = 0; i < parts; i++) {
    const m = new THREE.Mesh(
      new THREE.BoxGeometry(0.3, 0.3, 0.8),
      new THREE.MeshStandardMaterial({ color: 0x808080, name: `part${i}` }),
    );
    body.add(m);
  }
  scene.add(body);
  return scene;
};

const allModels = () => new Map(ASSET.sea.variants.map((name) => [name, fakeSeaModel()]));
const creatureNodes = (root: THREE.Object3D) =>
  STAGE4.creatures.map((c) => root.getObjectByName(c.kind) as THREE.Object3D);
const schools = (root: THREE.Object3D) =>
  root.children.filter(
    (c): c is THREE.InstancedMesh => c instanceof THREE.InstancedMesh && c.name === "school",
  );

describe("ステージ4の生きもの（簡単な形 → 自作モデル）", () => {
  it("1. 最初は簡単な形の生きもの6匹", () => {
    const view = newView();
    expect(view.seaModels).toBe(0);
    const nodes = creatureNodes(view.root);
    expect(nodes.every((n) => n !== undefined)).toBe(true);
    expect(nodes.some((n) => n.getObjectByName("body") !== undefined)).toBe(false);
  });

  it("2. 自作モデルが読めたら差し替える。位置と星はそのまま", () => {
    const view = newView();
    const state = { ...game.initial(), found: STAGE4.creatures.map((_, i) => i === 2) };
    view.update(state, 0, false);
    const before = STAGE4.creatures.map((_, i) => view.creatureAt(i));

    expect(view.useSeaModels(allModels())).toBe(7);
    expect(view.seaModels).toBe(7);
    view.update(state, 0, false);

    const nodes = creatureNodes(view.root);
    nodes.forEach((n, i) => {
      expect(n.getObjectByName("body"), STAGE4.creatures[i]?.kind).toBeDefined();
      expect(view.creatureAt(i)).toEqual(before[i]);
    });
    const stars = nodes.map((n) => n.getObjectByName("star"));
    expect(stars.map((s) => s?.visible)).toEqual(STAGE4.creatures.map((_, i) => i === 2));
  });

  it("3. 読めないモデル・body のないモデルは、その種類だけ簡単な形のまま", () => {
    const view = newView();
    const models = allModels();
    models.delete("sea-turtle");
    models.set("sea-ray", fakeSeaModel(3, false));
    expect(view.useSeaModels(models)).toBe(5); // 生きもの4種類＋群れの魚
    const byKind = (k: string) => view.root.getObjectByName(k);
    expect(byKind("turtle")?.getObjectByName("body")).toBeUndefined();
    expect(byKind("ray")?.getObjectByName("body")).toBeUndefined();
    expect(byKind("jellyfish")?.getObjectByName("body")).toBeDefined();
  });

  it("4. 群れの魚は、群れごとに1つの InstancedMesh のまま。群れごとに色が違う", () => {
    const view = newView();
    const before = schools(view.root);
    expect(before).toHaveLength(STAGE4.schoolCount);

    view.useSeaModels(new Map([["sea-fish", fakeSeaModel(3)]]));
    const after = schools(view.root);
    expect(after).toHaveLength(STAGE4.schoolCount);
    for (const s of after) {
      expect(s.count).toBe(STAGE4.schoolSize);
      expect(Array.isArray(s.material)).toBe(true);
      expect(s.geometry.groups).toHaveLength(3);
    }
    const colors = after.map((s) =>
      ((s.material as THREE.MeshStandardMaterial[])[0] as THREE.MeshStandardMaterial).color.getHex(),
    );
    expect(new Set(colors).size).toBe(Math.min(STAGE4.schoolCount, 5));
    // 前の簡単な形は消える（二重に描かない）
    for (const s of before) expect(s.parent).toBeNull();
  });

  it("5. たからばこは光に左右されない色（MeshBasic・トーンマップなし）。霧は残す", () => {
    const view = newView();
    const chest = view.root.getObjectByName("treasure");
    expect(chest).toBeDefined();
    const mats: THREE.Material[] = [];
    chest?.traverse((o) => {
      if (o instanceof THREE.Mesh && o.name === "gold") mats.push(o.material as THREE.Material);
    });
    expect(mats.length).toBeGreaterThanOrEqual(2); // 箱とふた
    for (const m of mats) {
      expect(m).toBeInstanceOf(THREE.MeshBasicMaterial);
      expect(m.toneMapped).toBe(false);
      // 金色（赤が 1）を treasureGlow 倍に明るく
      expect((m as THREE.MeshBasicMaterial).color.r).toBeCloseTo(STAGE4.treasureGlow, 5);
      // 霧は残す（遠くから見えると、手がかりのあわの意味がなくなる）
      expect((m as THREE.MeshBasicMaterial).fog).toBe(true);
    }
  });
});

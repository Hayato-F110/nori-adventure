import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { STAGE3 } from "../../src/config";
import { createStage3Game } from "../../src/core/stage3";
import { birdPose, driftBalloonPosition, otherPlanePose } from "../../src/core/stage3Scenery";
import { createStage3View } from "../../src/render/stage3View";

// docs/game-rules.md「ステージ3：空をにぎやかに」（NORI-60）。テストの一覧の 6（描画）
const game = createStage3Game();
const newView = () => createStage3View(game.rings, game.goal);

/** 自作の plane.glb と同じ材質の名前を持つ形 */
const fakePlane = () => {
  const root = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), [
    Object.assign(new THREE.MeshStandardMaterial({ color: 0xff2618 }), { name: "plane_body" }),
    Object.assign(new THREE.MeshStandardMaterial({ color: 0xffa50d }), { name: "plane_wing" }),
    Object.assign(new THREE.MeshStandardMaterial({ color: 0x29c4ff }), { name: "veh_glass" }),
  ]);
  body.name = "body";
  root.add(body);
  return { root, body };
};

describe("6. 描画", () => {
  it("ほかの飛行機3機・ただよう気球4つ・鳥24羽（左右の羽の InstancedMesh 2つ）・木 60 本", () => {
    const view = newView();
    expect(view.scenery.planes.children).toHaveLength(STAGE3.otherPlanes.length);
    expect(view.scenery.balloons.children).toHaveLength(STAGE3.driftBalloons.length);
    expect(view.scenery.birds).toHaveLength(2);
    for (const m of view.scenery.birds) {
      expect(m.count).toBe(STAGE3.birdFlocks.length * STAGE3.birdsPerFlock);
    }
    const treeCount = view.trees.root.children
      .filter((o): o is THREE.InstancedMesh => o instanceof THREE.InstancedMesh && o.name.startsWith("trunk"))
      .reduce((n, m) => n + m.count, 0);
    expect(treeCount).toBe(STAGE3.mountains.length * STAGE3.treesPerMountain);
  });

  it("update の時刻どおりに置く（小数の時刻も。省くと state.tick）", () => {
    const view = newView();
    const state = { ...game.initial(), tick: 900 };
    for (const tick of [900, 1234.5]) {
      view.update(state, tick);
      STAGE3.otherPlanes.forEach((_, i) => {
        const p = otherPlanePose(i, tick);
        const holder = view.scenery.planes.children[i];
        expect(holder?.position.x).toBeCloseTo(p.x, 6);
        expect(holder?.position.z).toBeCloseTo(p.z, 6);
        expect(holder?.rotation.y).toBeCloseTo(p.heading, 6);
      });
      STAGE3.driftBalloons.forEach((_, i) => {
        expect(view.scenery.balloons.children[i]?.position.y).toBeCloseTo(driftBalloonPosition(i, tick).y, 6);
      });
      const m = new THREE.Matrix4();
      const pos = new THREE.Vector3();
      const k = STAGE3.birdsPerFlock + 2; // 群れ 1 の 2 番目
      view.scenery.birds[0]?.getMatrixAt(k, m);
      pos.setFromMatrixPosition(m);
      const b = birdPose(1, 2, tick);
      expect(pos.x).toBeCloseTo(b.x, 5);
      expect(pos.y).toBeCloseTo(b.y, 5);
      expect(pos.z).toBeCloseTo(b.z, 5);
    }
    view.update(state);
    expect(view.scenery.planes.children[0]?.position.x).toBeCloseTo(otherPlanePose(0, 900).x, 6);
  });

  it("羽ばたき：左右の羽は、どちらも同じだけ上がる（左右対称）", () => {
    const view = newView();
    const state = game.initial();
    // 羽が上がっている時刻を探す
    const tick = [0, 3, 5, 7, 9].find((t) => birdPose(0, 0, t).flap > 0.2) ?? 5;
    view.update(state, tick);
    const tip = (mesh: THREE.InstancedMesh, side: number) => {
      const m = new THREE.Matrix4();
      mesh.getMatrixAt(0, m);
      return new THREE.Vector3(side * STAGE3.birdWingSpan, 0, 0.08).applyMatrix4(m);
    };
    const [left, right] = view.scenery.birds;
    if (left === undefined || right === undefined) throw new Error("羽がない");
    const b = birdPose(0, 0, tick);
    expect(tip(left, -1).y - b.y).toBeGreaterThan(0.1);
    expect(tip(left, -1).y).toBeCloseTo(tip(right, 1).y, 6);
  });

  it("plane.glb が読めたら、3機とも同じ形の色違い。機体の色（plane_body・plane_wing）だけ変え、元の材質は変えない", () => {
    const view = newView();
    const { root, body } = fakePlane();
    view.usePlaneModel(root);
    const original = body.material as THREE.MeshStandardMaterial[];
    expect(original[0]?.color.getHex()).toBe(0xff2618);
    STAGE3.otherPlanes.forEach((p, i) => {
      const mesh = view.scenery.planes.children[i]?.getObjectByName("body") as THREE.Mesh;
      const mats = mesh.material as THREE.MeshStandardMaterial[];
      const want = new THREE.Color(p.color).getHex();
      expect(mats[0]?.color.getHex()).toBe(want);
      expect(mats[1]?.color.getHex()).toBe(want);
      expect(mats[2]).toBe(original[2]); // 窓などはそのまま
    });
    // 自分の飛行機（元の形）はそのまま
    expect(root.parent).toBeNull();
  });
});

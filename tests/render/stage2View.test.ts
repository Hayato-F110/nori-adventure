import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { STAGE2 } from "../../src/config";
import { createStage2Game } from "../../src/core/stage2";
import { offsetOnTrack, passingTrainDistance } from "../../src/core/stage2Layout";
import { createStage2View, RAIL_TOP } from "../../src/render/stage2View";

// docs/game-rules.md「景色と列車を増やす」（NORI-59）。テストの一覧の 2・3（描画）
const game = createStage2Game();
const newView = () => createStage2View(game.track, game.stations);

describe("ステージ2の景色（NORI-59）", () => {
  it("すれ違う電車は、時刻どおりに線路の左 STAGE2.passingOffset を逆向きに置く", () => {
    const view = newView();
    const state = game.initial();
    for (const tick of [0, 1234.5]) {
      view.update(state, 0, true, tick);
      const s = passingTrainDistance(game.track.length, tick);
      const want = offsetOnTrack(game.track, s, -STAGE2.passingOffset);
      expect(view.passing.position.x).toBeCloseTo(want.x, 6);
      expect(view.passing.position.z).toBeCloseTo(want.z, 6);
      expect(view.passing.position.y).toBeCloseTo(want.y + RAIL_TOP, 6);
      const back = game.track.headingAt(s) + Math.PI;
      expect(Math.cos(view.passing.rotation.y - back)).toBeCloseTo(1, 6);
    }
  });

  it("ふつうの電車の形を渡すと、帯と車体の色だけ変え、元の材質は変えない", () => {
    const view = newView();
    const stripe = Object.assign(new THREE.MeshStandardMaterial({ color: 0xff6f59 }), {
      name: "commuter_stripe",
    });
    const glass = Object.assign(new THREE.MeshStandardMaterial({ color: 0x6fc8ff }), { name: "veh_glass" });
    const model = new THREE.Group();
    model.add(new THREE.Mesh(new THREE.BoxGeometry(), [stripe, glass]));
    view.usePassingModel(model);
    const mesh = view.passing.children[0]?.children[0] as THREE.Mesh;
    const mats = mesh.material as THREE.MeshStandardMaterial[];
    expect(mats[0]?.color.getHex()).not.toBe(0xff6f59);
    expect(mats[1]).toBe(glass);
    expect(stripe.color.getHex()).toBe(0xff6f59);
  });

  it("富士山風の山は霧を効かせず、北へ遠く。海辺・砂浜・雲がある", () => {
    const view = newView();
    const big = view.root.getObjectByName("big-mountain") as THREE.Mesh;
    expect((big.material as THREE.MeshBasicMaterial).fog).toBe(false);
    expect(Math.hypot(big.position.x, big.position.z)).toBeGreaterThan(330); // 霧の遠い端より遠い
    expect(view.root.getObjectByName("sea")).toBeDefined();
    expect(view.root.getObjectByName("beach")?.position.z).toBeGreaterThan(STAGE2.seaFromZ);
    expect(view.root.getObjectByName("clouds")?.children).toHaveLength(STAGE2.cloudCount);
  });
});

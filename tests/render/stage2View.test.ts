import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { STAGE2 } from "../../src/config";
import { createStage2Game } from "../../src/core/stage2";
import { offsetOnTrack, passingTrainDistance } from "../../src/core/stage2Layout";
import { createStage2View, RAIL_TOP } from "../../src/render/stage2View";

// docs/game-rules.md「景色と列車を増やす」（NORI-59）。テストの一覧の 2・3（描画）
const game = createStage2Game();
const newView = () => createStage2View(game.track, game.stations);

// NORI-74 の一覧 2：「線路の左」を、実装（rightOf・offsetOnTrack）と別の式で確かめる。
// 進む向き f は線路の点の差、左は「上 × f」＝ (f.z, 0, −f.x)。今のテスト（下）は期待値も offsetOnTrack で作るので、
// 左右の約束が両方そろって逆になっても通ってしまう（初見レビュー 74-1・R2-74-1）
describe("すれ違う電車は進む向きの左（NORI-74）", () => {
  it("1周を 4 m おきに、すれ違う電車が進む向きの左へ STAGE2.passingOffset 離れている（許す差 1e-6。計算は一覧の計算の節）", () => {
    const view = newView();
    const state = game.initial();
    const track = game.track;
    const ticksPer4m = 4 / (STAGE2.passingSpeed / 60);
    const lap = Math.ceil(track.length / 4);
    for (let i = 0; i < lap; i++) {
      const tick = i * ticksPer4m;
      view.update(state, 0, true, tick);
      const s = passingTrainDistance(track.length, tick);
      const back = track.pointAt(s - 0.01 < 0 ? s - 0.01 + track.length : s - 0.01);
      const ahead = track.pointAt(s + 0.01 >= track.length ? s + 0.01 - track.length : s + 0.01);
      const fx = ahead.x - back.x;
      const fz = ahead.z - back.z;
      const n = Math.hypot(fx, fz);
      const left = { x: fz / n, z: -fx / n };
      const p = track.pointAt(s);
      const dot = (view.passing.position.x - p.x) * left.x + (view.passing.position.z - p.z) * left.z;
      expect(Math.abs(dot - STAGE2.passingOffset), `s = ${s.toFixed(1)} m`).toBeLessThan(1e-6);
    }
  });
});

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

  it("Blender の山・駅を渡すと差しかえる。山は大きさを合わせ、高い山は雪の c。2回呼んでも重ねない", () => {
    const view = newView();
    const mountain = (tag: string) => {
      const g = new THREE.Group();
      g.name = tag;
      g.add(new THREE.Mesh(new THREE.ConeGeometry(1, 1, 8).translate(0, 0.5, 0)));
      return g;
    };
    const station = new THREE.Group();
    station.name = "station-model";
    const before = view.root.children.length;
    const models = { mountains: [mountain("a"), mountain("b"), mountain("c")], station };
    view.useLandmarks(models);
    view.useLandmarks(models);
    expect(view.landmarks.mountains).toBeGreaterThan(10);
    expect(view.landmarks.stations).toBe(STAGE2.stations.length);
    const placed = view.root.children.filter((o) => ["a", "b", "c"].includes(o.name));
    expect(placed).toHaveLength(view.landmarks.mountains);
    for (const m of placed) {
      expect(m.name === "c").toBe(m.scale.y > 60);
      expect(m.position.y).toBe(0);
    }
    // 円すい（と雪）を外して、山を足した
    expect(view.root.children.length).toBeLessThanOrEqual(before);
    let stationModels = 0;
    view.root.traverse((o) => {
      if (o.name === "station-model") stationModels++;
    });
    expect(stationModels).toBe(STAGE2.stations.length);
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

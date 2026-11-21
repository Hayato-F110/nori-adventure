import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { BOSS, CAMERA, STAGE5 } from "../../src/config";
import { bossPosition, createStage5Game, guideTarget } from "../../src/core/stage5";
import { bossColor } from "../../src/render/bossLook";
import { createStage5View } from "../../src/render/stage5View";
import { expectArrowPose, expectUnlit } from "./guideArrowCheck";

// NORI-65.md 一覧 5（/code-review の指摘 3）：自作モデルが読めないときの簡単な形も、
// 自作モデルと同じ関数（applyBossLook）で、届けた回数から色を当てる

const hexOf = (css: string) => new THREE.Color(css).getHexString();

/** 今の色が angry の色の、MeshStandardMaterial を全部集める */
const materialsColored = (root: THREE.Object3D, css: string) => {
  const found = new Set<THREE.MeshStandardMaterial>();
  root.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
      if (m instanceof THREE.MeshStandardMaterial && m.color.getHexString() === hexOf(css)) found.add(m);
    }
  });
  return [...found];
};

describe("ステージ5の描画：簡単な形のボス（NORI-65 一覧 5）", () => {
  it("自作モデルがないまま、届けた回数が calmPoints になると、簡単な形の体が calmColor になる", () => {
    const view = createStage5View();
    expect(view.bossModel).toBe("box");
    const bodyMaterials = materialsColored(view.root, BOSS.angryColor);
    expect(bodyMaterials.length).toBeGreaterThan(0);

    const state = { ...createStage5Game().initial(), calm: BOSS.calmPoints };
    view.update(state, 0, true);

    expect(bodyMaterials.map((m) => m.color.getHexString())).toContain(hexOf(bossColor(BOSS.calmPoints)));
    expect(view.mouth).toBe("smile");
  });
});

// NORI-33（docs/test-plans/NORI-33.md の 15）：行き先の矢印と届ける輪（K33-11）
describe("NORI-33：行き先の矢印と届ける輪", () => {
  const game = createStage5Game();
  const colorsOf = (o: THREE.Object3D) => {
    const colors: string[] = [];
    o.traverse((c) => {
      const m = (c as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
      if (m?.color !== undefined) colors.push(m.color.getHexString());
    });
    return colors;
  };
  /** ローバーの後ろ followDistance・上 height（追うカメラの置き方） */
  const behind = (r: { x: number; y: number; z: number; heading: number }) => ({
    x: r.x + Math.sin(r.heading) * CAMERA.followDistance,
    y: r.y + CAMERA.height,
    z: r.z + Math.cos(r.heading) * CAMERA.followDistance,
  });
  const s0 = game.initial();
  // ローバーの向き 1.0・跳んで高さ 2 m（矢印は向きを受け継がず、高さはローバーと一緒に上がる。R3-33-D・H）
  const jumping = { ...s0, tick: 300, rover: { ...s0.rover, x: 3, z: -20, heading: 1.0, y: 2 } };
  // 持っている場合は点 (3, −20) に置く（スタートからは、いちばん近い星とボスの向きが 3.3° しか違わず、区別できない。R4-33-B）
  const atPoint = { ...s0, tick: 300, rover: { ...s0.rover, x: 3, z: -20 } };
  const carrying = { ...atPoint, carrying: true };
  const cases = [
    ["星を持っていない・後ろのカメラ", { ...s0, tick: 300 }, behind(s0.rover)],
    ["星を持っている・点 (3, −20)・後ろのカメラ", carrying, behind(carrying.rover)],
    ["跳んでいる・向き 1.0・後ろのカメラ", jumping, behind(jumping.rover)],
    ["跳んでいる・向き 1.0・横のカメラ", jumping, { x: 3 + 9, y: 2 + 4.5, z: -20 }],
  ] as const;

  for (const [label, s, camera] of cases) {
    it(`${label}：矢印はローバーの上 guideArrowHeight で、ピンクで、guideTarget の向きを指し、面がカメラを向く`, () => {
      const view = createStage5View();
      view.update(s, 0, true, camera);
      view.root.updateMatrixWorld(true);
      const arrow = view.root.getObjectByName("guide-arrow");
      if (arrow === undefined) throw new Error("guide-arrow がない");
      expect(arrow.visible).toBe(true);
      const p = arrow.getWorldPosition(new THREE.Vector3());
      expect(p.x).toBeCloseTo(s.rover.x, 2);
      expect(p.y).toBeCloseTo(s.rover.y + STAGE5.guideArrowHeight, 2);
      expect(p.z).toBeCloseTo(s.rover.z, 2);
      const g = guideTarget(s);
      if (g === null) throw new Error("行き先がない");
      expectArrowPose(arrow, { x: g.x - s.rover.x, z: g.z - s.rover.z }, camera);
      expect(colorsOf(arrow)).toContain(hexOf(STAGE5.friendStarColor));
      expectUnlit(arrow);
    });
  }

  it("点 (3, −20) では、持っている（ボス）と持っていない（星）で、矢印の先の水平の向きが内積 0.99 未満で違う（R4-33-B）", () => {
    const dirOf = (s: typeof atPoint) => {
      const view = createStage5View();
      view.update(s, 0, true, behind(s.rover));
      view.root.updateMatrixWorld(true);
      const arrow = view.root.getObjectByName("guide-arrow");
      if (arrow === undefined) throw new Error("guide-arrow がない");
      return arrow.getWorldDirection(new THREE.Vector3()).negate().setY(0).normalize();
    };
    expect(dirOf(carrying).dot(dirOf(atPoint))).toBeLessThan(0.99);
  });

  it("揺らさない：動きを減らさない設定で、秒が変わっても高さは同じ（R3-33-F）", () => {
    const view = createStage5View();
    const s = { ...s0, tick: 300 };
    const y = (seconds: number) => {
      view.update(s, seconds, false, behind(s.rover));
      view.root.updateMatrixWorld(true);
      return view.root.getObjectByName("guide-arrow")?.getWorldPosition(new THREE.Vector3()).y ?? NaN;
    };
    expect(y(1.3)).toBeCloseTo(y(0), 6);
  });

  it("届ける輪は、持っている間だけ、その刻みのボスの位置（2 つの刻み）の地面のすぐ上に、半径 deliverRadius ± 幅の半分で、ピンク", () => {
    const view = createStage5View();
    const s = { ...s0, tick: 300 };
    view.update(s, 0, true, behind(s.rover));
    const ring = view.root.getObjectByName("deliver-ring") as THREE.Mesh | undefined;
    if (ring === undefined) throw new Error("deliver-ring がない");
    expect(ring.visible).toBe(false);
    for (const tick of [300, 900]) {
      view.update({ ...s, tick, carrying: true }, 0, true, behind(s.rover));
      view.root.updateMatrixWorld(true);
      expect(ring.visible).toBe(true);
      const b = bossPosition(tick);
      const p = ring.getWorldPosition(new THREE.Vector3());
      expect(p.x).toBeCloseTo(b.x, 2);
      expect(p.z).toBeCloseTo(b.z, 2);
      // 地面（高さ 0）のすぐ上（道と同じく、0.1 m 以内）
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeLessThan(0.1);
      // 地面に寝ている（面の向きが真上）・大きさを変えていない（R4-33-C）
      const normal = new THREE.Vector3(0, 0, 1).applyQuaternion(
        ring.getWorldQuaternion(new THREE.Quaternion()),
      );
      expect(Math.abs(normal.y)).toBeGreaterThan(0.99);
      const scale = ring.getWorldScale(new THREE.Vector3());
      expect([scale.x, scale.y, scale.z].every((v) => Math.abs(v - 1) < 1e-6)).toBe(true);
    }
    // 持っていない状態に戻すと、同じ描画で輪は消える（R4-33-D）
    view.update({ ...s, tick: 900 }, 0, true, behind(s.rover));
    expect(ring.visible).toBe(false);
    expect(bossPosition(900).x).not.toBeCloseTo(bossPosition(300).x, 0);
    const geo = ring.geometry as THREE.RingGeometry;
    expect(geo.parameters.innerRadius).toBeCloseTo(BOSS.deliverRadius - STAGE5.deliverRingWidth / 2, 2);
    expect(geo.parameters.outerRadius).toBeCloseTo(BOSS.deliverRadius + STAGE5.deliverRingWidth / 2, 2);
    expect(colorsOf(ring)).toContain(hexOf(STAGE5.friendStarColor));
  });

  it("クリアの前は矢印も輪も見えていて、同じ描画でクリアのあとは見えなくなる（R4-33-D）", () => {
    const view = createStage5View();
    view.update({ ...s0, tick: 300, carrying: true }, 0, true, behind(s0.rover));
    expect(view.root.getObjectByName("guide-arrow")?.visible).toBe(true);
    expect(view.root.getObjectByName("deliver-ring")?.visible).toBe(true);
    view.update({ ...s0, tick: 300, carrying: true, finishTick: 299 }, 0, true, behind(s0.rover));
    expect(view.root.getObjectByName("guide-arrow")?.visible).toBe(false);
    expect(view.root.getObjectByName("deliver-ring")?.visible).toBe(false);
  });
});

import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { BOSS } from "../../src/config";
import { createStage5Game } from "../../src/core/stage5";
import { bossColor } from "../../src/render/bossLook";
import { createStage5View } from "../../src/render/stage5View";

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

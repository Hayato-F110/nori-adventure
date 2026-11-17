import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { LOOK, STAGE1 } from "../../src/config";
import { createCourseView } from "../../src/render/courseView";

// NORI-77：ほしの自ら光る強さ（docs/game-rules.md「見た目の細かい値」の LOOK.starEmissiveIntensity）。
// 回るほしの太陽から外れた面でも、高画質で道との比 3 以上にするため（計算は docs/test-plans/NORI-77.md「## 計算」）
describe("ステージ1のほしの見た目", () => {
  const view = createCourseView(
    [
      { x: 0, z: -3 },
      { x: 0, z: -21 },
    ],
    {
      route: STAGE1.route,
      roadWidth: 8,
      starHeight: 1,
      guideArrowHeight: 3,
      checkpointCount: 3,
    },
  );
  const stars = view.root.children.filter(
    (o): o is THREE.Mesh => o instanceof THREE.Mesh && o.geometry instanceof THREE.ExtrudeGeometry,
  );

  it("ほしは 2 個で、どれも自ら光る色と強さが設定の値", () => {
    expect(stars).toHaveLength(2);
    for (const s of stars) {
      const m = s.material as THREE.MeshStandardMaterial;
      expect(`#${m.emissive.getHexString(THREE.LinearSRGBColorSpace)}`).not.toBe("#000000");
      expect(m.emissive.equals(new THREE.Color(LOOK.starEmissive))).toBe(true);
      expect(m.emissiveIntensity).toBe(LOOK.starEmissiveIntensity);
    }
  });
});

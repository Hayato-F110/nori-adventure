import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { ASSET, STAGE4 } from "../../src/config";
import { createStage4Game, treasureGuide } from "../../src/core/stage4";
import { createStage4View } from "../../src/render/stage4View";
import { expectArrowPose, expectUnlit } from "./guideArrowCheck";

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

  // NORI-62：まだ見つけていない生きもののまわりの「きらきら」（docs/game-rules.md「ステージ4」）
  it("6. きらきらは光に左右されない色で、生きもの × sparkleCount 個を1回で描く。見つけたら消える", () => {
    const view = newView();
    const sp = view.root.getObjectByName("sparkles") as THREE.InstancedMesh;
    expect(sp).toBeInstanceOf(THREE.InstancedMesh);
    expect(sp.count).toBe(STAGE4.creatures.length * STAGE4.sparkleCount);
    const mat = sp.material as THREE.MeshBasicMaterial;
    expect(mat).toBeInstanceOf(THREE.MeshBasicMaterial);
    expect(mat.toneMapped).toBe(false);
    // 色は sparkleColor の sparkleGlow 倍（霧の中でも白く残る）
    expect(mat.color.r).toBeCloseTo(new THREE.Color(STAGE4.sparkleColor).r * STAGE4.sparkleGlow, 5);

    const found = STAGE4.creatures.map((_, i) => i === 1);
    view.update({ ...game.initial(), found }, 0, false);
    expect(view.sparkleAt(1)).toBeNull();
    // 見つけた生きもののきらきらは大きさ 0（消える）、ほかは生きものの端から sparkleGap 外
    // 行列の 3×3 の部分がすべて 0。decompose は行列式 0 のとき大きさ 1 を返すので使わない
    const m = new THREE.Matrix4();
    sp.getMatrixAt(1 * STAGE4.sparkleCount, m);
    expect([0, 1, 2, 4, 5, 6, 8, 9, 10].map((k) => m.elements[k])).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0]);
    const c = view.creatureAt(0);
    const at = view.sparkleAt(0);
    const size = ASSET.sea.sizes["sea-turtle"];
    expect(at).not.toBeNull();
    expect(Math.hypot((at?.x ?? 0) - c.x, (at?.z ?? 0) - c.z)).toBeCloseTo(
      Math.max(size.width, size.length) / 2 + STAGE4.sparkleGap,
      5,
    );
  });

  it("7. 生きものは自分の色の creatureGlow 倍だけ自ら光る（モデルの色は変えない）", () => {
    const view = newView();
    view.useSeaModels(allModels());
    const body = view.root.getObjectByName("turtle")?.getObjectByName("body");
    const mesh = body?.children[0] as THREE.Mesh;
    const mat = mesh.material as THREE.MeshStandardMaterial;
    expect(mat.color.getHex()).toBe(0x808080);
    expect(mat.emissive.r).toBeCloseTo(mat.color.r * STAGE4.creatureGlow, 5);
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

// NORI-33（docs/test-plans/NORI-33.md の 5・7）
describe("NORI-33：あわと見つけた印", () => {
  const materialsOf = (o: THREE.Object3D) => {
    const m = (o as THREE.Mesh).material;
    return m === undefined ? [] : Array.isArray(m) ? m : [m];
  };
  const isBubbles = (o: THREE.Object3D) =>
    o instanceof THREE.InstancedMesh &&
    materialsOf(o).some(
      (m) => m instanceof THREE.MeshBasicMaterial && m.color.getHexString() === STAGE4.bubbleColor.slice(1),
    );

  it("5. あわの半径は STAGE4.bubbleRadius で、霧の効果を受けない。ほかの素材は霧を受ける", () => {
    const view = newView();
    const bubbles = view.root.children.filter(isBubbles) as THREE.InstancedMesh[];
    expect(bubbles).toHaveLength(1);
    const geo = bubbles[0]?.geometry as THREE.SphereGeometry;
    expect(geo.parameters.radius).toBeCloseTo(STAGE4.bubbleRadius, 9);
    expect(
      materialsOf(bubbles[0] as THREE.Object3D).every((m) => (m as { fog?: boolean }).fog === false),
    ).toBe(true);
    const others: THREE.Material[] = [];
    view.root.traverse((o) => {
      if (!isBubbles(o)) others.push(...materialsOf(o));
    });
    expect(others.length).toBeGreaterThan(0);
    expect(others.filter((m) => (m as { fog?: boolean }).fog === false)).toEqual([]);
  });

  it("7. 見つけた印は八面体でなく、正面から見て角が 5 つの星。中心から角の先まで STAGE4.foundStarSize", () => {
    const view = newView();
    const star = creatureNodes(view.root)[0]?.getObjectByName("star") as THREE.Mesh;
    expect(star.geometry).not.toBeInstanceOf(THREE.OctahedronGeometry);
    // 星の中心は形の原点（5 つの角の星は上下が非対称なので、外枠の真ん中ではない）。面は XY
    const center = new THREE.Vector3();
    const pos = star.geometry.getAttribute("position");
    const points = Array.from({ length: pos.count }, (_, i) => ({
      r: Math.hypot(pos.getX(i) - center.x, pos.getY(i) - center.y),
      a: Math.atan2(pos.getY(i) - center.y, pos.getX(i) - center.x),
    }));
    const max = Math.max(...points.map((p) => p.r));
    expect(max).toBeCloseTo(STAGE4.foundStarSize, 2);
    const tips = new Set(points.filter((p) => p.r > max * 0.95).map((p) => Math.round(p.a * 100)));
    expect(tips.size).toBe(5);
  });

  it("7. 見つけた印の星は、生きものが回っていても、カメラの方を向く", () => {
    const view = newView();
    const found = { ...game.initial(), found: STAGE4.creatures.map(() => true) };
    const camera = { x: 5, y: -3, z: 120 };
    for (const tick of [0, 300, 900]) {
      view.update({ ...found, tick }, 20, true, camera);
      view.root.updateMatrixWorld(true);
      for (const node of creatureNodes(view.root)) {
        const star = node.getObjectByName("star") as THREE.Mesh;
        const p = star.getWorldPosition(new THREE.Vector3());
        const toCamera = new THREE.Vector3(camera.x, camera.y, camera.z).sub(p).normalize();
        const facing = star.getWorldDirection(new THREE.Vector3());
        expect(facing.dot(toCamera), `${node.name}・刻み ${tick}`).toBeGreaterThan(0.99);
      }
    }
  });

  it("7. 見つけた印は、見つけた描画の時刻から STAGE4.foundStarGrowSeconds かけて大きくなる", () => {
    const view = newView();
    const g = STAGE4.foundStarGrowSeconds;
    const camera = { x: 0, y: 0, z: 0 };
    const star = () => creatureNodes(view.root)[0]?.getObjectByName("star") as THREE.Mesh;
    const notYet = game.initial();
    const found = { ...notYet, found: STAGE4.creatures.map((_, i) => i === 0) };
    view.update(notYet, 10, false, camera);
    view.update(found, 10, false, camera);
    expect(star().scale.x).toBeCloseTo(0, 6);
    view.update(found, 10 + g / 2, false, camera);
    expect(star().scale.x).toBeGreaterThan(0);
    expect(star().scale.x).toBeLessThan(1);
    view.update(found, 10 + g, false, camera);
    expect(star().scale.x).toBeCloseTo(1, 6);
  });
});

// NORI-33（docs/test-plans/NORI-33.md の 13）：たからばこの矢印の見た目（K33-12）
describe("NORI-33：たからばこの矢印", () => {
  const t = game.treasure;
  const s0 = game.initial();
  /** 潜水艇の後ろ cameraDistance・上 cameraHeight（stage4Main.ts の placeCamera と同じ置き方） */
  const behind = (sub: { x: number; y: number; z: number; heading: number }) => ({
    x: sub.x + Math.sin(sub.heading) * STAGE4.cameraDistance,
    y: sub.y + STAGE4.cameraHeight,
    z: sub.z + Math.cos(sub.heading) * STAGE4.cameraDistance,
  });
  // 横にずれた点：たからばこから +X 30 m・+Z 10 m。潜水艇の向き 1.0・傾き 0.3（矢印が乗り物の向き・傾きを受け継がないこと。R3-33-D）
  const turned = { ...s0, sub: { ...s0.sub, x: t.x + 30, z: t.z + 10, heading: 1.0, tilt: 0.3 } };
  const cases = [
    ["スタート・後ろのカメラ", s0, behind(s0.sub)],
    ["横にずれた点・後ろのカメラ", turned, behind(turned.sub)],
    // カメラが矢印の真横（矢印は −X を指し、カメラは +Z 側）：面を回さない作りだと細い線になる向き
    ["横にずれた点・横のカメラ", turned, { x: turned.sub.x, y: turned.sub.y + 2.5, z: turned.sub.z + 8 }],
  ] as const;

  for (const [label, state, camera] of cases) {
    it(`${label}：潜水艇の上 guideArrowHeight にあり、白で、たからばこの向きを指し、面がカメラを向く`, () => {
      const view = newView();
      view.update(state, 0, true, camera);
      view.root.updateMatrixWorld(true);
      const arrow = view.root.getObjectByName("guide-arrow");
      if (arrow === undefined) throw new Error("guide-arrow がない");
      expect(arrow.visible).toBe(true);
      const p = arrow.getWorldPosition(new THREE.Vector3());
      expect(p.x).toBeCloseTo(state.sub.x, 2);
      expect(p.y).toBeCloseTo(state.sub.y + STAGE4.guideArrowHeight, 2);
      expect(p.z).toBeCloseTo(state.sub.z, 2);
      const g = treasureGuide(state);
      if (g === null) throw new Error("向きがない");
      expectArrowPose(arrow, { x: -Math.sin(g.yaw), z: -Math.cos(g.yaw) }, camera);
      const colors: string[] = [];
      arrow.traverse((o) => {
        const m = (o as THREE.Mesh).material as THREE.MeshBasicMaterial | undefined;
        if (m?.color !== undefined) colors.push(m.color.getHexString());
      });
      expect(colors).toContain(new THREE.Color(STAGE4.guideArrowColor).getHexString());
      expectUnlit(arrow);
    });
  }

  it("描いた潜水艇の位置（刻みの間を補間した位置）を渡すと、矢印はその上にある（刻みの状態より遅れない。/code-review の指摘）", () => {
    const view = newView();
    const drawn = { x: s0.sub.x + 0.13, y: s0.sub.y - 0.05, z: s0.sub.z - 0.1 };
    view.update(s0, 0, true, behind(s0.sub), drawn);
    view.root.updateMatrixWorld(true);
    const arrow = view.root.getObjectByName("guide-arrow");
    if (arrow === undefined) throw new Error("guide-arrow がない");
    const p = arrow.getWorldPosition(new THREE.Vector3());
    expect(p.x).toBeCloseTo(drawn.x, 4);
    expect(p.y).toBeCloseTo(drawn.y + STAGE4.guideArrowHeight, 4);
    expect(p.z).toBeCloseTo(drawn.z, 4);
  });

  it("揺らさない：動きを減らさない設定で、秒が変わっても高さは同じ（R3-33-F）", () => {
    const view = newView();
    const arrow = () => view.root.getObjectByName("guide-arrow");
    view.update(s0, 0, false, behind(s0.sub));
    view.root.updateMatrixWorld(true);
    const y0 = arrow()?.getWorldPosition(new THREE.Vector3()).y ?? NaN;
    view.update(s0, 1.3, false, behind(s0.sub));
    view.root.updateMatrixWorld(true);
    expect(arrow()?.getWorldPosition(new THREE.Vector3()).y ?? NaN).toBeCloseTo(y0, 6);
  });

  it("ゴールの前は見えていて、同じ描画でゴールのあとは見えなくなる（R4-33-D）", () => {
    const view = newView();
    view.update(s0, 0, true, behind(s0.sub));
    expect(view.root.getObjectByName("guide-arrow")?.visible).toBe(true);
    view.update({ ...s0, finishTick: 1, tick: 2 }, 0, true, behind(s0.sub));
    expect(view.root.getObjectByName("guide-arrow")?.visible).toBe(false);
  });
});

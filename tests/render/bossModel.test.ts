import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { ASSET, BOSS } from "../../src/config/index.ts";
import { bossColor, bossMouth } from "../../src/render/bossLook.ts";
import { applyBossLook, bossPartsOf, swapBossModel } from "../../src/render/bossModel.ts";

// NORI-65：ボスの自作モデルの部品をそろえ、差しかえ、見た目（色・口・ふくらみ）を当てる。
// docs/game-rules.md「ボスのモデル」「ボスの色」「ボスの口」「ボスの向き」。docs/test-plans/NORI-65.md の一覧 4・5

type ModelOptions = {
  omit?: readonly string[];
  /** 体と腕の素材の名前（既定 boss_body） */
  bodyMaterial?: string;
};

/** 仮のモデル：部品の箱を親子にせず並べる。body・arm_L・arm_R には、名前が同じで別々の素材を付ける（R1-65-7） */
const modelWith = (options: ModelOptions = {}): THREE.Group => {
  const g = new THREE.Group();
  for (const name of ASSET.boss.nodes) {
    if (options.omit?.includes(name)) continue;
    const painted = name === "body" || name.startsWith("arm_");
    const mat = new THREE.MeshStandardMaterial({ color: "#ffffff" });
    mat.name = painted ? (options.bodyMaterial ?? "boss_body") : "boss_face";
    const m = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), mat);
    m.name = name;
    g.add(m);
  }
  return g;
};

const node = (model: THREE.Object3D, name: string) => model.getObjectByName(name) as THREE.Mesh;

describe("bossPartsOf（一覧 4）", () => {
  it("部品 8 つと素材 boss_body がそろえば、部品を返す", () => {
    const parts = bossPartsOf(modelWith());
    expect(parts).not.toBeNull();
    expect(Object.keys(parts?.mouths ?? {}).sort()).toEqual(["flat", "frown", "smile"]);
  });

  it.each(ASSET.boss.nodes)("部品 %s が欠けると null（簡単な形のまま）", (name) => {
    expect(bossPartsOf(modelWith({ omit: [name] }))).toBeNull();
  });

  it("素材 boss_body がないと null", () => {
    expect(bossPartsOf(modelWith({ bodyMaterial: "boss_skin" }))).toBeNull();
  });

  it("名前が boss_body の素材を全部返す（体と腕で別々の物でも、3 つとも）", () => {
    const model = modelWith();
    const parts = bossPartsOf(model);
    const want = ["body", "arm_L", "arm_R"].map((n) => node(model, n).material);
    expect(new Set(parts?.bodyMaterials)).toEqual(new Set(want));
  });
});

describe("swapBossModel（一覧 4。R1-65-10・15）", () => {
  const simpleShape = () => {
    const group = new THREE.Group();
    const simple = [new THREE.Mesh(), new THREE.Mesh()];
    group.add(...simple);
    return { group, simple };
  };

  it("部品があれば、モデルをボスのグループの子として足し、簡単な形を隠す", () => {
    const { group, simple } = simpleShape();
    const model = modelWith();
    expect(swapBossModel(group, simple, model, bossPartsOf(model))).toBe(true);
    expect(model.parent).toBe(group);
    expect(simple.every((m) => !m.visible)).toBe(true);
    // 位置・向き・はねる動きはグループに当てる：グループを動かすと、モデルの世界での位置もいっしょに動く
    group.position.set(5, 0.8, -55);
    group.rotation.y = 1;
    group.updateMatrixWorld(true);
    const at = new THREE.Vector3();
    expect(model.getWorldPosition(at).toArray()).toEqual([5, 0.8, -55]);
  });

  it("部品が null なら何も足さず、簡単な形が見えたまま", () => {
    const { group, simple } = simpleShape();
    const model = modelWith({ omit: ["eye_L"] });
    expect(swapBossModel(group, simple, model, bossPartsOf(model))).toBe(false);
    expect(model.parent).toBeNull();
    expect(group.children).toEqual(simple);
    expect(simple.every((m) => m.visible)).toBe(true);
  });
});

describe("applyBossLook（一覧 5）", () => {
  it.each([0, 1, 2, 3, 4, 5])("届けた回数 %i：boss_body の素材が全部 bossColor の色、見える口は 1 つだけ", (calm) => {
    const model = modelWith();
    const parts = bossPartsOf(model);
    if (!parts) throw new Error("部品がそろわない");
    applyBossLook(parts, calm, 0);
    const want = new THREE.Color(bossColor(calm));
    for (const m of parts.bodyMaterials) expect(m.color.getHex()).toBe(want.getHex());
    const visible = ["mouth_frown", "mouth_flat", "mouth_smile"].filter((n) => node(model, n).visible);
    expect(visible).toEqual([`mouth_${bossMouth(calm)}`]);
    // 目・口の素材は塗らない
    expect(((node(model, "eye_L").material as THREE.MeshStandardMaterial).color.getHex())).toBe(0xffffff);
  });

  it.each([
    [0, 1],
    [0.5, 1 + BOSS.puffScale * 0.5],
    [1, 1 + BOSS.puffScale],
  ])("前ぶれ %s で body の大きさが %s 倍、目・腕・口は 1 のまま", (puff, scale) => {
    const model = modelWith();
    const parts = bossPartsOf(model);
    if (!parts) throw new Error("部品がそろわない");
    applyBossLook(parts, 0, puff);
    expect(node(model, "body").scale.x).toBeCloseTo(scale, 10);
    expect(node(model, "body").scale.y).toBeCloseTo(scale, 10);
    expect(node(model, "body").scale.z).toBeCloseTo(scale, 10);
    for (const n of ASSET.boss.nodes.filter((n) => n !== "body")) {
      expect(node(model, n).scale.toArray()).toEqual([1, 1, 1]);
    }
  });
});

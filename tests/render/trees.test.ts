import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { ASSET } from "../../src/config";
import type { Look } from "../../src/render/look";
import {
  createTreeField,
  loadTreeModels,
  type TreeModel,
  treeModelFrom,
  type TreeSpot,
} from "../../src/render/trees";

// docs/game-rules.md「木（NORI-26）」：まとめて描く・低画質や素材が読めないときは今の簡単な木
// テストの一覧（木）の 3：何本あっても、描く回数は「種類 × 部品」だけ
const spots: TreeSpot[] = Array.from({ length: 150 }, (_, i) => ({ x: i, z: -i, rotation: i, scale: 1 }));

const fakeModel = (): TreeModel => ({
  trunk: new THREE.BoxGeometry(0.5, 2, 0.5),
  leaves: new THREE.SphereGeometry(1.5, 8, 6),
});

const fakeLook = (): Look => ({
  material: () => new THREE.MeshStandardMaterial(),
  environment: new THREE.Texture(),
  tileMeters: () => 1,
});

const meshes = (root: THREE.Object3D) => root.children.filter((c) => c instanceof THREE.InstancedMesh);
const instances = (root: THREE.Object3D, part: string) =>
  meshes(root)
    .filter((m) => m.name.startsWith(part))
    .reduce((sum, m) => sum + (m as THREE.InstancedMesh).count, 0);

describe("木をまとめて描く（InstancedMesh）", () => {
  it("最初は今の簡単な木：150本でも、描くのは幹と葉の2回", () => {
    const field = createTreeField(spots);
    expect(field.mode).toBe("simple");
    expect(meshes(field.root)).toHaveLength(2);
    expect(instances(field.root, "trunk")).toBe(150);
    expect(instances(field.root, "leaves")).toBe(150);
  });

  it("Blender の木（2種類）と素材がそろうと、描くのは 2種類 × 2部品 ＝ 4回。本数は変わらない", () => {
    const field = createTreeField(spots);
    field.setModels(ASSET.tree.variants.map(fakeModel));
    expect(field.mode).toBe("simple"); // 素材がまだ
    field.applyLook(fakeLook());
    expect(field.mode).toBe("model");
    expect(meshes(field.root)).toHaveLength(ASSET.tree.variants.length * 2);
    expect(instances(field.root, "trunk")).toBe(150);
    expect(instances(field.root, "leaves")).toBe(150);
  });

  it("低画質・素材が読めないとき（applyLook(null)）は、今の簡単な木に戻す", () => {
    const field = createTreeField(spots);
    field.setModels(ASSET.tree.variants.map(fakeModel));
    field.applyLook(fakeLook());
    field.applyLook(null);
    expect(field.mode).toBe("simple");
    expect(meshes(field.root)).toHaveLength(2);
  });

  it("木の GLB が読めないとき（形がない）は、素材があっても今の簡単な木", () => {
    const field = createTreeField(spots);
    field.applyLook(fakeLook());
    expect(field.mode).toBe("simple");
  });

  it("場所・向き・大きさのとおりに置く", () => {
    const field = createTreeField([{ x: 5, y: 2, z: -3, rotation: Math.PI / 2, scale: 1.2 }]);
    const m = new THREE.Matrix4();
    (meshes(field.root)[0] as THREE.InstancedMesh).getMatrixAt(0, m);
    const p = new THREE.Vector3();
    const s = new THREE.Vector3();
    m.decompose(p, new THREE.Quaternion(), s);
    expect(p.toArray()).toEqual([5, 2, -3]);
    expect(s.x).toBeCloseTo(1.2, 6); // インスタンスの行列は Float32
  });
});

describe("GLB の木を読む", () => {
  const glbScene = (names: readonly string[]) => {
    const scene = new THREE.Group();
    for (const name of names) {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
      mesh.name = name;
      mesh.position.set(0, name === "leaves" ? 3 : 0.5, 0);
      scene.add(mesh);
    }
    return scene;
  };

  it("幹と葉の形を取り出し、ノードの位置を形に焼き込む", () => {
    const model = treeModelFrom(glbScene(ASSET.tree.nodes));
    expect(model).not.toBeNull();
    model?.leaves.computeBoundingBox();
    expect(model?.leaves.boundingBox?.min.y).toBeCloseTo(2.5, 6);
  });

  it("部品がそろわなければ null", () => {
    expect(treeModelFrom(glbScene(["trunk"]))).toBeNull();
  });

  it("manifest の2種類を読む。1つでもなければ null（今の簡単な木のまま）", async () => {
    const all = { models: ASSET.tree.variants.map((name) => ({ name, file: `${name}.glb` })) };
    const deps = (manifest: typeof all) => ({
      base: "/",
      fetchManifest: async () => manifest,
      loadModel: async () => glbScene(ASSET.tree.nodes),
    });
    expect(await loadTreeModels(deps(all))).toHaveLength(ASSET.tree.variants.length);
    expect(await loadTreeModels(deps({ models: all.models.slice(1) }))).toBeNull();
  });

  it("読み込みで失敗しても例外を出さず null", async () => {
    const result = await loadTreeModels({
      base: "/",
      fetchManifest: async () => {
        throw new Error("通信できない");
      },
      loadModel: async () => new THREE.Group(),
    });
    expect(result).toBeNull();
  });
});

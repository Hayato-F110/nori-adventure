// 木（NORI-26。docs/game-rules.md「木」）。ステージ1・2で共通。描画だけで、当たり判定には影響しない。
// 同じ木はまとめて1回で描く（InstancedMesh）。何本あっても、描く回数は「種類 × 部品」だけ。
// 最初・低画質・素材が読めないときは、今の簡単な木（幹の円柱と葉の多面体）。高画質で素材が読めたら、
// Blender の木（tree-a・tree-b）に、幹は樹皮の素材、葉は芝の素材を濃い緑に染めて貼る。
import * as THREE from "three";
import { ASSET, LOOK } from "../config";
import type { ModelManifest } from "./carModel";
import { type Look, withoutAo } from "./look";

/** 木を置く場所。rotation は上から見た向き（rad）、scale は大きさの倍率 */
export type TreeSpot = { x: number; y?: number; z: number; rotation: number; scale: number };

/** 木の形1種類（幹と葉の形。ノードの位置・向きは形に焼き込み済み） */
export type TreeModel = { trunk: THREE.BufferGeometry; leaves: THREE.BufferGeometry };

export type TreeField = {
  root: THREE.Group;
  /** Blender の木の形を渡す（読めたら）。素材がまだなら、今の簡単な木のまま */
  setModels(models: readonly TreeModel[]): void;
  /** 素材を貼る（null なら今の簡単な木に戻す：低画質・素材が読めないとき） */
  applyLook(look: Look | null): void;
  /**
   * 素材が読めた時点で、Blender の木を裏で組み立ててシェーダーを用意しておく（まだ画面には出さない）。
   * あとで applyLook したときに、一瞬止まらずに切り替えられる
   */
  prepare(look: Look): void;
  /** 今の描き方（E2E・テスト用） */
  readonly mode: "simple" | "model";
};

/** 今の簡単な木（ステージ1の最初の見た目と同じ形・色） */
const simpleModel = (): TreeModel => ({
  trunk: new THREE.CylinderGeometry(0.25, 0.3, 1.6, 6).translate(0, 0.8, 0),
  leaves: new THREE.IcosahedronGeometry(1.4, 0).translate(0, 2.4, 0),
});
const SIMPLE_TRUNK = new THREE.MeshStandardMaterial({ color: 0x8d5a2b });
const SIMPLE_LEAVES = new THREE.MeshStandardMaterial({ color: 0x3fa34d, roughness: 0.9 });

export type TreeFieldOptions = {
  /**
   * Blender の木に切り替える前に、シェーダーを用意する（renderer.compileAsync）。
   * 渡さなければ、すぐに切り替える（テスト用）
   */
  precompile?: (staged: THREE.Object3D) => Promise<unknown>;
};

export const createTreeField = (spots: readonly TreeSpot[], options: TreeFieldOptions = {}): TreeField => {
  const root = new THREE.Group();
  root.name = "trees";
  const simple = simpleModel();
  let models: readonly TreeModel[] = [];
  let mode: "simple" | "model" = "simple";

  const matrix = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const pos = new THREE.Vector3();
  const size = new THREE.Vector3();

  /** 種類ごとに、その種類の木の場所へ InstancedMesh を作る（場所 i は種類 i % 種類の数） */
  const build = (kinds: readonly TreeModel[], trunkMat: THREE.Material, leafMat: THREE.Material) =>
    kinds.flatMap((kind, k) => {
      const mine = spots.filter((_, i) => i % kinds.length === k);
      if (mine.length === 0) return [];
      const trunk = new THREE.InstancedMesh(kind.trunk, trunkMat, mine.length);
      const leaves = new THREE.InstancedMesh(kind.leaves, leafMat, mine.length);
      mine.forEach((s, i) => {
        q.setFromAxisAngle(up, s.rotation);
        matrix.compose(pos.set(s.x, s.y ?? 0, s.z), q, size.set(s.scale, s.scale, s.scale));
        trunk.setMatrixAt(i, matrix);
        leaves.setMatrixAt(i, matrix);
      });
      trunk.castShadow = true;
      leaves.castShadow = true;
      trunk.name = `trunk-${k}`;
      leaves.name = `leaves-${k}`;
      return [trunk, leaves];
    });
  /** 組み立て済みの Blender の木（素材と形ごとに1回だけ作る）と、シェーダーの用意ができたか */
  let staged: {
    look: Look;
    models: readonly TreeModel[];
    meshes: THREE.InstancedMesh[];
    ready: Promise<unknown>;
  } | null = null;
  const swap = (meshes: readonly THREE.InstancedMesh[], next: "simple" | "model") => {
    for (const child of [...root.children]) {
      root.remove(child);
      // 組み立て済みの Blender の木は、また使うことがあるので捨てない
      if (!(staged?.meshes as THREE.Object3D[] | undefined)?.includes(child))
        (child as THREE.InstancedMesh).dispose();
    }
    root.add(...meshes);
    mode = next;
  };
  swap(build([simple], SIMPLE_TRUNK, SIMPLE_LEAVES), "simple");

  let look: Look | null = null;
  let prepared: Look | null = null;
  const stageFor = (forLook: Look) => {
    if (staged !== null && staged.look === forLook && staged.models === models) return staged;
    const [r = 1, g = 1, b = 1] = LOOK.leafTint;
    const leafTint = new THREE.Color().setRGB(r, g, b, THREE.LinearSRGBColorSpace);
    const meshes = build(models, forLook.material("bark"), leafMaterial(forLook.material("grass", leafTint)));
    const group = new THREE.Group();
    group.add(...meshes);
    const ready =
      options.precompile === undefined ? Promise.resolve() : options.precompile(group).catch(() => undefined);
    group.remove(...meshes);
    staged = { look: forLook, models, meshes, ready };
    return staged;
  };
  /** 切り替えの番号（シェーダーを用意している間に、また切り替わったら古いほうは捨てる） */
  let version = 0;
  const refresh = () => {
    version++;
    if (look === null || models.length === 0) {
      if (mode !== "simple") swap(build([simple], SIMPLE_TRUNK, SIMPLE_LEAVES), "simple");
      if (prepared !== null && models.length > 0) stageFor(prepared);
      return;
    }
    const next = stageFor(look);
    if (options.precompile === undefined) {
      swap(next.meshes, "model");
      return;
    }
    // シェーダーの用意ができてから入れ替える（その間は今の木を描き続ける）
    const mine = version;
    void next.ready.then(() => {
      if (mine === version) swap(next.meshes, "model");
    });
  };

  return {
    root,
    get mode() {
      return mode;
    },
    setModels(next) {
      models = next;
      refresh();
    },
    applyLook(next) {
      look = next;
      refresh();
    },
    prepare(next) {
      prepared = next;
      if (models.length > 0) stageFor(next);
    },
  };
};

/**
 * 葉の材質：芝の素材の色と凹凸だけを使う。芝のざらつきの画像は、丸い葉のかたまりの上の面で空が白く映り込み、
 * 雪が積もったように見えるので使わない（完全にざらざら）。焼き付けた地面の陰も外す
 */
const leafMaterial = (grass: THREE.MeshStandardMaterial): THREE.MeshStandardMaterial => {
  const mat = withoutAo(grass).clone();
  mat.roughnessMap = null;
  mat.roughness = 1;
  return mat;
};

/** GLB の木から、幹と葉の形を取り出す（ノードの位置・向きを形に焼き込む）。部品がそろわなければ null */
export const treeModelFrom = (scene: THREE.Object3D): TreeModel | null => {
  scene.updateMatrixWorld(true);
  const pick = (name: string) => {
    const node = scene.getObjectByName(name);
    if (!(node instanceof THREE.Mesh)) return null;
    return (node.geometry as THREE.BufferGeometry).clone().applyMatrix4(node.matrixWorld);
  };
  const [trunkName = "trunk", leavesName = "leaves"] = ASSET.tree.nodes;
  const trunk = pick(trunkName);
  const leaves = pick(leavesName);
  return trunk === null || leaves === null ? null : { trunk, leaves };
};

export type TreeLoadDeps = {
  base: string;
  fetchManifest: (url: string) => Promise<ModelManifest>;
  loadModel: (url: string) => Promise<THREE.Object3D>;
};

/** manifest にある木（ASSET.tree.variants）をすべて読む。1つでも読めなければ null（今の簡単な木のまま） */
export const loadTreeModels = async (deps: TreeLoadDeps): Promise<TreeModel[] | null> => {
  try {
    const manifest = await deps.fetchManifest(`${deps.base}models/manifest.json`);
    const models = await Promise.all(
      ASSET.tree.variants.map(async (name) => {
        const entry = manifest.models.find((m) => m.name === name);
        if (entry === undefined) return null;
        return treeModelFrom(await deps.loadModel(`${deps.base}models/${entry.file}`));
      }),
    );
    return models.every((m) => m !== null) ? models : null;
  } catch {
    return null;
  }
};

/** 0〜1 の決まった値（木の向き・大きさを並べる場所ごとに変える。Math.random を使わない） */
export const treeHash = (i: number): number => {
  const v = Math.sin(i * 12.9898 + 78.233) * 43758.5453;
  return v - Math.floor(v);
};

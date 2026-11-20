// ボスの自作モデル（NORI-65。docs/game-rules.md「ボスのモデル」「ボスの色」「ボスの口」）。
// GLB の部品をそろえ（そろわなければ簡単な形のまま）、ボスのグループに差しかえ、届けた回数と前ぶれから見た目を当てる。
// 位置・向き・はねる動きはグループに当てる（stage5View.ts）。ここはグループの中の見た目だけ
import * as THREE from "three";
import { ASSET, BOSS } from "../config";
import { bossColor, bossMouth, type Mouth } from "./bossLook";

export type BossParts = {
  /** ふくらむのは body だけ（原点は底の中心なので、底を中心にふくらむ） */
  body: THREE.Object3D;
  mouths: Record<Mouth, THREE.Object3D>;
  /** 名前が ASSET.boss.materials の素材（体と腕。GLB の読み込みで別々の物になっていても全部） */
  bodyMaterials: THREE.MeshStandardMaterial[];
};

const MOUTHS: readonly Mouth[] = ["frown", "flat", "smile"];

/** 部品 8 つと、色を塗る素材がそろえば部品を返す。1 つでも欠ければ null（簡単な形のまま） */
export const bossPartsOf = (model: THREE.Object3D): BossParts | null => {
  const find = (name: string) => model.getObjectByName(name);
  if (ASSET.boss.nodes.some((name) => find(name) === undefined)) return null;
  const [paint] = ASSET.boss.materials;
  const bodyMaterials = new Set<THREE.MeshStandardMaterial>();
  model.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
      if (m instanceof THREE.MeshStandardMaterial && m.name === paint) bodyMaterials.add(m);
    }
  });
  if (bodyMaterials.size === 0) return null;
  const body = find("body");
  const mouths = Object.fromEntries(MOUTHS.map((k) => [k, find(`mouth_${k}`)])) as Record<
    Mouth,
    THREE.Object3D
  >;
  return body === undefined ? null : { body, mouths, bodyMaterials: [...bodyMaterials] };
};

/** 部品がそろっていれば、モデルをボスのグループの子にして、簡単な形を隠す。そろわなければ何もしない */
export const swapBossModel = (
  group: THREE.Group,
  simple: readonly THREE.Object3D[],
  model: THREE.Object3D,
  parts: BossParts | null,
): boolean => {
  if (parts === null) return false;
  for (const s of simple) s.visible = false;
  group.add(model);
  return true;
};

/** 届けた回数（calm）から体と腕の色・口を、前ぶれ（puff、0〜1）から body のふくらみを当てる */
export const applyBossLook = (parts: BossParts, calm: number, puff: number): void => {
  const color = bossColor(calm);
  for (const m of parts.bodyMaterials) m.color.set(color);
  const mouth = bossMouth(calm);
  for (const k of MOUTHS) parts.mouths[k].visible = k === mouth;
  parts.body.scale.setScalar(1 + BOSS.puffScale * puff);
};

/** モデルで見えている口のノードの名前（E2E が、描画の変数でなく画面の部品を読むため。R1-65-9） */
export const visibleMouthNodes = (parts: BossParts): string[] =>
  MOUTHS.filter((k) => parts.mouths[k].visible).map((k) => `mouth_${k}`);

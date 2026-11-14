// docs/game-rules.md「街をにぎやかに」の服の色（NORI-61）。NORI-70（初見レビュー R2-61-33）で足した：
// 「k 人目は k 番目、自転車・バイクの i 台目は (i + 2) 番目」の割り当てを、モデルに差しかえたあとの色で確かめる
import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { ASSET, TRAFFIC } from "../../src/config";
import type { BikeKind } from "../../src/core/traffic";
import { createCityLifeView } from "../../src/render/cityLifeView";

/** 部品 body の下に、素材の名前が shirt の箱を1つ持つモデル */
const modelWithShirt = (name: string): THREE.Object3D => {
  const root = new THREE.Group();
  root.name = name;
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(),
    Object.assign(new THREE.MeshStandardMaterial({ color: 0xffffff }), { name: "shirt" }),
  );
  body.name = ASSET.city.nodes[0];
  root.add(body);
  return root;
};

/** 置き場所の中の、shirt の素材の色（16 進） */
const shirtHex = (holder: THREE.Object3D): number | undefined => {
  let hex: number | undefined;
  holder.traverse((o) => {
    if (o instanceof THREE.Mesh && (o.material as THREE.MeshStandardMaterial).name === "shirt") {
      hex = (o.material as THREE.MeshStandardMaterial).color.getHex();
    }
  });
  return hex;
};

const colorHex = (n: number): number =>
  new THREE.Color(TRAFFIC.shirtColors[n % TRAFFIC.shirtColors.length]).getHex();

describe("服の色の割り当て（NORI-70）", () => {
  const vehicles = TRAFFIC.vehicles.map((v) => v.model);
  const bikes: BikeKind[] = ["bicycle", "motorbike", "bicycle", "motorbike"];
  const people = TRAFFIC.people.count;
  const view = createCityLifeView(vehicles, bikes, people);
  view.useModels(
    new Map(["bicycle", "motorbike", "person"].map((name) => [name, modelWithShirt(name)] as const)),
  );
  // 置き場所は、車・自転車とバイク・人の順に root の先頭から並ぶ
  const holders = view.root.children;

  it.each(Array.from({ length: people }, (_, k) => k))("%i 人目の服は、同じ番号（k 番目）の色", (k) => {
    expect(shirtHex(holders[vehicles.length + bikes.length + k] as THREE.Object3D)).toBe(colorHex(k));
  });

  it.each(bikes.map((_, i) => i))("自転車・バイクの %i 台目は、(i + 2) 番目の色", (i) => {
    expect(shirtHex(holders[vehicles.length + i] as THREE.Object3D)).toBe(colorHex(i + 2));
  });

  it("人と自転車・バイクの数ぶんの置き場所があり、名前はモデルの名前", () => {
    expect(holders.slice(vehicles.length, vehicles.length + bikes.length).map((h) => h.name)).toEqual(bikes);
    expect(
      holders
        .slice(vehicles.length + bikes.length, vehicles.length + bikes.length + people)
        .map((h) => h.name),
    ).toEqual(new Array<string>(people).fill("person"));
  });
});

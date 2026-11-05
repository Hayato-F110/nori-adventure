// ステージ1の街の見た目。道・建物・木。配置は core の createStage1Layout（当たり判定と同じもの）を描くだけ。
import * as THREE from "three";
import { STAGE1 } from "../config";
import { roadLines, type Stage1Layout } from "../core/stage1Layout";

const BUILDING_COLORS = [0xffd166, 0x8ecae6, 0xf4978e, 0xb5e48c, 0xcdb4db, 0xffffff];

export type CityView = {
  root: THREE.Group;
  /** カメラが建物の中に入らないように、光線を当てる相手 */
  obstacles: THREE.Object3D[];
};

export const createCity = (layout: Stage1Layout): CityView => {
  const city = new THREE.Group();
  city.name = "city";
  const { groundSize, roadWidth, boundsHalfSize } = STAGE1;

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(groundSize, groundSize),
    new THREE.MeshStandardMaterial({ color: 0x7ccf6b, roughness: 1 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  city.add(ground);

  // 碁盤の目の道（中心線つき）
  const roadMat = new THREE.MeshStandardMaterial({ color: 0x5b6070, roughness: 0.95 });
  const lineMat = new THREE.MeshStandardMaterial({ color: 0xfff1a8, roughness: 0.8 });
  const roadLength = boundsHalfSize * 2 + roadWidth;
  const lines = roadLines(STAGE1);
  for (const p of lines) {
    for (const along of ["x", "z"] as const) {
      const road = new THREE.Mesh(new THREE.PlaneGeometry(roadWidth, roadLength), roadMat);
      road.rotation.x = -Math.PI / 2;
      road.position.y = 0.01;
      road.receiveShadow = true;
      const stripe = new THREE.Mesh(new THREE.PlaneGeometry(0.3, roadLength), lineMat);
      stripe.rotation.x = -Math.PI / 2;
      stripe.position.y = 0.02;
      if (along === "x") {
        road.rotation.z = Math.PI / 2;
        stripe.rotation.z = Math.PI / 2;
        road.position.z = stripe.position.z = p;
      } else {
        road.position.x = stripe.position.x = p;
      }
      city.add(road, stripe);
    }
  }

  // 建物と木（配置は core で決まっている）
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  boxGeo.translate(0, 0.5, 0);
  const materials = BUILDING_COLORS.map((color) => new THREE.MeshStandardMaterial({ color, roughness: 0.8 }));
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x8d5a2b });
  const leafMat = new THREE.MeshStandardMaterial({ color: 0x3fa34d, roughness: 0.9 });
  const leafGeo = new THREE.IcosahedronGeometry(1.4, 0);
  const trunkGeo = new THREE.CylinderGeometry(0.25, 0.3, 1.6, 6);
  trunkGeo.translate(0, 0.8, 0);

  const obstacles: THREE.Object3D[] = [];
  layout.buildings.forEach((b, index) => {
    const building = new THREE.Mesh(boxGeo, materials[index % materials.length]);
    building.scale.set(b.halfWidth * 2, b.height, b.halfDepth * 2);
    building.position.set(b.x, 0, b.z);
    building.castShadow = true;
    building.receiveShadow = true;
    city.add(building);
    obstacles.push(building);
  });
  for (const t of layout.trees) {
    const tree = new THREE.Group();
    tree.add(new THREE.Mesh(trunkGeo, trunkMat));
    const leaves = new THREE.Mesh(leafGeo, leafMat);
    leaves.position.y = 2.4;
    leaves.castShadow = true;
    tree.add(leaves);
    tree.position.set(t.x, 0, t.z);
    city.add(tree);
  }
  return { root: city, obstacles };
};

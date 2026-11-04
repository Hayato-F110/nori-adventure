// ステージ1の街の見た目（試作）。道・建物・木。形と色だけで、当たり判定は S05 で Rapier に入れる。
import * as THREE from "three";
import { STAGE1 } from "../config";

// 建物の高さや色をばらつかせるための、決まった並びの擬似乱数（毎回同じ街になる）
const hash = (a: number, b: number): number => {
  const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return s - Math.floor(s);
};

const BUILDING_COLORS = [0xffd166, 0x8ecae6, 0xf4978e, 0xb5e48c, 0xcdb4db, 0xffffff];

export const createCity = (): THREE.Group => {
  const city = new THREE.Group();
  city.name = "city";
  const { groundSize, roadSpacing, roadWidth, boundsHalfSize } = STAGE1;

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
  const lines: number[] = [];
  for (let p = -boundsHalfSize + (boundsHalfSize % roadSpacing); p <= boundsHalfSize; p += roadSpacing) {
    lines.push(p);
  }
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

  // 道に囲まれた区画ごとに、建物2〜4棟と木を置く
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  boxGeo.translate(0, 0.5, 0);
  const materials = BUILDING_COLORS.map((color) => new THREE.MeshStandardMaterial({ color, roughness: 0.8 }));
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x8d5a2b });
  const leafMat = new THREE.MeshStandardMaterial({ color: 0x3fa34d, roughness: 0.9 });
  const leafGeo = new THREE.IcosahedronGeometry(1.4, 0);
  const trunkGeo = new THREE.CylinderGeometry(0.25, 0.3, 1.6, 6);
  trunkGeo.translate(0, 0.8, 0);

  for (let i = 0; i < lines.length - 1; i++) {
    for (let j = 0; j < lines.length - 1; j++) {
      const x0 = (lines[i] ?? 0) + roadWidth / 2 + 2;
      const z0 = (lines[j] ?? 0) + roadWidth / 2 + 2;
      const size = roadSpacing - roadWidth - 4;
      const count = 2 + Math.floor(hash(i, j) * 3);
      for (let k = 0; k < count; k++) {
        const w = 6 + hash(i + k, j) * 6;
        const d = 6 + hash(i, j + k) * 6;
        const h = 4 + hash(i * 3 + k, j * 7) * 14;
        const corner = k % 4;
        const bx = x0 + (corner % 2 === 0 ? w / 2 : size - w / 2);
        const bz = z0 + (corner < 2 ? d / 2 : size - d / 2);
        const building = new THREE.Mesh(boxGeo, materials[(i * 5 + j * 3 + k) % materials.length]);
        building.scale.set(w, h, d);
        building.position.set(bx, 0, bz);
        building.castShadow = true;
        building.receiveShadow = true;
        city.add(building);
      }
      const tree = new THREE.Group();
      tree.add(new THREE.Mesh(trunkGeo, trunkMat));
      const leaves = new THREE.Mesh(leafGeo, leafMat);
      leaves.position.y = 2.4;
      leaves.castShadow = true;
      tree.add(leaves);
      tree.position.set(x0 + size / 2, 0, z0 + size / 2);
      city.add(tree);
    }
  }
  return city;
};

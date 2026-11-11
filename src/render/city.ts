// ステージ1の街の見た目。道・建物・木。配置は core の createStage1Layout（当たり判定と同じもの）を描くだけ。
// 最初は単色で描き、素材（NORI-56）が読めたら applyLook で差しかえる。低画質のときは単色に戻す。
import * as THREE from "three";
import { STAGE1 } from "../config";
import { roadLines, type Stage1Layout } from "../core/stage1Layout";
import { type Look, setBoxUvMeters, setGroundUv1, setPlaneUvMeters } from "./look";

const BUILDING_COLORS = [0xffd166, 0x8ecae6, 0xf4978e, 0xb5e48c, 0xcdb4db, 0xffffff];

export type CityView = {
  root: THREE.Group;
  /** カメラが建物の中に入らないように、光線を当てる相手 */
  obstacles: THREE.Object3D[];
  /** 素材を貼る（null なら単色に戻す：低画質・読めなかったとき） */
  applyLook(look: Look | null): void;
};

export const createCity = (layout: Stage1Layout): CityView => {
  const city = new THREE.Group();
  city.name = "city";
  const { groundSize, roadWidth, boundsHalfSize } = STAGE1;
  // 単色の材質と、素材を貼るときの選び方を、メッシュごとに覚えておく
  const swaps: { mesh: THREE.Mesh; plain: THREE.Material; pick: (look: Look) => THREE.Material }[] = [];

  const groundPlain = new THREE.MeshStandardMaterial({ color: 0x7ccf6b, roughness: 1 });
  const ground = new THREE.Mesh(
    setPlaneUvMeters(new THREE.PlaneGeometry(groundSize, groundSize), groundSize, groundSize),
    groundPlain,
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  city.add(ground);
  setGroundUv1(ground, groundSize);
  swaps.push({ mesh: ground, plain: groundPlain, pick: (look) => look.material("grass") });

  // 碁盤の目の道（中心線つき）
  // 単色の道（低画質・素材が読めないとき）。AgX を通すと明るく見えるので暗めにして、ほし（黄色）との差を 3:1 以上に保つ
  const roadMat = new THREE.MeshStandardMaterial({ color: 0x3a3e48, roughness: 0.95 });
  const lineMat = new THREE.MeshStandardMaterial({ color: 0xfff1a8, roughness: 0.8 });
  const roadLength = boundsHalfSize * 2 + roadWidth;
  const roadGeo = setPlaneUvMeters(new THREE.PlaneGeometry(roadWidth, roadLength), roadWidth, roadLength);
  const lines = roadLines(STAGE1);
  for (const p of lines) {
    for (const along of ["x", "z"] as const) {
      // 地面の陰の uv1 は置き場所で変わるので、形は道ごとに写す
      const road = new THREE.Mesh(roadGeo.clone(), roadMat);
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
      setGroundUv1(road, groundSize);
      swaps.push({ mesh: road, plain: roadMat, pick: (look) => look.material("road") });
    }
  }

  // 建物と木（配置は core で決まっている）。建物は大きさごとの形にして、UV をメートル単位にする（素材が伸びない）
  const materials = BUILDING_COLORS.map((color) => new THREE.MeshStandardMaterial({ color, roughness: 0.8 }));
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x8d5a2b });
  const leafMat = new THREE.MeshStandardMaterial({ color: 0x3fa34d, roughness: 0.9 });
  const leafGeo = new THREE.IcosahedronGeometry(1.4, 0);
  const trunkGeo = new THREE.CylinderGeometry(0.25, 0.3, 1.6, 6);
  trunkGeo.translate(0, 0.8, 0);

  const obstacles: THREE.Object3D[] = [];
  layout.buildings.forEach((b, index) => {
    const w = b.halfWidth * 2;
    const d = b.halfDepth * 2;
    const geo = setBoxUvMeters(new THREE.BoxGeometry(w, b.height, d), w, b.height, d);
    geo.translate(0, b.height / 2, 0);
    const color = BUILDING_COLORS[index % BUILDING_COLORS.length] ?? 0xffffff;
    const plain = materials[index % materials.length] as THREE.Material;
    const building = new THREE.Mesh(geo, plain);
    building.position.set(b.x, 0, b.z);
    building.castShadow = true;
    building.receiveShadow = true;
    city.add(building);
    obstacles.push(building);
    // 2版目の試作と同じ：3棟に1棟はれんが、ほかは白い外壁に建物の色をのせる
    swaps.push({
      mesh: building,
      plain,
      pick: (look) => (index % 3 === 0 ? look.material("brick") : look.material("facade", color)),
    });
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
  return {
    root: city,
    obstacles,
    applyLook(look) {
      for (const s of swaps) s.mesh.material = look === null ? s.plain : s.pick(look);
    },
  };
};

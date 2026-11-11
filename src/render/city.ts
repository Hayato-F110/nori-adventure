// ステージ1の街の見た目。道・建物・木。配置は core の createStage1Layout（当たり判定と同じもの）を描くだけ。
// 最初は単色で描き、素材（NORI-56）が読めたら applyLook で差しかえる。低画質のときは単色に戻す。
import * as THREE from "three";
import { LOOK, STAGE1 } from "../config";
import { roadLines, type Stage1Layout } from "../core/stage1Layout";
import { type Look, setBoxUvMeters, setGroundUv1, setPlaneUvMeters } from "./look";
import { createTreeField, type TreeField, treeHash } from "./trees";

const BUILDING_COLORS = [0xffd166, 0x8ecae6, 0xf4978e, 0xb5e48c, 0xcdb4db, 0xffffff];

export type CityView = {
  root: THREE.Group;
  /** カメラが建物の中に入らないように、光線を当てる相手 */
  obstacles: THREE.Object3D[];
  /** 素材を貼る（null なら単色に戻す：低画質・読めなかったとき） */
  applyLook(look: Look | null): void;
  /** 木（NORI-26。Blender の木の形は、読めたら trees.setModels で渡す） */
  trees: TreeField;
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

  // 碁盤の目の道。中央線は引かない（ほしは道の中心に並ぶので、線とまぎれる。NORI-56 のレビュー）。
  // 代わりに、道の両端の内側に白線を、交差点の間だけ引く
  // 単色の道（低画質・素材が読めないとき）。AgX を通すと明るく見えるので暗めにして、ほし（黄色）との差を 3:1 以上に保つ
  const roadMat = new THREE.MeshStandardMaterial({ color: LOOK.plainRoadColor, roughness: 0.95 });
  const lineMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8 });
  const roadLength = boundsHalfSize * 2 + roadWidth;
  const roadGeo = setPlaneUvMeters(new THREE.PlaneGeometry(roadWidth, roadLength), roadWidth, roadLength);
  const lines = roadLines(STAGE1);
  // 白線を引く区間（道の長さ方向）：交差点（道の幅）を除いた、道の端から端まで
  const half = roadLength / 2;
  const cuts = [-half, ...lines.flatMap((p) => [p - roadWidth / 2, p + roadWidth / 2]), half];
  const spans: [number, number][] = [];
  for (let i = 0; i + 1 < cuts.length; i += 2) {
    const a = cuts[i] ?? 0;
    const b = cuts[i + 1] ?? 0;
    if (b - a > 0.5) spans.push([a, b]);
  }
  const edge = roadWidth / 2 - LOOK.roadLineInset;
  for (const p of lines) {
    for (const along of ["x", "z"] as const) {
      // 地面の陰の uv1 は置き場所で変わるので、形は道ごとに写す
      const road = new THREE.Mesh(roadGeo.clone(), roadMat);
      road.rotation.x = -Math.PI / 2;
      road.position.y = 0.01;
      road.receiveShadow = true;
      if (along === "x") {
        road.rotation.z = Math.PI / 2;
        road.position.z = p;
      } else {
        road.position.x = p;
      }
      city.add(road);
      setGroundUv1(road, groundSize);
      swaps.push({ mesh: road, plain: roadMat, pick: (look) => look.material("road") });
      for (const [a, b] of spans) {
        for (const side of [-1, 1]) {
          const line = new THREE.Mesh(new THREE.PlaneGeometry(LOOK.roadLineWidth, b - a), lineMat);
          line.rotation.x = -Math.PI / 2;
          line.position.y = 0.02;
          const mid = (a + b) / 2;
          if (along === "x") {
            line.rotation.z = Math.PI / 2;
            line.position.set(mid, 0.02, p + side * edge);
          } else {
            line.position.set(p + side * edge, 0.02, mid);
          }
          city.add(line);
        }
      }
    }
  }

  // 建物と木（配置は core で決まっている）。建物は大きさごとの形にして、UV をメートル単位にする（素材が伸びない）
  const materials = BUILDING_COLORS.map((color) => new THREE.MeshStandardMaterial({ color, roughness: 0.8 }));

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
  // 木（まとめて描く。向きと大きさは場所ごとに少し変える。当たり判定は core の幹の円柱のまま）
  const trees = createTreeField(
    layout.trees.map((t, i) => ({
      x: t.x,
      z: t.z,
      rotation: treeHash(i + 5000) * Math.PI * 2,
      scale: 0.9 + treeHash(i + 4000) * 0.2,
    })),
  );
  city.add(trees.root);
  return {
    root: city,
    obstacles,
    trees,
    applyLook(look) {
      for (const s of swaps) s.mesh.material = look === null ? s.plain : s.pick(look);
      trees.applyLook(look);
    },
  };
};

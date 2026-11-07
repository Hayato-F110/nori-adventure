// 車の見た目。GLB（public/models/car.glb）が読めればそれを使い、読めなければ箱の形の車で続ける。
// 前は −Z。原点は車体の底の中心。
import * as THREE from "three";
import { ASSET } from "../config";

export type CarView = {
  root: THREE.Group;
  /** 速度とハンドルに合わせて、タイヤを回す・前輪を切る */
  update(distanceDelta: number, steer: number): void;
};

const WHEEL_RADIUS = 0.42;
const MAX_WHEEL_STEER = 0.5; // 見た目だけの前輪の角度（rad）

export const createCarView = (): CarView => {
  const root = new THREE.Group();
  root.name = "car";

  const bodyMat = new THREE.MeshStandardMaterial({ color: 0xff8a1f, roughness: 0.55 });
  const trimMat = new THREE.MeshStandardMaterial({ color: 0xfff3d6, roughness: 0.6 });
  const glassMat = new THREE.MeshStandardMaterial({ color: 0x6fc8ff, roughness: 0.15, metalness: 0.1 });
  const tireMat = new THREE.MeshStandardMaterial({ color: 0x2b2b33, roughness: 0.9 });
  const lightMat = new THREE.MeshStandardMaterial({ color: 0xfff7a8, emissive: 0x665c10 });

  const box = (w: number, h: number, d: number, mat: THREE.Material, x: number, y: number, z: number) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    root.add(mesh);
    return mesh;
  };

  box(1.8, 0.6, 3.4, bodyMat, 0, 0.65, 0); // 車体
  box(1.84, 0.12, 3.44, trimMat, 0, 0.38, 0); // すそのライン
  box(1.5, 0.6, 1.7, glassMat, 0, 1.25, 0.2); // まど
  box(1.56, 0.14, 1.76, bodyMat, 0, 1.6, 0.2); // 屋根
  box(0.36, 0.22, 0.08, lightMat, -0.55, 0.75, -1.72); // ライト（左）
  box(0.36, 0.22, 0.08, lightMat, 0.55, 0.75, -1.72); // ライト（右）

  const wheelGeo = new THREE.CylinderGeometry(WHEEL_RADIUS, WHEEL_RADIUS, 0.34, 16);
  wheelGeo.rotateZ(Math.PI / 2);
  const hubGeo = new THREE.BoxGeometry(0.36, 0.12, 0.5); // 回っているのが見えるように
  const wheels: { pivot: THREE.Group; spin: THREE.Group; front: boolean }[] = [];
  for (const [x, z] of [
    [-0.92, -1.1],
    [0.92, -1.1],
    [-0.92, 1.1],
    [0.92, 1.1],
  ] as const) {
    const pivot = new THREE.Group();
    pivot.position.set(x, WHEEL_RADIUS, z);
    const spin = new THREE.Group();
    const tire = new THREE.Mesh(wheelGeo, tireMat);
    tire.castShadow = true;
    spin.add(tire, new THREE.Mesh(hubGeo, trimMat));
    pivot.add(spin);
    root.add(pivot);
    wheels.push({ pivot, spin, front: z < 0 });
  }

  return {
    root,
    update(distanceDelta, steer) {
      for (const wheel of wheels) {
        wheel.spin.rotation.x -= distanceDelta / WHEEL_RADIUS;
        if (wheel.front) wheel.pivot.rotation.y = -steer * MAX_WHEEL_STEER;
      }
    },
  };
};

// ---- Blender で作った GLB の車（NORI-18。docs/game-rules.md「3D モデル（アセット）」） ----

/**
 * 読み込んだモデルから車を作る。決まったノード（ASSET.carNodes）がそろわなければ null を返し、
 * 呼ぶ側は箱の車のまま続ける。
 */
export const carViewFromModel = (model: THREE.Object3D): CarView | null => {
  const found = ASSET.carNodes.map((name) => model.getObjectByName(name));
  if (found.some((node) => node === undefined)) return null;
  model.traverse((obj) => {
    if (obj instanceof THREE.Mesh) obj.castShadow = true;
  });
  const wheels = ASSET.carNodes
    .filter((name) => name.startsWith("wheel_"))
    .map((name) => {
      const node = model.getObjectByName(name) as THREE.Object3D;
      // 先に Y（ハンドル）、そのあと X（回転）の順に効かせる
      node.rotation.order = "YXZ";
      const height = new THREE.Box3().setFromObject(node).getSize(new THREE.Vector3()).y;
      return { node, radius: height > 0 ? height / 2 : WHEEL_RADIUS, front: name.startsWith("wheel_F") };
    });
  const root = new THREE.Group();
  root.name = "car";
  root.add(model);
  return {
    root,
    update(distanceDelta, steer) {
      for (const wheel of wheels) {
        wheel.node.rotation.x -= distanceDelta / wheel.radius;
        if (wheel.front) wheel.node.rotation.y = -steer * MAX_WHEEL_STEER;
      }
    },
  };
};

export type ModelManifest = { models: { name: string; file: string }[] };

export type CarLoadDeps = {
  /** import.meta.env.BASE_URL（例：/nori-adventure/） */
  base: string;
  fetchManifest: (url: string) => Promise<ModelManifest>;
  loadModel: (url: string) => Promise<THREE.Object3D>;
};

/**
 * manifest に car があれば GLB を読み、車を返す。ない・失敗したときは null（例外を出さない）。
 * 同じオリジンの models/ だけを読む（CSP の default-src 'self'）。
 */
export const loadCarView = async (deps: CarLoadDeps): Promise<CarView | null> => {
  try {
    const manifest = await deps.fetchManifest(`${deps.base}models/manifest.json`);
    const entry = manifest.models.find((m) => m.name === "car");
    if (entry === undefined) return null;
    return carViewFromModel(await deps.loadModel(`${deps.base}models/${entry.file}`));
  } catch {
    return null;
  }
};

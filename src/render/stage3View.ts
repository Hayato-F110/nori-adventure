// ステージ3の空の見た目（docs/game-rules.md「ステージ3」。NORI-27）。状態を読むだけ。
// 地面（芝）・山（円すい）・気球・雲・輪・ゴールの輪。並びは設定（STAGE3）と、決まった式（雲）で作る。
import * as THREE from "three";
import { LOOK, STAGE3 } from "../config";
import type { Ring, Stage3State } from "../core/stage3";
import { type Look, setGroundUv1, setPlaneUvMeters } from "./look";

const GROUND_SIZE = 900; // 飛べる範囲（±300 m）の外まで地面を見せる

/** 輪の色：空（明るい水色）より十分に暗く、明るさの比 3 以上（docs/game-rules.md「見え方」） */
const RING_COLOR = 0xc0262d;
const RING_DONE_COLOR = 0x7fd38a; // くぐった輪（色だけでなく、細くもする）
const GOAL_COLOR = 0x1f3fbf;

/** 0〜1 の決まった値（雲の並びだけに使う） */
const hash = (i: number): number => {
  const v = Math.sin(i * 12.9898 + 78.233) * 43758.5453;
  return v - Math.floor(v);
};

export type Stage3View = {
  root: THREE.Group;
  applyLook(look: Look | null): void;
  update(state: Stage3State): void;
  /** 輪の上の端と、その少し上の空（E2E で明るさの比を測る。i は輪の番号、-1 はゴール） */
  marker(i: number): { ring: THREE.Vector3; sky: THREE.Vector3 };
};

export const createStage3View = (rings: readonly Ring[], goal: Ring): Stage3View => {
  const root = new THREE.Group();
  root.name = "stage3";
  const swaps: { mesh: THREE.Mesh; plain: THREE.Material; pick: (look: Look) => THREE.Material }[] = [];

  // 地面（芝）
  const groundGeo = setPlaneUvMeters(
    new THREE.PlaneGeometry(GROUND_SIZE, GROUND_SIZE),
    GROUND_SIZE,
    GROUND_SIZE,
  );
  groundGeo.rotateX(-Math.PI / 2);
  const groundPlain = new THREE.MeshStandardMaterial({ color: 0x6cc35a, roughness: 0.95 });
  const ground = new THREE.Mesh(groundGeo, groundPlain);
  ground.receiveShadow = true;
  root.add(ground);
  // 焼き付けた地面の陰（ステージ3。山のすそ）を uv1 で重ねる。範囲は LOOK.skyBakeSize（外は陰なし。NORI-27）
  setGroundUv1(ground, LOOK.skyBakeSize);
  swaps.push({ mesh: ground, plain: groundPlain, pick: (look) => look.material("grass") });

  // 山（設定の場所。当たり判定と同じ円すい）
  const mountainMat = new THREE.MeshStandardMaterial({ color: 0x7c8f6a, roughness: 1, flatShading: true });
  const snowMat = new THREE.MeshStandardMaterial({ color: 0xf2f4f7, roughness: 0.8, flatShading: true });
  STAGE3.mountains.forEach((m, i) => {
    const cone = new THREE.Mesh(new THREE.ConeGeometry(m.radius, m.height, 8, 1), mountainMat);
    cone.position.set(m.x, m.height / 2, m.z);
    cone.rotation.y = i * 0.7;
    cone.castShadow = cone.receiveShadow = true;
    root.add(cone);
    const capH = m.height * 0.25;
    const cap = new THREE.Mesh(new THREE.ConeGeometry(m.radius * 0.25 + 0.2, capH, 8, 1), snowMat);
    cap.position.set(m.x, m.height - capH / 2 + 0.05, m.z);
    cap.rotation.y = cone.rotation.y;
    root.add(cap);
  });

  // 気球（球と、下のかご）
  const balloonColors = [0xff7a3d, 0xffd23f, 0x9b5de5];
  STAGE3.balloons.forEach((b, i) => {
    const group = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({
      color: balloonColors[i % balloonColors.length] ?? 0xffffff,
    });
    const ball = new THREE.Mesh(new THREE.SphereGeometry(b.radius, 20, 14), mat);
    ball.scale.y = 1.15;
    const basket = new THREE.Mesh(
      new THREE.BoxGeometry(1.2, 0.9, 1.2),
      new THREE.MeshStandardMaterial({ color: 0x8d5a2b }),
    );
    basket.position.y = -b.radius - 1.6;
    group.add(ball, basket);
    group.position.set(b.x, b.y, b.z);
    for (const o of group.children) o.castShadow = true;
    root.add(group);
  });

  // 雲（白い平たいかたまり。高さ 60〜78 m。決まった並び）
  const cloudMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, flatShading: true });
  for (let i = 0; i < 14; i++) {
    const cloud = new THREE.Mesh(new THREE.IcosahedronGeometry(6 + hash(i) * 6, 1), cloudMat);
    const a = hash(i + 10) * Math.PI * 2;
    const d = 60 + hash(i + 20) * 220;
    cloud.position.set(Math.cos(a) * d, 60 + hash(i + 30) * 18, Math.sin(a) * d);
    cloud.scale.set(1.8, 0.6, 1.2);
    root.add(cloud);
  }

  // 輪（トーラス。輪の面が進む向きに向く）とゴール（太く、白い内側の輪つき）
  const ringMat = new THREE.MeshBasicMaterial({ color: RING_COLOR, toneMapped: false });
  const doneMat = new THREE.MeshBasicMaterial({ color: RING_DONE_COLOR, toneMapped: false });
  const ringGeo = new THREE.TorusGeometry(STAGE3.ringRadius, 0.55, 12, 40);
  const doneGeo = new THREE.TorusGeometry(STAGE3.ringRadius, 0.3, 8, 40);
  const ringMeshes = rings.map((r) => {
    const mesh = new THREE.Mesh(ringGeo, ringMat);
    mesh.position.set(r.x, r.y, r.z);
    mesh.rotation.y = r.heading;
    root.add(mesh);
    return mesh;
  });
  const goalGroup = new THREE.Group();
  goalGroup.add(
    new THREE.Mesh(
      new THREE.TorusGeometry(goal.radius, 0.9, 12, 56),
      new THREE.MeshBasicMaterial({ color: GOAL_COLOR, toneMapped: false }),
    ),
    new THREE.Mesh(
      new THREE.TorusGeometry(goal.radius - 1.2, 0.3, 8, 56),
      new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }),
    ),
  );
  goalGroup.position.set(goal.x, goal.y, goal.z);
  goalGroup.rotation.y = goal.heading;
  root.add(goalGroup);

  return {
    root,
    applyLook(look) {
      for (const s of swaps) s.mesh.material = look === null ? s.plain : s.pick(look);
    },
    update(state) {
      state.rings.forEach((done, i) => {
        const mesh = ringMeshes[i];
        if (mesh === undefined) return;
        // くぐった輪は緑で細く（色だけに頼らない）
        mesh.material = done ? doneMat : ringMat;
        mesh.geometry = done ? doneGeo : ringGeo;
      });
    },
    marker(i) {
      const r = i < 0 ? goal : rings[i];
      if (r === undefined) throw new Error(`輪 ${i} がない`);
      return {
        ring: new THREE.Vector3(r.x, r.y + r.radius, r.z),
        sky: new THREE.Vector3(r.x, r.y + r.radius + 4, r.z),
      };
    },
  };
};

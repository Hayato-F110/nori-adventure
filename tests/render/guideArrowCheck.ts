// NORI-33（docs/test-plans/NORI-33.md の 13・15）：ステージ4・5の行き先の矢印の向け方を確かめる共通の関数。
// ルール：docs/game-rules.md「目指すものと迷子の手がかり」の「矢印の起こす角」。
// 先（部品の −Z）は、上から見て指す向きへ、水平から GUIDE.arrowLift だけ上げる。
// 平たい面（部品の +Y）は、先の向きを軸に回して、いちばんカメラの方を向ける。
import * as THREE from "three";
import { expect } from "vitest";
import { GUIDE } from "../../src/config";

type P3 = { x: number; y: number; z: number };

/**
 * 矢印の素材が全部、光に左右されない色（MeshBasicMaterial）で、トーンマッピングをしないこと（R4-33-A）。
 * 明るさの比の計算（docs/test-plans/NORI-33.md の「## 計算」）の前提
 */
export const expectUnlit = (arrow: THREE.Object3D) => {
  const materials: THREE.Material[] = [];
  arrow.traverse((o) => {
    const m = (o as THREE.Mesh).material;
    if (m !== undefined) materials.push(...(Array.isArray(m) ? m : [m]));
  });
  expect(materials.length).toBeGreaterThan(0);
  for (const m of materials) {
    expect(m).toBeInstanceOf(THREE.MeshBasicMaterial);
    expect(m.toneMapped).toBe(false);
  }
};

/** 世界の座標での矢印の先の向き（部品の −Z） */
export const tipOf = (o: THREE.Object3D) => o.getWorldDirection(new THREE.Vector3()).negate();
/** 世界の座標での平たい面の向き（部品の +Y） */
export const faceOf = (o: THREE.Object3D) =>
  new THREE.Vector3(0, 1, 0).applyQuaternion(o.getWorldQuaternion(new THREE.Quaternion()));

/**
 * 矢印が、上から見て (want.x, want.z) の向きを指し、先が arrowLift 上がり、面がカメラを向いていること。
 * 面の向きは、先に直角な向きのうちカメラに最も近いもの：|面 · カメラへの向き| ＝ √(1 −（先 · カメラへの向き）²)
 */
export const expectArrowPose = (arrow: THREE.Object3D, want: { x: number; z: number }, camera: P3) => {
  arrow.updateWorldMatrix(true, false);
  const tip = tipOf(arrow);
  const horizontal = tip.clone().setY(0).normalize();
  expect(horizontal.dot(new THREE.Vector3(want.x, 0, want.z).normalize())).toBeGreaterThan(0.99);
  expect(Math.asin(tip.y)).toBeCloseTo(GUIDE.arrowLift, 2);
  const p = arrow.getWorldPosition(new THREE.Vector3());
  const toCamera = new THREE.Vector3(camera.x, camera.y, camera.z).sub(p).normalize();
  const best = Math.sqrt(1 - tip.dot(toCamera) ** 2);
  expect(Math.abs(faceOf(arrow).dot(toCamera))).toBeCloseTo(best, 2);
};

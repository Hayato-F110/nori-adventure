// NORI-33（docs/game-rules.md「目指すものと迷子の手がかり」の「矢印の起こす角」）：ステージ4・5の行き先の矢印。
// 形はステージ1の矢印（courseView.ts）と同じ座標を写す（ステージ1のコードは変えない。R4-33-F）。
// 向け方：先（部品の −Z）を、上から見た yaw の向きへ、水平から GUIDE.arrowLift だけ上げる。
// 平たい面（部品の +Y）は、先の向きを軸に回して、いちばんカメラの方へ向ける（横を指しても細い線にならない）。
// 光に左右されない色（トーンマッピングなし）。霧はほかの物と同じく受ける。揺らさない。
import * as THREE from "three";
import { GUIDE } from "../config";

type P3 = { x: number; y: number; z: number };

export type GuideArrow = {
  /** 名前 "guide-arrow"。この部品の −Z が先、+Y が面 */
  root: THREE.Group;
  /** 位置 at に置き、yaw（0 で −Z、atan2(−dx, −dz)）を指し、面を camera へ向ける */
  place(at: P3, yaw: number, camera: P3): void;
};

/** ステージ1の矢印と同じ形（先が +Y の平たい形を、厚さ 0.15 m で押し出す） */
const arrowGeometry = () => {
  const shape = new THREE.Shape();
  shape.moveTo(0, 1.1); // 先
  shape.lineTo(0.9, 0.1);
  shape.lineTo(0.35, 0.1);
  shape.lineTo(0.35, -0.9);
  shape.lineTo(-0.35, -0.9);
  shape.lineTo(-0.35, 0.1);
  shape.lineTo(-0.9, 0.1);
  shape.closePath();
  return new THREE.ExtrudeGeometry(shape, {
    depth: 0.15,
    bevelEnabled: true,
    bevelSize: 0.05,
    bevelThickness: 0.05,
    bevelSegments: 1,
  });
};

export const createGuideArrow = (color: THREE.ColorRepresentation): GuideArrow => {
  const root = new THREE.Group();
  root.name = "guide-arrow";
  const flat = new THREE.Mesh(
    arrowGeometry(),
    new THREE.MeshBasicMaterial({ color, toneMapped: false, side: THREE.DoubleSide }),
  );
  // 形の +Y（先）を −Z へ、押し出しの向き（面）を +Y へ寝かせる
  flat.rotation.x = -Math.PI / 2;
  root.add(flat);

  const tip = new THREE.Vector3();
  const face = new THREE.Vector3();
  const side = new THREE.Vector3();
  const back = new THREE.Vector3();
  const basis = new THREE.Matrix4();
  return {
    root,
    place(at, yaw, camera) {
      root.position.set(at.x, at.y, at.z);
      const lift = GUIDE.arrowLift;
      tip.set(-Math.sin(yaw) * Math.cos(lift), Math.sin(lift), -Math.cos(yaw) * Math.cos(lift));
      // 面の向き：カメラへの向きから、先の向きの成分を除く（先に直角で、カメラにいちばん近い向き）
      face.set(camera.x - at.x, camera.y - at.y, camera.z - at.z).normalize();
      face.addScaledVector(tip, -face.dot(tip));
      // カメラが先の真正面・真後ろにいるときは、真上を基準にする
      if (face.lengthSq() < 1e-8) face.set(0, 1, 0).addScaledVector(tip, -tip.y);
      face.normalize();
      back.copy(tip).negate(); // 部品の +Z
      side.crossVectors(face, back); // 部品の +X ＝ +Y × +Z
      basis.makeBasis(side, face, back);
      root.quaternion.setFromRotationMatrix(basis);
    },
  };
};

/**
 * E2E の読み取り口 guideArrow 用（NORI-33 の一覧 16）：描いている矢印の部品の世界の位置と、
 * 親を含めて見えているか。矢印がなければ null
 */
export const guideArrowInfo = (
  root: THREE.Object3D,
): { visible: boolean; x: number; y: number; z: number } | null => {
  const arrow = root.getObjectByName("guide-arrow");
  if (arrow === undefined) return null;
  let visible = true;
  arrow.traverseAncestors((o) => {
    visible &&= o.visible;
  });
  visible &&= arrow.visible;
  arrow.updateWorldMatrix(true, false);
  const p = arrow.getWorldPosition(new THREE.Vector3());
  return { visible, x: p.x, y: p.y, z: p.z };
};

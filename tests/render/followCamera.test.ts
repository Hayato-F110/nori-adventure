import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { CAMERA } from "../../src/config";
import { createFollowCamera } from "../../src/render/followCamera";

// docs/game-rules.md「カメラ（追従）」：カメラは建物の中に入らない（NORI-25。11/10 に見つけた不具合）
const wallBehind = (distanceBehind: number) => {
  // 車は (0, 0) で −Z を向く。後ろは +Z。z = distanceBehind から先が建物（厚さ 10 m、高さ 6 m）
  const wall = new THREE.Mesh(new THREE.BoxGeometry(40, 6, 10));
  wall.position.set(0, 3, distanceBehind + 5);
  wall.updateMatrixWorld(true);
  return wall;
};

const insideBox = (p: THREE.Vector3, box: THREE.Object3D) =>
  new THREE.Box3().setFromObject(box).containsPoint(p);

describe("追従カメラと建物", () => {
  const pose = { x: 0, z: 0, heading: 0 };

  it("建物がなければ、決まった距離（後ろ 9 m・高さ 4.5 m）にいる", () => {
    const camera = new THREE.PerspectiveCamera();
    createFollowCamera(camera, CAMERA, []).snap(pose);
    expect(camera.position.z).toBeCloseTo(CAMERA.followDistance, 6);
    expect(camera.position.y).toBeCloseTo(CAMERA.height, 6);
  });

  it("後ろの建物が遠ければ、建物の手前（余白つき）まで寄せる。高さはそのまま", () => {
    const wall = wallBehind(5);
    const camera = new THREE.PerspectiveCamera();
    createFollowCamera(camera, CAMERA, [wall]).snap(pose);
    expect(insideBox(camera.position, wall)).toBe(false);
    expect(camera.position.y).toBeLessThan(CAMERA.blockedHeight);
  });

  it.each([0.6, 1.2, 1.9])(
    "後ろの建物が %s m（最短距離より近い）でも、カメラは建物の中に入らず、上から見下ろす",
    (distance) => {
      const wall = wallBehind(distance);
      const camera = new THREE.PerspectiveCamera();
      const follow = createFollowCamera(camera, CAMERA, [wall]);
      follow.snap(pose);
      expect(insideBox(camera.position, wall), `位置 ${camera.position.toArray().join(", ")}`).toBe(false);
      expect(camera.position.y).toBeCloseTo(CAMERA.blockedHeight, 6);
      // 何フレーム追いかけても、建物の中に入らない
      for (let i = 0; i < 120; i++) {
        follow.update(pose, 1 / 60);
        expect(insideBox(camera.position, wall)).toBe(false);
      }
    },
  );
});

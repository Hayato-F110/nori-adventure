// 追従カメラ。描画だけの処理で、ゲームの状態には影響しない。
import * as THREE from "three";
import type { Pose2D } from "../core/types";

export type FollowCameraConfig = {
  readonly followDistance: number;
  readonly height: number;
  readonly lookAhead: number;
  readonly lookHeight: number;
  readonly followSharpness: number;
  /** 建物の手前に寄せるときの余白 */
  readonly wallPadding: number;
  /** 車からの最短距離 */
  readonly minDistance: number;
  /** 建物の手前に寄せると最短距離より近くなるときに、上げる高さ */
  readonly blockedHeight: number;
};

export const createFollowCamera = (
  camera: THREE.PerspectiveCamera,
  config: FollowCameraConfig,
  obstacles: readonly THREE.Object3D[] = [],
) => {
  const desired = new THREE.Vector3();
  const raycaster = new THREE.Raycaster();
  const pivot = new THREE.Vector3();
  const direction = new THREE.Vector3();

  // 車からカメラへ光線を飛ばし、建物に当たれば、その手前（余白つき）まで寄せる
  const avoidWalls = (pose: Pose2D) => {
    pivot.set(pose.x, config.lookHeight, pose.z);
    direction.subVectors(camera.position, pivot);
    const distance = direction.length();
    if (distance < 1e-6 || obstacles.length === 0) return;
    direction.divideScalar(distance);
    raycaster.set(pivot, direction);
    raycaster.far = distance;
    const hit = raycaster.intersectObjects(obstacles as THREE.Object3D[], false)[0];
    if (hit === undefined) return;
    const allowed = hit.distance - config.wallPadding;
    if (allowed >= config.minDistance) {
      if (allowed < distance) camera.position.copy(pivot).addScaledVector(direction, allowed);
      return;
    }
    // 建物が近すぎる（後ろ向きに壁へ押し付けたときなど）：最短距離を守ると建物の中に入るので、
    // 建物の手前（水平の向きで余白つき）のまま、高く上げて見下ろす
    const horizontal = Math.hypot(direction.x, direction.z);
    const along = horizontal > 1e-6 ? Math.max(0, allowed) * horizontal : 0;
    const hx = horizontal > 1e-6 ? direction.x / horizontal : 0;
    const hz = horizontal > 1e-6 ? direction.z / horizontal : 0;
    camera.position.set(pivot.x + hx * along, config.blockedHeight, pivot.z + hz * along);
  };
  const target = new THREE.Vector3();
  const lookAt = new THREE.Vector3();

  const place = (pose: Pose2D) => {
    const fx = -Math.sin(pose.heading);
    const fz = -Math.cos(pose.heading);
    desired.set(pose.x - fx * config.followDistance, config.height, pose.z - fz * config.followDistance);
    target.set(pose.x + fx * config.lookAhead, config.lookHeight, pose.z + fz * config.lookAhead);
  };

  return {
    /** 最初の1回やワープのあとは、すぐにその位置へ */
    snap(pose: Pose2D) {
      place(pose);
      camera.position.copy(desired);
      avoidWalls(pose);
      lookAt.copy(target);
      camera.lookAt(lookAt);
    },
    update(pose: Pose2D, frameSeconds: number) {
      place(pose);
      // フレームの長さによらず同じ速さで近づく（指数で近づける）
      const t = 1 - Math.exp(-config.followSharpness * frameSeconds);
      camera.position.lerp(desired, t);
      avoidWalls(pose);
      lookAt.lerp(target, t);
      camera.lookAt(lookAt);
    },
  };
};

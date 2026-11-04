// 追従カメラ。描画だけの処理で、ゲームの状態には影響しない。
import * as THREE from "three";
import type { Pose2D } from "../core/types";

export type FollowCameraConfig = {
  readonly followDistance: number;
  readonly height: number;
  readonly lookAhead: number;
  readonly lookHeight: number;
  readonly followSharpness: number;
};

export const createFollowCamera = (camera: THREE.PerspectiveCamera, config: FollowCameraConfig) => {
  const desired = new THREE.Vector3();
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
      lookAt.copy(target);
      camera.lookAt(lookAt);
    },
    update(pose: Pose2D, frameSeconds: number) {
      place(pose);
      // フレームの長さによらず同じ速さで近づく（指数で近づける）
      const t = 1 - Math.exp(-config.followSharpness * frameSeconds);
      camera.position.lerp(desired, t);
      lookAt.lerp(target, t);
      camera.lookAt(lookAt);
    },
  };
};

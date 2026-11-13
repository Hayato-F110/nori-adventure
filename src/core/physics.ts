// 建物・木との当たり判定（Rapier）。docs/game-rules.md「ぶつかったとき・やり直し」。
//
// Rapier の世界には「状態を持たせない」：建物と木は動かないコライダー。車は毎刻み、ゲーム状態の位置に
// コライダーを置き直し、キャラクターコントローラーで「ぶつかったあとの移動量」だけを問い合わせる。
// こうすると、ゲーム状態（CarState）だけで結果が決まり、同じ入力 → 同じ結果になる（リプレイ・対戦に使える）。
import RAPIER from "@dimforge/rapier3d-compat";
import { CAR, PHYSICS } from "../config";
import { stepCar, type BoundsConfig, type CarConfig } from "./car";
import type { Stage1Layout } from "./stage1Layout";
import type { CarState, InputFrame, Pose2D } from "./types";

/**
 * 動く物（ほかの車・自転車・バイク・人。NORI-61）の上から見た形。数と形は最初に決め、刻みごとに位置と向きだけ置き直す。
 * box は向きのある長方形（halfLength が前後）、circle は円
 */
export type MoverShape =
  | { readonly kind: "box"; readonly halfWidth: number; readonly halfLength: number }
  | { readonly kind: "circle"; readonly radius: number };

export type CarCollisionConfig = CarConfig & {
  readonly collisionRadius: number;
  readonly bumpSpeedFactor: number;
};

export type PhysicsConfig = {
  /** コントローラーが障害物との間に残す、すき間 */
  readonly contactOffset: number;
  /** この距離まで近づいたら「触れている」とみなす（壁ぞいに走るとき、触れた・離れたをくり返さないため） */
  readonly touchMargin: number;
  /** コライダーの上下の大きさ（上から見た当たり判定には影響しない） */
  readonly carHalfHeight: number;
};

export type CarPhysics = {
  step(
    state: CarState,
    input: InputFrame,
    dt: number,
    car: CarCollisionConfig,
    bounds: BoundsConfig,
    /** 動く物のこの刻みの位置と向き（createCarPhysics の movers と同じ順。なければ動く物は置かない） */
    moverPoses?: readonly Pose2D[],
  ): CarState;
};

let ready: Promise<void> | null = null;
/** Rapier の WASM の読み込みは1回だけ */
const initRapier = (): Promise<void> => (ready ??= RAPIER.init());

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

export const createCarPhysics = async (
  layout: Stage1Layout,
  config: PhysicsConfig = PHYSICS,
  carRadius: number = CAR.collisionRadius,
  movers: readonly MoverShape[] = [],
): Promise<CarPhysics> => {
  await initRapier();
  const world = new RAPIER.World({ x: 0, y: 0, z: 0 });
  const y = config.carHalfHeight;

  for (const b of layout.buildings) {
    world.createCollider(
      RAPIER.ColliderDesc.cuboid(b.halfWidth, b.height / 2, b.halfDepth).setTranslation(
        b.x,
        b.height / 2,
        b.z,
      ),
    );
  }
  for (const t of layout.trees) {
    world.createCollider(RAPIER.ColliderDesc.cylinder(y * 2, t.radius).setTranslation(t.x, y * 2, t.z));
  }
  // 動く物：はじめは遠く（走れる範囲の外）に置き、刻みごとに置き直す
  const PARKED = 1e4;
  const moverColliders = movers.map((m) =>
    world.createCollider(
      (m.kind === "box"
        ? RAPIER.ColliderDesc.cuboid(m.halfWidth, y * 2, m.halfLength)
        : RAPIER.ColliderDesc.cylinder(y * 2, m.radius)
      ).setTranslation(PARKED, y * 2, PARKED),
    ),
  );
  const placeMovers = (poses: readonly Pose2D[] | undefined): void => {
    if (moverColliders.length === 0) return;
    if (poses && poses.length !== moverColliders.length) {
      throw new Error(`動く物の位置の数（${poses.length}）が形の数（${moverColliders.length}）と違う`);
    }
    moverColliders.forEach((c, i) => {
      const p = poses?.[i] ?? { x: PARKED, z: PARKED, heading: 0 };
      c.setTranslation({ x: p.x, y: y * 2, z: p.z });
      // +Y まわりに heading だけ回す（heading 0 で −Z を向く。箱の前後は z）
      c.setRotation({ x: 0, y: Math.sin(p.heading / 2), z: 0, w: Math.cos(p.heading / 2) });
    });
    // 問い合わせの仕組み（broad-phase）を新しい位置で更新する。物体はないので何も動かない（rapier.js 0.18.0 の変更履歴）
    world.step();
  };

  const carCollider = world.createCollider(
    RAPIER.ColliderDesc.cylinder(y, carRadius).setTranslation(0, y, 0),
  );
  const touchShape = new RAPIER.Cylinder(y, carRadius + config.touchMargin);
  const noRotation = { x: 0, y: 0, z: 0, w: 1 };

  const controller = world.createCharacterController(config.contactOffset);
  controller.setSlideEnabled(true);
  controller.disableAutostep();
  controller.disableSnapToGround();
  controller.setApplyImpulsesToDynamicBodies(false);

  // 問い合わせに使う構造（広域の当たり判定）を、追加したコライダーで更新する。物は何も動かない
  world.step();

  const isNearObstacle = (x: number, z: number): boolean => {
    let near = false;
    world.intersectionsWithShape(
      { x, y, z },
      noRotation,
      touchShape,
      () => {
        near = true;
        return false; // 1つ見つかれば十分
      },
      undefined,
      undefined,
      carCollider,
    );
    return near;
  };

  return {
    step(state, input, dt, car, bounds, moverPoses) {
      placeMovers(moverPoses);
      // 1. 障害物がないとしたときの動き（加速・ハンドル・見えない柵）
      const free = stepCar(state, input, dt, car, bounds);
      const desired = { x: free.x - state.x, y: 0, z: free.z - state.z };

      // 2. Rapier で、ぶつかったあとに実際に動ける量を求める（ななめなら建物に沿って滑る）
      carCollider.setTranslation({ x: state.x, y, z: state.z });
      controller.computeColliderMovement(carCollider, desired);
      const moved = controller.computedMovement();
      const limit = bounds.boundsHalfSize;
      const x = clamp(state.x + moved.x, -limit, limit);
      const z = clamp(state.z + moved.z, -limit, limit);

      // 3. 速度：当たった瞬間に1回だけ落とし、触れている間は「動けた割合」を上限にする
      const touching = controller.numComputedCollisions() > 0 || isNearObstacle(x, z);
      let speed = free.speed;
      if (touching && !state.touching) speed *= car.bumpSpeedFactor;
      if (touching) {
        const wanted = Math.hypot(desired.x, desired.z);
        const ratio = wanted > 1e-9 ? Math.min(1, Math.hypot(moved.x, moved.z) / wanted) : 1;
        speed = clamp(speed, -car.maxReverseSpeed * ratio, car.maxForwardSpeed * ratio);
      }

      return { ...free, x, z, speed, touching };
    },
  };
};

// ゲームのルールの数値。docs/game-rules.md と同じ値にする（tests/config/rules-sync.test.ts で確認）。
// ここ以外のゲームロジックに数値を直書きしない。

/** シミュレーション共通 */
export const SIM = {
  fixedDt: 1 / 60,
  maxStepsPerFrame: 5,
} as const;

/** ステージ1の車 */
export const CAR = {
  maxForwardSpeed: 12,
  maxReverseSpeed: 4,
  acceleration: 6,
  brakeDeceleration: 14,
  coastDeceleration: 4,
  maxTurnRate: 1.8,
  fullTurnSpeed: 4,
  steerResponse: 6,
  collisionRadius: 1.0,
  bumpSpeedFactor: 0.3,
} as const;

/** ステージ1のコース */
export const STAGE1 = {
  groundSize: 200,
  boundsHalfSize: 90,
  start: { x: 0, z: 0, heading: 0 },
  starCount: 20,
  starPickupRadius: 1.5,
  checkpointCount: 3,
  checkpointRadius: 6,
  roadSpacing: 40,
  roadWidth: 10,
  buildingMargin: 2,
  buildingMinSize: 6,
  buildingMaxSize: 12,
  buildingMinHeight: 4,
  buildingMaxHeight: 18,
  buildingsPerBlockMin: 2,
  buildingsPerBlockMax: 4,
  treeTrunkRadius: 0.4,
} as const;

/** やり直し */
export const RESPAWN = {
  stuckSeconds: 2,
  invincibleSeconds: 2.0,
} as const;

/** 追従カメラ（描画だけ。状態には影響しない） */
export const CAMERA = {
  followDistance: 9,
  height: 4.5,
  lookAhead: 3,
  lookHeight: 1,
  followSharpness: 4,
  fov: 60,
  wallPadding: 0.5,
  minDistance: 2,
} as const;

/** 補助機能。初期値はすべてオフ（隠れた補正を入れない） */
export const ASSIST = {
  steerToRoad: false,
} as const;

export const CONFIG = { SIM, CAR, STAGE1, RESPAWN, CAMERA, ASSIST } as const;

// ゲームのルールの数値。docs/game-rules.md と同じ値にする（tests/config/rules-sync.test.ts で確認）。
// ここ以外のゲームロジックに数値を直書きしない。

/** シミュレーション共通 */
export const SIM = {
  fixedDt: 1 / 60,
  maxStepsPerFrame: 5,
} as const;

/** 当たり判定（Rapier） */
export const PHYSICS = {
  contactOffset: 0.01,
  touchMargin: 0.1,
  carHalfHeight: 0.75,
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
  checkpointRadius: 8,
  /** コースの道すじ（道の中心線の角の点）。先頭がスタート、2〜4番目がチェックポイント、最後がゴール */
  route: [
    { x: 0, z: 0 },
    { x: 0, z: -80 },
    { x: 80, z: -80 },
    { x: 80, z: 40 },
    { x: 0, z: 40 },
  ],
  starStart: 3,
  starSpacing: 18,
  starHeight: 1.0,
  guideArrowHeight: 4.5,
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
  blinkMs: 250,
  stuckSpeed: 0.3,
  stuckThrottle: 0.5,
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
  blockedHeight: 10,
} as const;

// ---- ステージ2〜5（最初の案。各ステージを作るときに、テストプレイで見直す） ----

/** ステージ2の列車（線路に沿って進む。すすむ・とまるだけ） */
export const TRAIN = {
  maxForwardSpeed: 10,
  maxReverseSpeed: 3,
  acceleration: 3,
  brakeDeceleration: 6,
  coastDeceleration: 1.5,
} as const;

/** ステージ2の山道 */
export const STAGE2 = {
  trackLength: 600,
  stationCount: 3,
  stationStopLength: 12,
  stationStopSpeed: 0.5,
  stationWaitSeconds: 2,
  /** 線路の制御点（x, 高さ y, z。m）。閉じた Catmull-Rom 曲線で通る。長さ約 599 m */
  trackPoints: [
    { x: 0, y: 0, z: -79.2 },
    { x: 69.3, y: 2, z: -69.3 },
    { x: 108.9, y: 4, z: -9.9 },
    { x: 89.1, y: 7, z: 49.5 },
    { x: 19.8, y: 9, z: 79.2 },
    { x: -59.4, y: 7, z: 69.3 },
    { x: -103.95, y: 4, z: 14.85 },
    { x: -79.2, y: 2, z: -54.45 },
  ],
  trackTolerance: 0.01,
  maxSlope: 0.05,
  minCurveRadius: 30,
  stations: [150, 300, 480],
  startDistance: 0,
  cameraDistance: 12,
  cameraHeight: 6,
} as const;

/** ステージ3の飛行機（手を離すと自動で水平に戻る） */
export const PLANE = {
  cruiseSpeed: 14,
  minSpeed: 9,
  maxSpeed: 20,
  speedChange: 4,
  maxBank: 0.6,
  maxTurnRate: 0.8,
  maxPitch: 0.5,
  attitudeRate: 1.2,
  autoLevelRate: 1.0,
  minAltitude: 3,
  maxAltitude: 80,
  collisionRadius: 1.5,
  bumpSpeedFactor: 0.5,
} as const;

/** ステージ3の空 */
export const STAGE3 = {
  boundsHalfSize: 300,
  ringCount: 10,
  ringRadius: 6,
  ringSpacing: 70,
} as const;

/** ステージ4の潜水艇 */
export const SUB = {
  maxForwardSpeed: 5,
  maxReverseSpeed: 2,
  acceleration: 2,
  coastDeceleration: 1.5,
  turnRate: 1.2,
  verticalSpeed: 2,
  collisionRadius: 1.2,
  bumpSpeedFactor: 0.3,
} as const;

/** ステージ4の海（光と霧） */
export const STAGE4 = {
  boundsHalfSize: 120,
  maxDepth: 40,
  fogNear: 6,
  fogFar: 40,
  lightRange: 25,
  lightAngle: 0.6,
  minAmbient: 0.35,
  creatureCount: 6,
  discoverRadius: 8,
  treasureRadius: 3,
} as const;

/** ステージ5のローバー（月の重力でジャンプ） */
export const ROVER = {
  maxForwardSpeed: 8,
  maxReverseSpeed: 3,
  acceleration: 4,
  brakeDeceleration: 10,
  coastDeceleration: 2,
  maxTurnRate: 1.6,
  gravity: 1.62,
  jumpSpeed: 3,
  collisionRadius: 1.0,
  bumpSpeedFactor: 0.3,
} as const;

/** ステージ5の月面 */
export const STAGE5 = {
  boundsHalfSize: 100,
  starCount: 12,
  arenaRadius: 30,
} as const;

/** ステージ5のボス（倒すのではなく、なかよしの星で落ち着かせる）。回数による調整はしない */
export const BOSS = {
  calmPoints: 5,
  friendStarCount: 8,
  friendStarRespawnSeconds: 10,
  carryLimit: 1,
  deliverRadius: 4,
  moveSpeed: 2,
  rockInterval: 5,
  rockSpeed: 4,
  rockBumpSpeedFactor: 0.3,
} as const;

/** 入力（全ステージ共通）。キーボード・タッチ・ゲームパッドを InputFrame に直すときの数値 */
export const INPUT = {
  touchButtonSize: 96,
  touchGoButtonSize: 120,
  touchSteerRange: 80,
  touchSteerDeadzone: 8,
  stickDeadzone: 0.2,
} as const;

/** 3D モデル（アセット）。tools/assets/ の検査とゲームの読み込みで使う（NORI-18） */
export const ASSET = {
  maxGlbBytes: 524288,
  maxTriangles: 8000,
  sizeTolerance: 0.1,
  maxWheelSteer: 0.5,
  maxTotalGlbBytes: 2621440,
  carSize: { width: 1.8, height: 1.7, length: 3.4 },
  carNodes: ["body", "wheel_FL", "wheel_FR", "wheel_RL", "wheel_RR"],
  /** 車のほかの4台（NORI-20〜23）。向き・原点は車と同じ。propellerAt はプロペラの付く側 */
  vehicles: {
    train: {
      size: { width: 2.2, height: 2.6, length: 6.0 },
      nodes: ["body", "wheel_FL", "wheel_FR", "wheel_RL", "wheel_RR"],
    },
    plane: {
      size: { width: 4.4, height: 1.4, length: 3.6 },
      nodes: ["body", "propeller"],
      propellerAt: "front",
    },
    sub: {
      size: { width: 1.8, height: 1.8, length: 3.2 },
      nodes: ["body", "propeller", "light"],
      propellerAt: "rear",
    },
    rover: {
      size: { width: 2.0, height: 1.6, length: 2.8 },
      nodes: ["body", "wheel_FL", "wheel_FR", "wheel_RL", "wheel_RR"],
    },
  },
  allowedExtensions: [
    "KHR_materials_emissive_strength",
    "KHR_materials_ior",
    "KHR_materials_specular",
    "KHR_materials_unlit",
    "KHR_texture_transform",
    "KHR_mesh_quantization",
  ],
} as const;

/** 補助機能。初期値はすべてオフ（隠れた補正を入れない） */
export const ASSIST = {
  steerToRoad: false,
} as const;

/** 見た目（リアル寄り。NORI-56）。tint は素材の色にかける色（線形の RGB） */
export const LOOK = {
  textureSize: 512,
  maxTextureBytes: 262144,
  hdriWidth: 512,
  maxHdriBytes: 1048576,
  maxTotalBytes: 4194304,
  exposure: 1.0,
  environmentIntensity: 0.7,
  surfaces: {
    grass: { texture: "Grass004", tileMeters: 2.5, tint: [0.6, 1.0, 0.35] },
    road: { texture: "Asphalt031", tileMeters: 4, tint: [0.2, 0.21, 0.24] },
    brick: { texture: "Facade018A", tileMeters: 13, tint: [1, 1, 1] },
    facade: { texture: "Facade006", tileMeters: 12, tint: [1, 1, 1] },
  },
  lowFps: 40,
  lowFpsSeconds: 3,
  minStarContrast: 3,
  minRoadGrassContrast: 1.5,
  targetFps: 55,
  throttledFps: 30,
  cpuThrottle: 4,
  lightmapSize: 1024,
  maxLightmapBytes: 524288,
  aoDistance: 6,
  bakeSamples: 64,
  aoIntensity: 1.0,
  aoDirect: 0.5,
  /** 空と地面の光の強さ：単色のとき・素材を貼ったとき（HDRI のまわりの光が入るので弱める） */
  hemiPlain: 1.4,
  hemiTextured: 0.5,
  /** 低画質のときの画素の倍率 */
  lowPixelRatio: 1,
  /** テクスチャの異方性フィルタの上限（斜めから見た道がぼやけないように） */
  maxAnisotropy: 4,
  /** 色（16進の文字列）。ほし・道の明るさの比（minStarContrast）はこれらで決まる */
  starColor: "#ffd23f",
  starEmissive: "#e0a800",
  plainRoadColor: "#3a3e48",
  /** 道の白線：幅と、道の端からの距離（中央線は引かない。ほしとまぎれるため） */
  roadLineWidth: 0.25,
  roadLineInset: 0.6,
  /** 素材を貼るのは、最初の画質の判定（lowFpsSeconds）が済んでから。読み込み直後の何秒を FPS に数えないか */
  settleSeconds: 1,
} as const;

export const CONFIG = {
  SIM,
  PHYSICS,
  CAR,
  STAGE1,
  TRAIN,
  STAGE2,
  PLANE,
  STAGE3,
  SUB,
  STAGE4,
  ROVER,
  STAGE5,
  BOSS,
  RESPAWN,
  CAMERA,
  INPUT,
  ASSET,
  ASSIST,
  LOOK,
} as const;

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
  // ---- 景色と列車を増やす（NORI-59） ----
  /** 子どもが選べる列車（GLB の名前）。速さ・操作は3つとも同じ（見た目だけ） */
  trainChoices: ["train", "train-commuter", "train-bullet"],
  /** 列車を選ぶボタンの大きさ（px） */
  choiceButtonSize: 96,
  /** すれ違う電車の線路（線路の左、m） */
  passingOffset: 4.2,
  /** すれ違う電車の速さ（m/s。逆向き） */
  passingSpeed: 8,
  /** すれ違う電車の、時刻 0 の線路の上の距離（m） */
  passingStart: 300,
  /** 海辺：z がこれより大きい所が砂浜、その先が海（m） */
  seaFromZ: 105,
  beachWidth: 20,
  /** 富士山風の山（遠景。霧を効かせず、空の色をまぜる） */
  bigMountain: {
    x: -60,
    z: -400,
    radius: 150,
    height: 120,
    snowFraction: 0.3,
    hazeTop: 0.35,
    hazeBottom: 0.7,
  },
  cloudCount: 10,
  cloudMinHeight: 50,
  cloudMaxHeight: 70,
} as const;

/** ステージ3の飛行機（手を離すと自動で水平に戻る） */
export const PLANE = {
  cruiseSpeed: 14,
  minSpeed: 9,
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
  /** 輪10個とゴール1個を、ringSpacing ずつ円の上に（770 m ÷ 2π） */
  ringPathRadius: 122.5,
  ringBaseHeight: 25,
  ringHeightWave: 10,
  goalRingRadius: 10,
  /** スタートは、ゴールの輪からこの距離だけ先（円の上） */
  startAfterGoal: 20,
  /** 山（円すい。x・z は底の中心、radius は底の半径） */
  mountains: [
    { x: 0, z: 0, radius: 40, height: 60 },
    { x: 205, z: 20, radius: 35, height: 55 },
    { x: -175, z: 125, radius: 35, height: 70 },
    { x: -150, z: -175, radius: 30, height: 50 },
    { x: 110, z: -200, radius: 35, height: 65 },
  ],
  /** 気球（球。動かない） */
  balloons: [
    { x: 130, y: 30, z: 90, radius: 4 },
    { x: -60, y: 20, z: 60, radius: 4 },
    { x: -40, y: 35, z: -150, radius: 4 },
  ],
  cameraDistance: 10,
  cameraHeight: 3,
  // ---- 空をにぎやかに（NORI-60）。どれも景色だけで、当たり判定はない。動きは時刻だけで決まる ----
  /** ほかの飛行機（中心のまわりの円。dir は 1 で左回り、-1 で右回り。phase は時刻 0 の角度 rad。color は機体の色） */
  otherPlanes: [
    { radius: 165, height: 46, dir: 1, phase: 0.5, color: "#f4f4f0" },
    { radius: 260, height: 48, dir: -1, phase: 2.6, color: "#ffc93c" },
    { radius: 280, height: 44, dir: 1, phase: 4.4, color: "#4caf7a" },
  ],
  /** ほかの飛行機の速さ（m/s） */
  otherPlaneSpeed: 10,
  /** ただよう気球（中心の位置。上下にゆれる） */
  driftBalloons: [
    { x: 60, y: 30, z: -40, color: "#ff5d8f" },
    { x: -200, y: 40, z: -40, color: "#3fb6ff" },
    { x: 170, y: 45, z: 120, color: "#ffd23f" },
    { x: 20, y: 36, z: 195, color: "#7ad35a" },
  ],
  /** ただよう気球の大きさ（球の半径 m） */
  driftBalloonRadius: 4,
  /** 上下のゆれの幅（中心から上・下へ m） */
  driftBob: 3,
  /** 上下のゆれの1往復の時間（s） */
  driftPeriod: 20,
  /** 鳥の群れ（円の中心と高さ） */
  birdFlocks: [
    { x: -60, y: 40, z: -20 },
    { x: 180, y: 38, z: -80 },
    { x: -110, y: 36, z: 195 },
    { x: 40, y: 44, z: -220 },
  ],
  /** 1つの群れの鳥の数 */
  birdsPerFlock: 6,
  /** 群れが回る円の半径（m） */
  birdCircleRadius: 20,
  /** 鳥の速さ（m/s） */
  birdSpeed: 8,
  /** 羽ばたきの回数（1秒に） */
  birdFlapHz: 3,
  /** 羽の角度の最大（rad） */
  birdFlapAngle: 0.5,
  /** 羽の片側の長さ（m） */
  birdWingSpan: 1.2,
  /** 群れの中の鳥と鳥の間（円の上の角度 rad） */
  birdGap: 0.22,
  /** 山のふもとの木（山1つあたり） */
  treesPerMountain: 12,
  /** 木を置く場所：山の底の端から外へ、この距離の間（m） */
  treeRingMin: 4,
  treeRingMax: 16,
  /** 木の大きさの倍率（木の高さは 4 m × 倍率） */
  treeScaleMin: 1.5,
  treeScaleMax: 2.5,
  /** 景色の物と、輪・ゴールの中心との最も近い距離（m）。輪と空の明るさの比を測る場所をふさがない */
  sceneryClearance: 30,
} as const;

/** ステージ4の潜水艇（NORI-28。ステージ3と同じ操作：←→ で曲がる、↑↓ で上下、速さは一定） */
export const SUB = {
  cruiseSpeed: 4,
  minSpeed: 2,
  speedChange: 1,
  turnRate: 0.8,
  verticalSpeed: 2,
  /** 見た目の機首の上下（rad。見た目だけ） */
  maxTilt: 0.3,
  tiltRate: 0.6,
  /** いちばん浅い深さ（海面の下 m） */
  minDepth: 1.5,
  collisionRadius: 1.2,
  bumpSpeedFactor: 0.5,
} as const;

/** ステージ4の海（光と霧）。深さは海面（y = 0）からの下向きの距離。y = −depth */
export const STAGE4 = {
  boundsHalfSize: 120,
  maxDepth: 40,
  /** スタート（−Z の向き） */
  start: { x: 0, z: 100, depth: 6 },
  /** たからばこ（ゴール）の中心 */
  treasure: { x: 0, z: -90, depth: 39.4 },
  treasureRadius: 3,
  /** たからばこの金色の明るさ（倍。1 より大きいと、霧で薄まっても明るく残る。霧の遠い端では見えなくなる） */
  treasureGlow: 3,
  hintCount: 8,
  hintWave: 15,
  /** いちばん遠い手がかりのあわの数。たからばこに近いほど 1 個ずつ多い */
  hintBubbles: 3,
  creatureCount: 6,
  /** 生きもの：円（中心 x・z・深さ、半径 m）の上を、1周 seconds 秒で回る。phase は始めの角度（rad） */
  creatures: [
    { kind: "turtle", x: 18, z: 70, depth: 10, radius: 6, seconds: 30, phase: 0 },
    { kind: "ray", x: -2, z: 40, depth: 16, radius: 8, seconds: 36, phase: 1.5 },
    { kind: "jellyfish", x: 22, z: 5, depth: 20, radius: 3, seconds: 40, phase: 3 },
    { kind: "octopus", x: -18, z: -25, depth: 36, radius: 2, seconds: 30, phase: 0.5 },
    { kind: "tropical", x: 5, z: -50, depth: 30, radius: 5, seconds: 20, phase: 2 },
    { kind: "dolphin", x: -15, z: -70, depth: 26, radius: 10, seconds: 24, phase: 4 },
  ],
  discoverRadius: 8,
  /** 岩（海底の球。中心 x・z、半径 m。中心は海底） */
  rocks: [
    { x: -32, z: 70, radius: 6 },
    { x: 35, z: 30, radius: 7 },
    { x: -35, z: -10, radius: 6 },
    { x: 35, z: -30, radius: 5 },
    { x: -30, z: -60, radius: 7 },
  ],
  schoolCount: 5,
  schoolSize: 12,
  fogNear: 6,
  fogFar: 40,
  lightRange: 25,
  lightAngle: 0.6,
  minAmbient: 0.35,
  cameraDistance: 8,
  cameraHeight: 2.5,
  /** 色（16進の文字列）。たからばこ・あわと、まわりの明るさの比はこれらで決まる */
  waterShallowColor: "#2f8fc0",
  waterDeepColor: "#0d3a5c",
  treasureColor: "#ffc93c",
  treasureLidColor: "#ffb21f",
  sandColor: "#8f7f5e",
  bubbleColor: "#bff4ff",
  schoolColors: ["#ffd23f", "#4fc3f7", "#ff7043", "#ba68c8", "#c0ca33"],
  /** 手がかりのあわ：半径 m、散らばり ±m、のぼる速さ m/s、のぼる高さ m（そのあと下からまた） */
  bubbleRadius: 0.25,
  bubbleSpread: 1,
  bubbleRiseSpeed: 1.6,
  bubbleRiseHeight: 4,
  /** 光の強さ：海面からの光（浅いところ）、潜水艇のライト、たからばこの光（強さと届く距離 m） */
  sunIntensity: 1.6,
  spotIntensity: 60,
  treasureLightIntensity: 30,
  treasureLightRange: 14,
  /** 生きものが自ら光る量（自分の色の何倍。色が分かる程度に少しだけ。NORI-62） */
  creatureGlow: 3,
  /**
   * まだ見つけていない生きもののまわりの「きらきら」（光に左右されない色。見つけたら消えて星になる。NORI-62）：
   * 色、数、大きさ m、生きものの端からのすき間 m、1周の秒
   */
  sparkleColor: "#fffbe0",
  /** きらきらの明るさ（倍。1 より大きいと、霧で薄まっても白く残る。霧の遠い端では見えない） */
  sparkleGlow: 3,
  sparkleCount: 6,
  sparkleSize: 0.35,
  sparkleGap: 0.6,
  sparkleTurnSeconds: 6,
  /** 見つけた印の星：大きさ m、生きものの上のすき間 m */
  foundStarSize: 0.4,
  foundStarGap: 0.8,
  /** ゴールしたら、ふたが開くまでの秒と角度（ラジアン） */
  lidOpenSeconds: 1,
  lidOpenAngle: 1.9,
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
  /** ジャンプ台で跳ぶのは、前へこの速さ（m/s）以上のときだけ（台の上で止まって跳び続けない） */
  jumpMinSpeed: 1,
  collisionRadius: 1.0,
  bumpSpeedFactor: 0.3,
} as const;

/** ステージ5の月面。道すじは進んだ距離 d の点 (pathWave·sin(2π·d/pathLength), start.z − d) */
export const STAGE5 = {
  boundsHalfSize: 100,
  start: { x: 0, z: 85 },
  pathLength: 110,
  pathWave: 12,
  pathWidth: 6,
  /** ジャンプ台（道すじの d、m） */
  jumpPads: [30, 70],
  jumpPadRadius: 2.5,
  /** 地面のほし（道すじの d、m。高さ 0） */
  groundStars: [6, 13, 20, 64, 102, 107],
  /** 空中のほし（台ごと）：台の中心から、台での道すじの向きにまっすぐ ahead m 先、高さ height m */
  airStars: [
    { ahead: 8, height: 2.2 },
    { ahead: 14.8, height: 2.8 },
    { ahead: 21.6, height: 2.2 },
  ],
  starRadius: 2,
  /** 景色の岩（半球。上から見た中心と半径 m）。道すじから 8 m 以上離す */
  rocks: [
    { x: -25, z: 70, radius: 2 },
    { x: 30, z: 80, radius: 2 },
    { x: 24, z: 45, radius: 2.5 },
    { x: -28, z: 20, radius: 3 },
    { x: 26, z: 0, radius: 1.5 },
    { x: -22, z: -10, radius: 2 },
  ],
  /** クレーター（見た目だけ。当たり判定なし） */
  craters: [
    { x: 40, z: 60, radius: 6 },
    { x: -45, z: 40, radius: 8 },
    { x: 50, z: 10, radius: 5 },
    { x: -40, z: -5, radius: 6 },
    { x: 60, z: -50, radius: 9 },
    { x: -60, z: -60, radius: 7 },
    { x: -55, z: 85, radius: 5 },
    { x: 45, z: -85, radius: 6 },
  ],
  arenaCenter: { x: 0, z: -55 },
  arenaRadius: 30,
} as const;

/** ステージ5のボス（倒すのではなく、なかよしの星で落ち着かせる）。回数による調整はしない */
export const BOSS = {
  radius: 3,
  height: 6,
  /** 広場の中心から、この半径の円を回る（最初は中心から −Z 側。上から見て左回り） */
  orbitRadius: 10,
  moveSpeed: 2,
  calmPoints: 5,
  friendStarCount: 8,
  friendStarRing: 22,
  friendStarHeight: 1,
  friendStarRespawnSeconds: 10,
  carryLimit: 1,
  /** ボスの中心からの距離（m） */
  deliverRadius: 7,
  rockInterval: 5,
  rockWarnSeconds: 1,
  rockSpeed: 4,
  rockRadius: 1,
  rockBumpSpeedFactor: 0.3,
  rockInvincibleSeconds: 2,
  angryColor: "#E8604C",
  calmColor: "#7FD1FF",
  endingDelaySeconds: 3,
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
    /** NORI-59：子どもが選べる列車（ふつうの電車・新幹線風）。速さ・操作は今の列車と同じ */
    "train-commuter": {
      size: { width: 2.2, height: 2.8, length: 7.0 },
      nodes: ["body", "wheel_FL", "wheel_FR", "wheel_RL", "wheel_RR"],
    },
    "train-bullet": {
      size: { width: 2.2, height: 2.4, length: 8.0 },
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
  /** 木（NORI-26）。ステージ1・2で共通。2種類の形を向きを変えて並べる。部品は幹と葉 */
  tree: {
    variants: ["tree-a", "tree-b"],
    size: { width: 3, height: 4, length: 3 },
    nodes: ["trunk", "leaves"],
    maxTriangles: 800,
    maxGlbBytes: 262144,
  },
  /** 海の生きもの（NORI-28）。前は −Z、原点は底の中心。名前は STAGE4.creatures の kind に sea- を付けたもの */
  sea: {
    variants: [
      "sea-turtle",
      "sea-ray",
      "sea-jellyfish",
      "sea-octopus",
      "sea-tropical",
      "sea-dolphin",
      "sea-fish",
    ],
    sizes: {
      "sea-turtle": { width: 2, height: 0.8, length: 2.4 },
      "sea-ray": { width: 3.6, height: 0.5, length: 4 },
      "sea-jellyfish": { width: 1.6, height: 2.4, length: 1.6 },
      "sea-octopus": { width: 2.2, height: 1.8, length: 2.2 },
      "sea-tropical": { width: 0.5, height: 1, length: 1.4 },
      "sea-dolphin": { width: 1.4, height: 1.4, length: 4 },
      "sea-fish": { width: 0.3, height: 0.45, length: 0.8 },
    },
    nodes: ["body"],
    maxTriangles: 1500,
    maxGlbBytes: 131072,
  },
  /**
   * ステージ2の景色のモデル（NORI-59）。山は底の半径 1・高さ 1 の単位の形（ゲームで大きさを合わせる）。
   * 駅はホームの上の部分（原点はホームの上の面の中心。線路は −X の側）
   */
  landmark: {
    variants: ["mountain-a", "mountain-b", "mountain-c", "station"],
    sizes: {
      "mountain-a": { width: 2, height: 1, length: 2 },
      "mountain-b": { width: 2, height: 1, length: 2 },
      "mountain-c": { width: 2, height: 1, length: 2 },
      station: { width: 3.6, height: 3.0, length: 12.6 },
    },
    nodes: ["body"],
    maxTriangles: 3000,
    maxGlbBytes: 262144,
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
    bark: { texture: "Bark001", tileMeters: 1, tint: [0.75, 0.55, 0.4] },
    /** 海底の砂（ステージ4）。素材の平均の色 × 色味 ＝ STAGE4.sandColor と同じ明るさ */
    sand: { texture: "Ground054", tileMeters: 3.5, tint: [0.83, 0.82, 0.72] },
  },
  /** 木の葉：芝の素材（芝の tint の上）にかける色。芝より少し暗い緑（新しく読む素材を増やさない）。線形の RGB */
  leafTint: [0.75, 0.85, 0.7],
  /** 木の素材（幹）の大きさの上限（color・normal・roughness の合計） */
  maxTreeTextureBytes: 1048576,
  lowFps: 40,
  lowFpsSeconds: 3,
  minStarContrast: 3,
  minRoadGrassContrast: 1.5,
  targetFps: 55,
  throttledFps: 30,
  cpuThrottle: 4,
  lightmapSize: 1024,
  /** ステージ2の地面の陰を焼き付ける範囲（中心から四方へ、1辺 m）。線路と木のあるところ */
  mountainBakeSize: 320,
  /** ステージ3（空）の焼き付けの範囲（1辺 m）と陰の届く距離（m）。山が大きいので遠くまで（NORI-27） */
  skyBakeSize: 500,
  skyAoDistance: 20,
  /** ステージ4（海）の焼き付けの範囲（1辺 m）。陰の届く距離は aoDistance（NORI-28） */
  seaBakeSize: 240,
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
  /** 高画質の画素の倍率の上限（端末の倍率がこれより大きくても、ここまで） */
  highPixelRatioMax: 2,
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
  /** 画質のボタン（右上）の大きさ px（NORI-58） */
  qualityButtonSize: 72,
} as const;

/** 保護者の方への入口（プライバシーポリシー。NORI-54）。押し続けたときだけ開く */
export const PARENT = {
  holdSeconds: 2,
  buttonSize: 48,
} as const;

/** タイトル画面とステージ選び（NORI-30。docs/game-rules.md「タイトル画面・ステージ選び・クリアの演出」） */
export const TITLE = {
  /** 選べるステージ（1〜5。ステージ5は NORI-29） */
  stages: [1, 2, 3, 4, 5],
  /** 乗り物の絵のボタン（px） */
  buttonSize: 120,
} as const;

/** クリアの演出（NORI-30） */
export const CLEAR = {
  confettiSeconds: 3,
  confettiPieces: 40,
  buttonsDelaySeconds: 3,
  /** もう一回・つぎ・タイトルのボタン（px） */
  buttonSize: 96,
} as const;

/**
 * 効果音と BGM（NORI-31。docs/game-rules.md「効果音と BGM」）。音の高さは MIDI の番号（69 = 440 Hz のラ）。
 * メロディーはオリジナル（ド 60・レ 62・ミ 64・ソ 67・ラ 69 とそのオクターブだけ）。0 は休み
 */
export const SOUND = {
  buttonSize: 72,
  effectGain: 0.25,
  bumpGain: 0.12,
  /** ぶつかった音を一度鳴らしたら、この秒数は鳴らさない（刻みで数える） */
  bumpCooldownSeconds: 0.5,
  musicGain: 0.08,
  attackSeconds: 0.01,
  musicAttackSeconds: 0.02,
  musicFadeInSeconds: 2,
  musicFadeOutSeconds: 2,
  /** BGM の1音を、8 分音符の長さのどれだけ鳴らすか（残りは次の音とのすき間） */
  musicNoteRatio: 0.9,
  /** BGM を何秒先まで予約するか・最初の音をどれだけ遅らせるか */
  scheduleAheadSeconds: 0.3,
  scheduleLeadSeconds: 0.05,
  muteRampSeconds: 0.1,
  /** 使ってよい音の高さ（MIDI の番号。110〜1319 Hz） */
  lowestNote: 52,
  highestNote: 88,
  effects: {
    collect: { wave: "sine", notes: [84, 88], noteSeconds: 0.08 },
    checkpoint: { wave: "triangle", notes: [79, 84], noteSeconds: 0.12 },
    // 同じ高さの「ポン、ポン」（下がる音は「しっぱい」に聞こえる。11/12 にオーナーが承認）
    bump: { wave: "sine", notes: [60, 60], noteSeconds: 0.1 },
    goal: { wave: "triangle", notes: [72, 76, 79, 84], noteSeconds: 0.15 },
  },
  /** ステージごとの BGM：1 分の拍の数と、8 分音符 16 個（三角波でくり返す） */
  music: {
    stage1: { bpm: 112, notes: [60, 64, 67, 64, 69, 67, 64, 62, 60, 62, 64, 67, 64, 62, 60, 0] },
    stage2: { bpm: 100, notes: [67, 0, 64, 62, 60, 62, 64, 0, 67, 69, 67, 64, 62, 0, 60, 0] },
    stage3: { bpm: 92, notes: [72, 0, 69, 0, 67, 64, 67, 0, 69, 0, 72, 0, 74, 72, 69, 0] },
    stage4: { bpm: 80, notes: [57, 0, 60, 0, 64, 0, 62, 0, 60, 0, 57, 0, 55, 0, 57, 0] },
    stage5: { bpm: 96, notes: [64, 0, 67, 72, 0, 71, 67, 0, 64, 0, 67, 69, 67, 0, 64, 0] },
  },
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
  PARENT,
  TITLE,
  CLEAR,
  SOUND,
} as const;

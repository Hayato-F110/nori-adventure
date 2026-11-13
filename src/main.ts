// 起動とゲームループ。状態（src/core）を固定刻みで進め、描画（src/render）はその状態を読むだけ。
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { ASSET, CAMERA, CITY_SKY, LOOK, RESPAWN, SIM, STAGE1, TRAFFIC } from "./config";
import type { TrafficPoses } from "./core/traffic";
import { createCityLifeView } from "./render/cityLifeView";
import { createGame } from "./core/game";
import { createFixedStepper } from "./core/loop";
import type { Stage2State } from "./core/stage2";
import type { Ring, Stage3State } from "./core/stage3";
import type { Stage4State } from "./core/stage4";
import type { CarState, GameState, InputFrame, Pose2D } from "./core/types";
import { createGamepadInput } from "./input/gamepad";
import { createKeyboardInput } from "./input/keyboard";
import { mergeInputs } from "./input/merge";
import { createTouchInput } from "./input/touch";
import { type CarView, createCarView, loadCarView, type ModelManifest } from "./render/carModel";
import { createCity } from "./render/city";
import { createCourseView } from "./render/courseView";
import { createFollowCamera } from "./render/followCamera";
import { loadLook, surfacesFor } from "./render/look";
import type { Quality } from "./render/quality";
import { startQuality } from "./render/qualityControl";
import { createStatusView } from "./render/statusView";
import { loadTreeModels } from "./render/trees";
import { createParentLink } from "./input/parentLink";
import { parseRoute } from "./core/route";
import { startClearFlow } from "./render/clearFlow";
import { startSound } from "./render/sound";

declare global {
  interface Window {
    /** E2E 用：タイトル画面で星を付けたステージ（NORI-30） */
    __noriTitle?: { cleared: number[] };
    /** E2E テストと開発用の読み取り口（状態を書き換える手段は置かない） */
    __nori?: {
      fpsSamples: number[];
      /** 車の見た目：GLB を読めたら "glb"、読む前・読めなかったときは "box" */
      carModel: "box" | "glb";
      frames: number;
      /** ステージ1の状態（ステージ2では使わない） */
      state: () => GameState;
      /** ステージ1の街のほかの車・自転車・バイク・人の今の位置と、自作モデルに差しかえた種類の数（NORI-61） */
      cityLife?: () => { poses: TrafficPoses; models: number };
      /** 遊んでいるステージ（ステージ2のときだけ 2） */
      stage?: 2 | 3 | 4;
      /** ステージ4の状態（NORI-28） */
      sub?: () => Stage4State;
      /** ステージ4の生きものの今の位置 */
      creatures?: () => { x: number; y: number; z: number }[];
      /** ステージ4の生きもののきらきら（1つめ）の位置。見つけたあとは null（NORI-62） */
      sparkles?: () => ({ x: number; y: number; z: number } | null)[];
      /** E2E 用：ステージ4の時間を止める・戻す（状態を進めず、描画だけ続ける） */
      freeze?: (on: boolean) => void;
      /** ステージ4で自作モデル（sea-*）に差し替えた種類の数（0〜7） */
      seaModels?: number;
      /** ステージ4のたからばこの真ん中と、横の海底（E2E で明るさの比を測る） */
      treasureMarker?: () => {
        treasure: { x: number; y: number; z: number };
        water: { x: number; y: number; z: number };
      };
      /** ステージ3の状態（NORI-27） */
      plane?: () => Stage3State;
      /** ステージ3の輪（最後はゴール） */
      rings?: () => Ring[];
      /** ステージ3の輪（i。-1 はゴール）の上の端と、その少し上の空（E2E で明るさの比を測る） */
      ringMarker?: (i: number) => {
        ring: { x: number; y: number; z: number };
        sky: { x: number; y: number; z: number };
      };
      /** ステージ2で選んだ列車（まだなら null。NORI-59） */
      trainChoice?: () => string | null;
      /** ステージ2で Blender の山・駅に差しかえた数（NORI-59） */
      landmarks?: () => { mountains: number; stations: number };
      /** ステージ2のすれ違う電車の今の位置（NORI-59） */
      passingTrain?: () => { x: number; y: number; z: number };
      /** ステージ3の空の景色（NORI-60）：数と、ほかの飛行機の形（"glb" は自作の plane.glb の色違い） */
      skyScenery?: () => {
        planes: number;
        planeModel: "box" | "glb";
        balloons: number;
        birds: number;
        /** ほかの飛行機の今の位置 */
        planeAt: { x: number; y: number; z: number }[];
      };
      /** ステージ2の状態（NORI-26） */
      train?: () => Stage2State;
      /** ステージ2の駅ごとの、旗の真ん中とそばの土手（3D の点。E2E で明るさの比を測る） */
      stationMarkers?: () => {
        flag: { x: number; y: number; z: number };
        bed: { x: number; y: number; z: number };
      }[];
      /** 見た目（NORI-56）：素材を読む前 "loading"・貼った "textured"・単色 "plain" */
      look: "loading" | "textured" | "plain";
      /** 木（NORI-26）："simple"（今の簡単な木）か "model"（Blender の木） */
      trees: "simple" | "model";
      /** 画質（NORI-56）：一度 "low" になったら戻らない */
      quality: Quality;
      /** 3D の点が、画面（CSS の px）のどこに映るか（E2E で明るさを測るため。読むだけ） */
      screenOf: (x: number, y: number, z: number) => { x: number; y: number };
    };
  }
}

const canvas = document.querySelector<HTMLCanvasElement>("#game");
const hud = document.querySelector<HTMLDivElement>("#hud");
if (canvas === null || hud === null) throw new Error("index.html に #game と #hud が必要です");
const params = new URLSearchParams(location.search);
const showDebug = params.has("debug");

// 保護者の方への入口（NORI-54）：どのステージでも左上に。2秒押し続けて離すとポリシーを開く
const parentLink = document.querySelector<HTMLAnchorElement>("#parent");
if (parentLink !== null) createParentLink(parentLink);

// 開く画面は URL で決める（NORI-30。docs/game-rules.md「タイトル画面・ステージ選び・クリアの演出」）
const route = parseRoute(location.search);

// ?stage がない（知らない値も）：タイトル画面。3D は描かず、乗り物の絵のリンクを出すだけ
if (route.kind === "title") {
  const { startTitle } = await import("./render/titleScreen");
  window.__noriTitle = { cleared: startTitle() };
  // タイトルでも消音できる（音は鳴らさない。NORI-31）
  const { startSoundButton } = await import("./render/sound");
  startSoundButton();
  await new Promise<never>(() => undefined);
}

// ?models：乗り物のモデルを並べて見る確認用の画面（NORI-20〜23）。ゲームは始めない
if (route.kind === "models") {
  hud.hidden = true;
  for (const id of ["touch", "status"]) document.getElementById(id)?.setAttribute("hidden", "");
  const { startModelGallery } = await import("./render/modelGallery");
  await startModelGallery(canvas, import.meta.env.BASE_URL);
  // ここで止める（下のゲームの起動に進まない）。確認用の画面は描き続ける
  await new Promise<never>(() => undefined);
}

const stage = route.kind === "stage" ? route.stage : 1;

// ?stage=2：山道を列車で進むステージ（NORI-26）
if (stage === 2) {
  const { startStage2 } = await import("./stage2Main");
  await startStage2(canvas, hud, showDebug);
  await new Promise<never>(() => undefined);
}

// ?stage=3：空を飛行機で飛ぶステージ（NORI-27）
if (stage === 3) {
  const { startStage3 } = await import("./stage3Main");
  await startStage3(canvas, hud, showDebug);
  await new Promise<never>(() => undefined);
}

// ?stage=4：海を潜水艇で探検するステージ（NORI-28）
if (stage === 4) {
  const { startStage4 } = await import("./stage4Main");
  await startStage4(canvas, hud, showDebug);
  await new Promise<never>(() => undefined);
}

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, LOOK.highPixelRatioMax));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
// 色の仕上げ（NORI-56。docs/game-rules.md「見た目」）
renderer.toneMapping = THREE.AgXToneMapping;
renderer.toneMappingExposure = LOOK.exposure;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x9fd8ff);
scene.fog = new THREE.Fog(0x9fd8ff, 80, 190);
const hemi = new THREE.HemisphereLight(0xdff3ff, 0x5c8a4a, LOOK.hemiPlain);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffffff, 2.2);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
Object.assign(sun.shadow.camera, { left: -30, right: 30, top: 30, bottom: -30, near: 1, far: 120 });
scene.add(sun, sun.target);
// 当たり判定（Rapier の WASM）の準備を待ってから始める
const game = await createGame();
// 木を Blender の木に切り替える前に、シェーダーを用意する（切り替えで一瞬止まらないように。NORI-26）
const city = createCity(game.layout, {
  precompile: (staged) => renderer.compileAsync(staged, camera, scene),
});
scene.add(city.root);
const courseView = createCourseView(game.stars, STAGE1);
scene.add(courseView.root);
// 街のにぎわい（NORI-61）：箱で始め、自作モデル（ASSET.city）が読めたら差しかえる。読めないものは箱のまま
const cityLife = createCityLifeView(
  TRAFFIC.vehicles.map((v) => v.model),
  game.initial().traffic.bikes.map((b) => b.kind),
  TRAFFIC.people.count,
);
scene.add(cityLife.root);
void (async () => {
  const base = import.meta.env.BASE_URL;
  const loader = new GLTFLoader();
  try {
    const manifest = (await (await fetch(`${base}models/manifest.json`)).json()) as ModelManifest;
    const results = await Promise.allSettled(
      ASSET.city.variants.map(async (name) => {
        const e = manifest.models.find((m) => m.name === name);
        if (e === undefined) throw new Error(`${name} がない`);
        return [name, (await loader.loadAsync(`${base}models/${e.file}`)).scene] as const;
      }),
    );
    const models = new Map<string, THREE.Object3D>();
    for (const r of results) if (r.status === "fulfilled") models.set(r.value[0], r.value[1]);
    cityLife.useModels(models);
  } catch {
    // 一覧が読めなければ箱のまま遊べる
  }
})();

// ---- 見た目と画質（NORI-56）。最初は単色で始め、素材は「読めた」かつ「最初の画質の判定が済んだ」あとに貼る ----
// 遅い端末で「単色 → 素材 → 単色」と2回変わるのを防ぐ（見た目が変わるのは多くて1回。NORI-56 のレビュー）
// 画質はボタンで選べる（NORI-58）。選んだ画質はこの端末の中に覚える
const quality = startQuality({
  renderer,
  scene,
  sun,
  hemi,
  applyLook: (look) => city.applyLook(look),
  resize: () => resize(),
});
void loadLook({
  base: import.meta.env.BASE_URL,
  renderer,
  surfaces: surfacesFor(LOOK.surfaces, "stage1"),
  aoIntensity: LOOK.aoIntensity,
  aoDirect: LOOK.aoDirect,
  maxAnisotropy: LOOK.maxAnisotropy,
}).then((look) => {
  // 切り替えの前に、Blender の木のシェーダーを裏で用意しておく（切り替えで一瞬止まらないように。NORI-26）
  if (look !== null) city.trees.prepare(look);
  quality.lookLoaded(look);
});

// まず箱の車で始め、GLB が読めたら差しかえる（読み込みを待たせない。読めなければ箱のまま）
let carView: CarView = createCarView();
scene.add(carView.root);
const gltfLoader = new GLTFLoader();
// 木（NORI-26）：Blender の木の形が読めたら渡す（素材が貼れたときだけ使う。読めなければ今の簡単な木）
void loadTreeModels({
  base: import.meta.env.BASE_URL,
  fetchManifest: async (url) => (await (await fetch(url)).json()) as ModelManifest,
  loadModel: async (url) => (await gltfLoader.loadAsync(url)).scene,
}).then((models) => {
  if (models !== null) city.trees.setModels(models);
});
void loadCarView({
  base: import.meta.env.BASE_URL,
  fetchManifest: async (url) => (await (await fetch(url)).json()) as ModelManifest,
  loadModel: async (url) => (await gltfLoader.loadAsync(url)).scene,
}).then((loaded) => {
  if (loaded === null) return;
  loaded.root.position.copy(carView.root.position);
  loaded.root.rotation.copy(carView.root.rotation);
  scene.remove(carView.root);
  carView = loaded;
  scene.add(carView.root);
  if (window.__nori) window.__nori.carModel = "glb";
});

const camera = new THREE.PerspectiveCamera(CAMERA.fov, 1, 0.1, 400);
const followCamera = createFollowCamera(camera, CAMERA, city.obstacles);

const resize = () => {
  const { innerWidth: w, innerHeight: h } = window;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
};
window.addEventListener("resize", resize);
resize();

// ---- 状態 ----
const keyboard = createKeyboardInput(window);
const byId = (id: string) => {
  const el = document.getElementById(id);
  if (el === null) throw new Error(`index.html に #${id} が必要です`);
  return el;
};
const touch = createTouchInput({
  root: byId("touch"),
  forward: byId("go"),
  backward: byId("back"),
  wheel: byId("wheel"),
  knob: byId("knob"),
});
const gamepads = createGamepadInput();
const statusView = createStatusView(
  {
    starCount: byId("star-count"),
    flags: [...byId("flags").children],
    time: byId("time"),
    goal: byId("goal"),
  },
  SIM.fixedDt,
);
// ゴールしたら紙ふぶきと「もう一回・つぎ・タイトル」（NORI-30）
const clearFlow = startClearFlow(1);
// 効果音と BGM（NORI-31）
const sound = startSound(1);
const stepper = createFixedStepper(SIM.fixedDt, SIM.maxStepsPerFrame);
let previous: GameState = game.initial();
let current: GameState = previous;
let input: InputFrame = { throttle: 0, steer: 0 };

// 前の刻みと今の刻みの間を補間して、なめらかに描く（状態は変えない）
const lerpAngle = (a: number, b: number, t: number) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * t;
const interpolate = (a: CarState, b: CarState, t: number): Pose2D => ({
  x: a.x + (b.x - a.x) * t,
  z: a.z + (b.z - a.z) * t,
  heading: lerpAngle(a.heading, b.heading, t),
});

// ---- FPS の記録 ----
const fpsSamples: number[] = [];
let frames = 0;
let windowFrames = 0;
let windowStart = performance.now();
const projected = new THREE.Vector3();
/** 太陽を置く基準（車の位置。毎フレーム作り直さない） */
const focusPoint = new THREE.Vector3();
window.__nori = {
  fpsSamples,
  carModel: "box",
  frames: 0,
  state: () => structuredClone(current),
  cityLife: () => ({ poses: game.traffic.poses(current.traffic), models: cityLife.models }),
  get look() {
    return quality.lookState;
  },
  get quality() {
    return quality.quality;
  },
  get trees() {
    return city.trees.mode;
  },
  screenOf: (x, y, z) => {
    projected.set(x, y, z).project(camera);
    return {
      x: ((projected.x + 1) / 2) * window.innerWidth,
      y: ((1 - projected.y) / 2) * window.innerHeight,
    };
  },
};

let lastPose: Pose2D = interpolate(current.car, current.car, 1);
let lastRespawns = current.respawns;
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
followCamera.snap(lastPose);
let lastTime = performance.now();

const frame = (now: number) => {
  const frameSeconds = Math.min(0.25, (now - lastTime) / 1000);
  lastTime = now;

  // キーボード・タッチ・ゲームパッドを足して、-1〜1 に収める（docs/game-rules.md「入力」）
  input = mergeInputs([keyboard.read(), touch.read(), ...gamepads.read()]);
  const { alpha } = stepper.advance(frameSeconds, () => {
    previous = current;
    current = game.step(current, input);
    // 復活の刻みは、前の位置との間を補間しない（途中の位置を一瞬描かない）
    if (current.respawns !== previous.respawns) previous = current;
  });

  const pose = interpolate(previous.car, current.car, alpha);
  const respawned = current.respawns !== lastRespawns;
  if (respawned) lastPose = pose; // ワープの距離でタイヤを回さない
  const moved = Math.hypot(pose.x - lastPose.x, pose.z - lastPose.z) * Math.sign(current.car.speed);
  lastPose = pose;
  carView.root.position.set(pose.x, 0, pose.z);
  carView.root.rotation.y = pose.heading;
  carView.update(moved, current.car.steer);
  // 復活の直後（無敵の間）は、車を点滅させる（docs/game-rules.md「復活後の無敵時間」）
  // 動きを減らす設定の端末では点滅せず、見えたままにする（1 秒に 2 回まで。光に敏感な子のため）
  carView.root.visible =
    current.invincibleTicks === 0 || reducedMotion.matches || Math.floor(now / RESPAWN.blinkMs) % 2 === 0;
  courseView.update(current.course, pose, now / 1000);
  cityLife.update(
    game.traffic.poses(previous.traffic),
    game.traffic.poses(current.traffic),
    alpha,
    current.tick,
    reducedMotion.matches,
    focusPoint.set(pose.x, 0, pose.z),
  );
  statusView.update(current.tick, current.course);
  clearFlow.update(current.course.finishTick !== null, now / 1000);
  sound.update({
    tick: current.tick,
    collected: current.course.stars.filter(Boolean).length,
    checkpoints: current.course.nextCheckpoint,
    finished: current.course.finishTick !== null,
    touching: current.car.touching,
  });
  // 復活したら、カメラもすぐ新しい位置へ（街の上を流れて、車を見失わないように）
  if (respawned) {
    lastRespawns = current.respawns;
    followCamera.snap(pose);
  } else {
    followCamera.update(pose, frameSeconds);
  }
  // 影は車のまわりだけ描く（影の範囲を狭くして、くっきり・軽くする）
  sun.position.set(pose.x + CITY_SKY.sunOffset.x, CITY_SKY.sunOffset.y, pose.z + CITY_SKY.sunOffset.z);
  sun.target.position.set(pose.x, 0, pose.z);

  renderer.render(scene, camera);

  frames++;
  windowFrames++;
  if (now - windowStart >= 1000) {
    const fps = (windowFrames * 1000) / (now - windowStart);
    fpsSamples.push(Math.round(fps * 10) / 10);
    // 遅い端末では低画質へ（「自動」のときだけ。自動では上げ直さない）
    quality.sample(fps, fpsSamples.length);
    windowFrames = 0;
    windowStart = now;
    if (showDebug) {
      hud.textContent = `${fps.toFixed(0)} fps · ${(current.car.speed * 3.6).toFixed(0)} km/h`;
    }
  }
  if (window.__nori) window.__nori.frames = frames;
  requestAnimationFrame(frame);
};
requestAnimationFrame(frame);

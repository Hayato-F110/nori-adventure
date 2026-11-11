// 起動とゲームループ。状態（src/core）を固定刻みで進め、描画（src/render）はその状態を読むだけ。
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { CAMERA, RESPAWN, SIM, STAGE1 } from "./config";
import { createGame } from "./core/game";
import { createFixedStepper } from "./core/loop";
import type { CarState, GameState, InputFrame, Pose2D } from "./core/types";
import { createGamepadInput } from "./input/gamepad";
import { createKeyboardInput } from "./input/keyboard";
import { mergeInputs } from "./input/merge";
import { createTouchInput } from "./input/touch";
import { type CarView, createCarView, loadCarView, type ModelManifest } from "./render/carModel";
import { createCity } from "./render/city";
import { createCourseView } from "./render/courseView";
import { createFollowCamera } from "./render/followCamera";
import { createStatusView } from "./render/statusView";

declare global {
  interface Window {
    /** E2E テストと開発用の読み取り口（状態を書き換える手段は置かない） */
    __nori?: {
      fpsSamples: number[];
      /** 車の見た目：GLB を読めたら "glb"、読む前・読めなかったときは "box" */
      carModel: "box" | "glb";
      frames: number;
      state: () => GameState;
    };
  }
}

const canvas = document.querySelector<HTMLCanvasElement>("#game");
const hud = document.querySelector<HTMLDivElement>("#hud");
if (canvas === null || hud === null) throw new Error("index.html に #game と #hud が必要です");
const params = new URLSearchParams(location.search);
const showDebug = params.has("debug");

// ?models：乗り物のモデルを並べて見る確認用の画面（NORI-20〜23）。ゲームは始めない
if (params.has("models")) {
  hud.hidden = true;
  for (const id of ["touch", "status"]) document.getElementById(id)?.setAttribute("hidden", "");
  const { startModelGallery } = await import("./render/modelGallery");
  await startModelGallery(canvas, import.meta.env.BASE_URL);
  // ここで止める（下のゲームの起動に進まない）。確認用の画面は描き続ける
  await new Promise<never>(() => undefined);
}

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x9fd8ff);
scene.fog = new THREE.Fog(0x9fd8ff, 80, 190);
scene.add(new THREE.HemisphereLight(0xdff3ff, 0x5c8a4a, 1.4));
const sun = new THREE.DirectionalLight(0xffffff, 2.2);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
Object.assign(sun.shadow.camera, { left: -30, right: 30, top: 30, bottom: -30, near: 1, far: 120 });
scene.add(sun, sun.target);
// 当たり判定（Rapier の WASM）の準備を待ってから始める
const game = await createGame();
const city = createCity(game.layout);
scene.add(city.root);
const courseView = createCourseView(game.stars, STAGE1);
scene.add(courseView.root);

// まず箱の車で始め、GLB が読めたら差しかえる（読み込みを待たせない。読めなければ箱のまま）
let carView: CarView = createCarView();
scene.add(carView.root);
const gltfLoader = new GLTFLoader();
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
window.__nori = { fpsSamples, carModel: "box", frames: 0, state: () => structuredClone(current) };

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
  statusView.update(current.tick, current.course);
  // 復活したら、カメラもすぐ新しい位置へ（街の上を流れて、車を見失わないように）
  if (respawned) {
    lastRespawns = current.respawns;
    followCamera.snap(pose);
  } else {
    followCamera.update(pose, frameSeconds);
  }
  // 影は車のまわりだけ描く（影の範囲を狭くして、くっきり・軽くする）
  sun.position.set(pose.x + 20, 40, pose.z + 10);
  sun.target.position.set(pose.x, 0, pose.z);

  renderer.render(scene, camera);

  frames++;
  windowFrames++;
  if (now - windowStart >= 1000) {
    const fps = (windowFrames * 1000) / (now - windowStart);
    fpsSamples.push(Math.round(fps * 10) / 10);
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

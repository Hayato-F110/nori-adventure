// 起動とゲームループ。状態（src/core）を固定刻みで進め、描画（src/render）はその状態を読むだけ。
import * as THREE from "three";
import { CAMERA, SIM } from "./config";
import { createGameState, stepGame } from "./core/game";
import { createFixedStepper } from "./core/loop";
import type { CarState, GameState, InputFrame, Pose2D } from "./core/types";
import { createKeyboardInput } from "./input/keyboard";
import { createCarView } from "./render/carModel";
import { createCity } from "./render/city";
import { createFollowCamera } from "./render/followCamera";

declare global {
  interface Window {
    /** E2E テストと開発用の読み取り口（状態を書き換える手段は置かない） */
    __nori?: {
      fpsSamples: number[];
      frames: number;
      state: () => GameState;
    };
  }
}

const canvas = document.querySelector<HTMLCanvasElement>("#game");
const hud = document.querySelector<HTMLDivElement>("#hud");
if (canvas === null || hud === null) throw new Error("index.html に #game と #hud が必要です");
const showDebug = new URLSearchParams(location.search).has("debug");

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
scene.add(createCity());

const carView = createCarView();
scene.add(carView.root);

const camera = new THREE.PerspectiveCamera(CAMERA.fov, 1, 0.1, 400);
const followCamera = createFollowCamera(camera, CAMERA);

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
const stepper = createFixedStepper(SIM.fixedDt, SIM.maxStepsPerFrame);
let previous: GameState = createGameState();
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
window.__nori = { fpsSamples, frames: 0, state: () => structuredClone(current) };

let lastPose: Pose2D = interpolate(current.car, current.car, 1);
followCamera.snap(lastPose);
let lastTime = performance.now();

const frame = (now: number) => {
  const frameSeconds = Math.min(0.25, (now - lastTime) / 1000);
  lastTime = now;

  input = keyboard.read();
  const { alpha } = stepper.advance(frameSeconds, () => {
    previous = current;
    current = stepGame(current, input);
  });

  const pose = interpolate(previous.car, current.car, alpha);
  const moved = Math.hypot(pose.x - lastPose.x, pose.z - lastPose.z) * Math.sign(current.car.speed);
  lastPose = pose;
  carView.root.position.set(pose.x, 0, pose.z);
  carView.root.rotation.y = pose.heading;
  carView.update(moved, current.car.steer);
  followCamera.update(pose, frameSeconds);
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

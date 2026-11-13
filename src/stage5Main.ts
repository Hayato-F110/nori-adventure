// ステージ5（月面・ローバー・ボス）の起動とゲームのループ。URL に ?stage=5 のときだけ main.ts から読み込む（NORI-29）。
// 状態（src/core/stage5）を固定刻みで進め、描画はその状態を読むだけ。
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { CAMERA, LOOK, SIM, STAGE5 } from "./config";
import { createFixedStepper } from "./core/loop";
import { createStage5Game, type RoverState, type Stage5State } from "./core/stage5";
import type { InputFrame } from "./core/types";
import { createGamepadInput } from "./input/gamepad";
import { createKeyboardInput } from "./input/keyboard";
import { mergeInputs } from "./input/merge";
import { drivenInput } from "./input/testDriver";
import { createTouchInput, touchLayoutFor } from "./input/touch";
import { type CarView, createCarView, loadCarView, type ModelManifest } from "./render/carModel";
import { startClearFlow } from "./render/clearFlow";
import { createFollowCamera } from "./render/followCamera";
import { startQuality } from "./render/qualityControl";
import { startSound } from "./render/sound";
import { createStage5View } from "./render/stage5View";
import { createStatusView } from "./render/statusView";

export const startStage5 = async (canvas: HTMLCanvasElement, hud: HTMLElement, showDebug: boolean) => {
  const byId = (id: string) => {
    const el = document.getElementById(id);
    if (el === null) throw new Error(`index.html に #${id} が必要です`);
    return el;
  };
  // 上の表示：旗の代わりに、なかよしのメーター（5 つの丸。届けると色がつく）
  const flagsBox = byId("flags");
  flagsBox.innerHTML = Array.from(
    { length: 5 },
    () =>
      '<svg class="status-flag" viewBox="0 0 60 80" aria-hidden="true"><circle cx="30" cy="40" r="22" stroke="#fff" stroke-width="6"/></svg>',
  ).join("");
  flagsBox.setAttribute("aria-label", "なかよし");

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, LOOK.highPixelRatioMax));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.AgXToneMapping;
  renderer.toneMappingExposure = LOOK.exposure;

  const game = createStage5Game();
  const view = createStage5View();

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(STAGE5.skyColor);
  // 空の光・地面からの光（強さは画質の切り替えが LOOK.hemiPlain を入れる。色の計算の前提）
  const hemi = new THREE.HemisphereLight(STAGE5.hemiSkyColor, STAGE5.hemiGroundColor, LOOK.hemiPlain);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffffff, STAGE5.sunIntensity);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -30, right: 30, top: 30, bottom: -30, near: 1, far: 120 });
  scene.add(sun, sun.target);
  scene.add(view.root);

  const camera = new THREE.PerspectiveCamera(CAMERA.fov, 1, 0.1, 900);
  const resize = () => {
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
  };
  window.addEventListener("resize", resize);

  // 画質（ほかのステージと同じボタン）。素材と光のベイクは、Blender で月面の陰を焼いてから足す（今は単色）
  const quality = startQuality({
    renderer,
    scene,
    sun,
    hemi,
    applyLook: () => undefined,
    resize: () => resize(),
  });
  resize();
  quality.lookLoaded(null);

  // ---- ローバー：簡単な形で始め、GLB（rover）が読めたら差しかえる ----
  let roverView: CarView = createCarView();
  let roverModel: "box" | "glb" = "box";
  scene.add(roverView.root);
  const gltfLoader = new GLTFLoader();
  void loadCarView({
    base: import.meta.env.BASE_URL,
    fetchManifest: async (url) => (await (await fetch(url)).json()) as ModelManifest,
    loadModel: async (url) => (await gltfLoader.loadAsync(url)).scene,
    name: "rover",
  }).then((loaded) => {
    if (loaded === null) return;
    loaded.root.position.copy(roverView.root.position);
    loaded.root.rotation.copy(roverView.root.rotation);
    scene.remove(roverView.root);
    roverView = loaded;
    scene.add(roverView.root);
    roverModel = "glb";
  });

  // ---- 入力と上の表示 ----
  const keyboard = createKeyboardInput(window);
  const touch = createTouchInput(
    {
      root: byId("touch"),
      forward: byId("go"),
      backward: byId("back"),
      wheel: byId("wheel"),
      knob: byId("knob"),
    },
    window,
    touchLayoutFor(5),
  );
  const gamepads = createGamepadInput();
  const statusView = createStatusView(
    { starCount: byId("star-count"), flags: [...flagsBox.children], time: byId("time"), goal: byId("goal") },
    SIM.fixedDt,
  );

  // 落ち着いたらクリアの演出（紙ふぶき）と、エンディングの絵（5つの乗り物）とボタン
  const clearFlow = startClearFlow(5);
  const sound = startSound(5);
  const stepper = createFixedStepper(SIM.fixedDt, SIM.maxStepsPerFrame);
  let previous: Stage5State = game.initial();
  let current: Stage5State = previous;
  let input: InputFrame = { throttle: 0, steer: 0 };

  const follow = createFollowCamera(camera, CAMERA);

  // ---- FPS の記録と、E2E 用の読み取り口 ----
  const fpsSamples: number[] = [];
  let frames = 0;
  let windowFrames = 0;
  let windowStart = performance.now();
  const projected = new THREE.Vector3();
  window.__nori = {
    fpsSamples,
    get carModel() {
      return roverModel;
    },
    frames: 0,
    state: () => {
      throw new Error("ステージ5では rover() を使う");
    },
    stage: 5,
    rover: () => structuredClone(current),
    moonMarker: () => view.marker(),
    bossMouth: () => view.mouth,
    get look() {
      return quality.lookState;
    },
    get quality() {
      return quality.quality;
    },
    trees: "simple",
    screenOf: (x, y, z) => {
      projected.set(x, y, z).project(camera);
      return {
        x: ((projected.x + 1) / 2) * window.innerWidth,
        y: ((1 - projected.y) / 2) * window.innerHeight,
      };
    },
  };

  const lerpAngle = (a: number, b: number, t: number) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * t;
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  follow.snap(current.rover);
  let lastTime = performance.now();

  const frame = (now: number) => {
    const frameSeconds = Math.min(0.25, (now - lastTime) / 1000);
    lastTime = now;
    input = mergeInputs([keyboard.read(), touch.read(), ...gamepads.read()]);
    const { alpha } = stepper.advance(frameSeconds, () => {
      previous = current;
      current = game.step(current, drivenInput(current, input));
    });

    // 前の刻みとの間を補間して描く（状態は変えない）
    const a = previous.rover;
    const b = current.rover;
    const p: RoverState = {
      ...b,
      x: a.x + (b.x - a.x) * alpha,
      y: a.y + (b.y - a.y) * alpha,
      z: a.z + (b.z - a.z) * alpha,
      heading: lerpAngle(a.heading, b.heading, alpha),
    };
    const moved = Math.hypot(p.x - roverView.root.position.x, p.z - roverView.root.position.z);
    roverView.root.position.set(p.x, p.y, p.z);
    roverView.root.rotation.y = p.heading;
    roverView.update(Math.sign(p.speed) * moved, p.steer);
    view.update(current, now / 1000, reducedMotion.matches);

    const collected = current.stars.filter(Boolean).length;
    statusView.update(current.tick, {
      stars: current.stars,
      nextCheckpoint: current.calm,
      finishTick: current.finishTick,
    });
    clearFlow.update(current.finishTick !== null, now / 1000);
    sound.update({
      tick: current.tick,
      // なかよしの星を取ったときも「とった」の音（届けても数は減らない）
      collected: collected + current.calm + (current.carrying ? 1 : 0),
      checkpoints: current.calm,
      finished: current.finishTick !== null,
      touching: current.rover.touching,
    });
    follow.update(p, frameSeconds);
    sun.position.set(p.x + 20, 40, p.z + 10);
    sun.target.position.set(p.x, 0, p.z);

    renderer.render(scene, camera);

    frames++;
    windowFrames++;
    if (now - windowStart >= 1000) {
      const fps = (windowFrames * 1000) / (now - windowStart);
      fpsSamples.push(Math.round(fps * 10) / 10);
      quality.sample(fps, fpsSamples.length);
      windowFrames = 0;
      windowStart = now;
      if (showDebug) hud.textContent = `${fps.toFixed(0)} fps · なかよし ${current.calm}`;
    }
    if (window.__nori) window.__nori.frames = frames;
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
};

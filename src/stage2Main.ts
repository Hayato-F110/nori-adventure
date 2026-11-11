// ステージ2（山道・列車）の起動とゲームのループ。URL に ?stage=2 のときだけ main.ts から読み込む（NORI-26）。
// タイトル画面（NORI-30）ができたら、ステージ1と起動の部分をまとめる。
// 状態（src/core/stage2）を固定刻みで進め、描画はその状態を読むだけ。
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { CAMERA, LOOK, SIM, STAGE2 } from "./config";
import { createFixedStepper } from "./core/loop";
import { createStage2Game, type Stage2State } from "./core/stage2";
import { wrapDistance } from "./core/track";
import type { InputFrame } from "./core/types";
import { createGamepadInput } from "./input/gamepad";
import { createKeyboardInput } from "./input/keyboard";
import { mergeInputs } from "./input/merge";
import { createTouchInput } from "./input/touch";
import { type CarView, loadCarView, type ModelManifest } from "./render/carModel";
import { type Look, loadLook } from "./render/look";
import { createQualityGovernor } from "./render/quality";
import { createStage2View } from "./render/stage2View";
import { createStatusView } from "./render/statusView";
import { loadTreeModels } from "./render/trees";

export const startStage2 = async (canvas: HTMLCanvasElement, hud: HTMLElement, showDebug: boolean) => {
  const byId = (id: string) => {
    const el = document.getElementById(id);
    if (el === null) throw new Error(`index.html に #${id} が必要です`);
    return el;
  };
  // ほしは置かない（数の表示を隠す）。ハンドルは効かないので隠す。
  // CSS の display: flex が hidden 属性より強いので、表示を直接消す
  for (const el of [byId("star-count").parentElement, byId("wheel")]) {
    if (el === null) continue;
    el.hidden = true;
    el.style.display = "none";
  }

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.AgXToneMapping;
  renderer.toneMappingExposure = LOOK.exposure;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x9fd8ff);
  scene.fog = new THREE.Fog(0x9fd8ff, 120, 330);
  const hemi = new THREE.HemisphereLight(0xdff3ff, 0x5c8a4a, LOOK.hemiPlain);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffffff, 2.2);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -30, right: 30, top: 30, bottom: -30, near: 1, far: 140 });
  scene.add(sun, sun.target);

  const game = createStage2Game();
  const view = createStage2View(game.track, game.stations);
  scene.add(view.root);

  // ---- 見た目と画質（ステージ1と同じ決まり。素材は最初の画質の判定が済んでから貼る） ----
  const quality = createQualityGovernor(LOOK);
  let lookState: "loading" | "textured" | "plain" = "loading";
  let loadedLook: Look | null | undefined;
  let qualityJudged = false;
  const usePlain = () => {
    view.applyLook(null);
    scene.environment = null;
    hemi.intensity = LOOK.hemiPlain;
    lookState = "plain";
  };
  const tryApplyLook = () => {
    if (loadedLook === undefined || !qualityJudged || lookState !== "loading") return;
    if (loadedLook === null || quality.quality === "low") {
      usePlain();
      return;
    }
    view.applyLook(loadedLook);
    scene.environment = loadedLook.environment;
    scene.environmentIntensity = LOOK.environmentIntensity;
    hemi.intensity = LOOK.hemiTextured;
    lookState = "textured";
  };
  void loadLook({
    base: import.meta.env.BASE_URL,
    renderer,
    surfaces: LOOK.surfaces,
    aoIntensity: LOOK.aoIntensity,
    aoDirect: LOOK.aoDirect,
    maxAnisotropy: LOOK.maxAnisotropy,
  }).then((look) => {
    loadedLook = look;
    tryApplyLook();
  });

  // ---- 列車：箱で始め、GLB（train）が読めたら差しかえる ----
  let trainView: CarView = createBoxTrain();
  scene.add(trainView.root);
  const gltfLoader = new GLTFLoader();
  // 木（NORI-26）：Blender の木の形が読めたら渡す（素材が貼れたときだけ使う。読めなければ今の簡単な木）
  void loadTreeModels({
    base: import.meta.env.BASE_URL,
    fetchManifest: async (url) => (await (await fetch(url)).json()) as ModelManifest,
    loadModel: async (url) => (await gltfLoader.loadAsync(url)).scene,
  }).then((models) => {
    if (models !== null) view.trees.setModels(models);
  });
  let trainModel: "box" | "glb" = "box";
  void loadCarView({
    base: import.meta.env.BASE_URL,
    name: "train",
    fetchManifest: async (url) => (await (await fetch(url)).json()) as ModelManifest,
    loadModel: async (url) => (await gltfLoader.loadAsync(url)).scene,
  }).then((loaded) => {
    if (loaded === null) return;
    scene.remove(trainView.root);
    trainView = loaded;
    trainView.root.rotation.order = "YXZ";
    scene.add(trainView.root);
    trainModel = "glb";
  });

  const camera = new THREE.PerspectiveCamera(CAMERA.fov, 1, 0.1, 700);
  const resize = () => {
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
  };
  window.addEventListener("resize", resize);
  resize();
  const lowerQuality = () => {
    usePlain();
    renderer.setPixelRatio(LOOK.lowPixelRatio);
    renderer.shadowMap.enabled = false;
    sun.castShadow = false;
    scene.traverse((obj) => {
      if (obj instanceof THREE.Mesh) for (const mat of [obj.material].flat()) mat.needsUpdate = true;
    });
    resize();
  };

  // ---- 入力と上の表示（旗＝駅） ----
  const keyboard = createKeyboardInput(window);
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
  let previous: Stage2State = game.initial();
  let current: Stage2State = previous;
  let input: InputFrame = { throttle: 0, steer: 0 };

  // ---- カメラ：列車の後ろ・上から、線路の向きに沿って追う（STAGE2.cameraDistance・cameraHeight） ----
  const desired = new THREE.Vector3();
  const target = new THREE.Vector3();
  const lookAt = new THREE.Vector3();
  const placeCamera = (pose: ReturnType<typeof view.trainPose>, t: number) => {
    const fx = -Math.sin(pose.heading);
    const fz = -Math.cos(pose.heading);
    desired.set(
      pose.x - fx * STAGE2.cameraDistance,
      pose.y + STAGE2.cameraHeight,
      pose.z - fz * STAGE2.cameraDistance,
    );
    target.set(pose.x + fx * CAMERA.lookAhead, pose.y + CAMERA.lookHeight, pose.z + fz * CAMERA.lookAhead);
    camera.position.lerp(desired, t);
    lookAt.lerp(target, t);
    camera.lookAt(lookAt);
  };

  // ---- FPS の記録と、E2E 用の読み取り口 ----
  const fpsSamples: number[] = [];
  let frames = 0;
  let windowFrames = 0;
  let windowStart = performance.now();
  const projected = new THREE.Vector3();
  window.__nori = {
    fpsSamples,
    get carModel() {
      return trainModel;
    },
    frames: 0,
    state: () => {
      throw new Error("ステージ2では train() を使う");
    },
    stage: 2,
    train: () => structuredClone(current),
    stationMarkers: () =>
      view.markers.map(({ flag, bed }) => ({
        flag: { x: flag.x, y: flag.y, z: flag.z },
        bed: { x: bed.x, y: bed.y, z: bed.z },
      })),
    get look() {
      return lookState;
    },
    get quality() {
      return quality.quality;
    },
    get trees() {
      return view.trees.mode;
    },
    screenOf: (x, y, z) => {
      projected.set(x, y, z).project(camera);
      return {
        x: ((projected.x + 1) / 2) * window.innerWidth,
        y: ((1 - projected.y) / 2) * window.innerHeight,
      };
    },
  };

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  let lastDistance = current.train.distance;
  placeCamera(view.trainPose(current.train.distance), 1);
  let lastTime = performance.now();

  const frame = (now: number) => {
    const frameSeconds = Math.min(0.25, (now - lastTime) / 1000);
    lastTime = now;
    input = mergeInputs([keyboard.read(), touch.read(), ...gamepads.read()]);
    const { alpha } = stepper.advance(frameSeconds, () => {
      previous = current;
      current = game.step(current, input);
    });

    // 前の刻みとの間を補間（輪の切れ目をまたぐときは、近いほうの向きで）
    const length = game.track.length;
    const a = previous.train.distance;
    const delta = wrapDistance(current.train.distance - a + length / 2, length) - length / 2;
    const distance = wrapDistance(a + delta * alpha, length);
    const pose = view.trainPose(distance);
    const moved = wrapDistance(distance - lastDistance + length / 2, length) - length / 2;
    lastDistance = distance;
    trainView.root.position.set(pose.x, pose.y, pose.z);
    trainView.root.rotation.set(pose.pitch, pose.heading, 0, "YXZ");
    trainView.update(moved, 0);
    view.update(current, now / 1000, reducedMotion.matches);
    statusView.update(current.tick, {
      stars: [],
      nextCheckpoint: current.nextStation,
      finishTick: current.finishTick,
    });
    placeCamera(pose, 1 - Math.exp(-CAMERA.followSharpness * frameSeconds));
    sun.position.set(pose.x + 20, pose.y + 40, pose.z + 10);
    sun.target.position.set(pose.x, pose.y, pose.z);

    renderer.render(scene, camera);

    frames++;
    windowFrames++;
    if (now - windowStart >= 1000) {
      const fps = (windowFrames * 1000) / (now - windowStart);
      fpsSamples.push(Math.round(fps * 10) / 10);
      if (fpsSamples.length > LOOK.settleSeconds) {
        if (quality.quality === "high" && quality.push(fps) === "low") lowerQuality();
        if (!qualityJudged && fpsSamples.length >= LOOK.settleSeconds + LOOK.lowFpsSeconds) {
          qualityJudged = true;
          tryApplyLook();
        }
      }
      windowFrames = 0;
      windowStart = now;
      if (showDebug)
        hud.textContent = `${fps.toFixed(0)} fps · ${(current.train.speed * 3.6).toFixed(0)} km/h`;
    }
    if (window.__nori) window.__nori.frames = frames;
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
};

/** GLB を読む前・読めなかったときの列車（箱。前は −Z、原点は底の中心） */
const createBoxTrain = (): CarView => {
  const root = new THREE.Group();
  root.name = "train";
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(2.2, 2.2, 6).translate(0, 1.5, 0),
    new THREE.MeshStandardMaterial({ color: 0x3fb59a, roughness: 0.6 }),
  );
  body.castShadow = true;
  root.add(body);
  return { root, update: () => undefined };
};

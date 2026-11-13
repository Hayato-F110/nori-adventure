// ステージ3（空・飛行機）の起動とゲームのループ。URL に ?stage=3 のときだけ main.ts から読み込む（NORI-27）。
// タイトル画面（NORI-30）ができたら、ステージ1・2と起動の部分をまとめる。
// 状態（src/core/stage3）を固定刻みで進め、描画はその状態を読むだけ。
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { ASSET, CAMERA, LOOK, SIM, STAGE3 } from "./config";
import { createFixedStepper } from "./core/loop";
import { createStage3Game, type PlaneState, type Stage3State } from "./core/stage3";
import type { InputFrame } from "./core/types";
import { createGamepadInput } from "./input/gamepad";
import { createKeyboardInput } from "./input/keyboard";
import { mergeInputs } from "./input/merge";
import { drivenInput } from "./input/testDriver";
import { createTouchInput, touchLayoutFor } from "./input/touch";
import type { ModelManifest } from "./render/carModel";
import { LIGHTMAPS, loadLook, surfacesFor } from "./render/look";
import { startQuality } from "./render/qualityControl";
import { createStage3View } from "./render/stage3View";
import { createStatusView } from "./render/statusView";
import { startClearFlow } from "./render/clearFlow";
import { startSound } from "./render/sound";
import { loadTreeModels } from "./render/trees";

/** 飛行機の高さの半分（原点は底の中心。状態の y は機体の真ん中） */
const HALF_HEIGHT = ASSET.vehicles.plane.size.height / 2;

export const startStage3 = async (canvas: HTMLCanvasElement, hud: HTMLElement, showDebug: boolean) => {
  const byId = (id: string) => {
    const el = document.getElementById(id);
    if (el === null) throw new Error(`index.html に #${id} が必要です`);
    return el;
  };
  // 上の表示：ほしの絵を輪の絵にして、くぐった輪の数を出す。旗（チェックポイント）は使わないので隠す
  const ringIcon = byId("star-count").parentElement?.querySelector("svg");
  if (ringIcon) {
    ringIcon.innerHTML =
      '<circle cx="50" cy="50" r="34" fill="none" stroke="#c0262d" stroke-width="16"/>' +
      '<circle cx="50" cy="50" r="34" fill="none" stroke="#fff" stroke-width="4"/>';
  }
  const flags = byId("flags");
  flags.hidden = true;
  flags.style.display = "none";

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, LOOK.highPixelRatioMax));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.AgXToneMapping;
  renderer.toneMappingExposure = LOOK.exposure;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x9fd8ff);
  scene.fog = new THREE.Fog(0x9fd8ff, 180, 480);
  const hemi = new THREE.HemisphereLight(0xdff3ff, 0x5c8a4a, LOOK.hemiPlain);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffffff, 2.2);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -30, right: 30, top: 30, bottom: -30, near: 1, far: 160 });
  scene.add(sun, sun.target);

  const game = createStage3Game();
  const view = createStage3View(game.rings, game.goal, {
    // 山のふもとの木：切り替えの前にシェーダーを裏で用意する（一瞬止まらないように。ステージ1・2と同じ）
    precompile: (staged) => renderer.compileAsync(staged, camera, scene),
  });
  scene.add(view.root);

  // ---- 見た目と画質（ステージ1・2と同じ決まり） ----
  // 画質はボタンで選べる（NORI-58）
  const quality = startQuality({
    renderer,
    scene,
    sun,
    hemi,
    applyLook: (look) => view.applyLook(look),
    resize: () => resize(),
  });
  void loadLook({
    base: import.meta.env.BASE_URL,
    renderer,
    surfaces: surfacesFor(LOOK.surfaces, "stage3"),
    aoIntensity: LOOK.aoIntensity,
    aoDirect: LOOK.aoDirect,
    maxAnisotropy: LOOK.maxAnisotropy,
    lightmap: LIGHTMAPS.stage3,
  }).then((look) => {
    if (look !== null) view.trees.prepare(look);
    quality.lookLoaded(look);
  });

  // ---- 飛行機：箱で始め、GLB（plane）が読めたら差しかえる。プロペラを回す ----
  let planeRoot: THREE.Object3D = createBoxPlane();
  let propeller: THREE.Object3D | undefined;
  let planeModel: "box" | "glb" = "box";
  scene.add(planeRoot);
  const gltfLoader = new GLTFLoader();
  // 山のふもとの木（NORI-60）：Blender の木の形が読めたら渡す（素材が貼れたときだけ使う）
  void loadTreeModels({
    base: import.meta.env.BASE_URL,
    fetchManifest: async (url) => (await (await fetch(url)).json()) as ModelManifest,
    loadModel: async (url) => (await gltfLoader.loadAsync(url)).scene,
  }).then((models) => {
    if (models !== null) view.trees.setModels(models);
  });
  void (async () => {
    try {
      const base = import.meta.env.BASE_URL;
      const manifest = (await (await fetch(`${base}models/manifest.json`)).json()) as ModelManifest;
      const entry = manifest.models.find((m) => m.name === "plane");
      if (entry === undefined) return;
      const model = (await gltfLoader.loadAsync(`${base}models/${entry.file}`)).scene;
      if (ASSET.vehicles.plane.nodes.some((n) => model.getObjectByName(n) === undefined)) return;
      // ほかの飛行機（NORI-60）も同じ形を色違いで使う
      view.usePlaneModel(model);
      model.traverse((o) => {
        if (o instanceof THREE.Mesh) o.castShadow = true;
      });
      const root = new THREE.Group();
      root.add(model);
      root.rotation.order = "YXZ";
      scene.remove(planeRoot);
      planeRoot = root;
      propeller = model.getObjectByName("propeller");
      scene.add(planeRoot);
      planeModel = "glb";
    } catch {
      // 読めなければ箱のまま
    }
  })();

  const camera = new THREE.PerspectiveCamera(CAMERA.fov, 1, 0.1, 900);
  const resize = () => {
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
  };
  window.addEventListener("resize", resize);
  resize();

  // ---- 入力と上の表示（輪の数・時間） ----
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
    touchLayoutFor(3), // ▲▼（上下）のボタン
  );
  const gamepads = createGamepadInput();
  const statusView = createStatusView(
    { starCount: byId("star-count"), flags: [], time: byId("time"), goal: byId("goal") },
    SIM.fixedDt,
  );

  // ゴールしたら紙ふぶきと「もう一回・つぎ・タイトル」（NORI-30）
  const clearFlow = startClearFlow(3);
  const sound = startSound(3);
  const stepper = createFixedStepper(SIM.fixedDt, SIM.maxStepsPerFrame);
  let previous: Stage3State = game.initial();
  let current: Stage3State = previous;
  let input: InputFrame = { throttle: 0, steer: 0 };

  // ---- カメラ：機体の後ろ・上から追う。左右の傾きには合わせない（酔わないように） ----
  const desired = new THREE.Vector3();
  const target = new THREE.Vector3();
  const lookAt = new THREE.Vector3();
  const placeCamera = (p: PlaneState, t: number) => {
    const fx = -Math.sin(p.heading);
    const fz = -Math.cos(p.heading);
    desired.set(
      p.x - fx * STAGE3.cameraDistance,
      p.y + STAGE3.cameraHeight,
      p.z - fz * STAGE3.cameraDistance,
    );
    target.set(
      p.x + fx * CAMERA.lookAhead,
      p.y + Math.sin(p.pitch) * CAMERA.lookAhead,
      p.z + fz * CAMERA.lookAhead,
    );
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
  const v3 = (v: THREE.Vector3) => ({ x: v.x, y: v.y, z: v.z });
  window.__nori = {
    fpsSamples,
    get carModel() {
      return planeModel;
    },
    frames: 0,
    state: () => {
      throw new Error("ステージ3では plane() を使う");
    },
    stage: 3,
    plane: () => structuredClone(current),
    rings: () => [...game.rings.map((r) => ({ ...r })), { ...game.goal }],
    ringMarker: (i) => {
      const m = view.marker(i);
      return { ring: v3(m.ring), sky: v3(m.sky) };
    },
    get look() {
      return quality.lookState;
    },
    get quality() {
      return quality.quality;
    },
    get trees() {
      return view.trees.mode;
    },
    skyScenery: () => ({
      planes: view.scenery.planes.children.length,
      // ほかの飛行機は、自分の飛行機の GLB が読めたときに同じ形へ差しかえる
      planeModel,
      balloons: view.scenery.balloons.children.length,
      birds: view.scenery.birds[0]?.count ?? 0,
      planeAt: view.scenery.planes.children.map((o) => v3(o.position)),
    }),
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
  placeCamera(current.plane, 1);
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
    const a = previous.plane;
    const b = current.plane;
    const p: PlaneState = {
      ...b,
      x: a.x + (b.x - a.x) * alpha,
      y: a.y + (b.y - a.y) * alpha,
      z: a.z + (b.z - a.z) * alpha,
      heading: lerpAngle(a.heading, b.heading, alpha),
      pitch: a.pitch + (b.pitch - a.pitch) * alpha,
      bank: a.bank + (b.bank - a.bank) * alpha,
    };
    planeRoot.position.set(p.x, p.y - HALF_HEIGHT, p.z);
    // 上下は +X まわり（機首が上がる向きが正）、左右の傾きは前後の軸まわり（右に傾くと右の翼が下がる）
    planeRoot.rotation.set(p.pitch, p.heading, -p.bank, "YXZ");
    if (propeller && !reducedMotion.matches) propeller.rotation.z += frameSeconds * 30;
    // 景色（ほかの飛行機・気球・鳥）は、刻みの間を補間した時刻で動かす
    view.update(current, previous.tick + (current.tick - previous.tick) * alpha);
    statusView.update(current.tick, {
      stars: current.rings,
      nextCheckpoint: 0,
      finishTick: current.finishTick,
    });
    clearFlow.update(current.finishTick !== null, now / 1000);
    sound.update({
      tick: current.tick,
      collected: current.rings.filter(Boolean).length,
      checkpoints: 0,
      finished: current.finishTick !== null,
      touching: current.plane.touching,
    });
    placeCamera(p, 1 - Math.exp(-CAMERA.followSharpness * frameSeconds));
    sun.position.set(p.x + 20, p.y + 40, p.z + 10);
    sun.target.position.set(p.x, p.y, p.z);

    renderer.render(scene, camera);

    frames++;
    windowFrames++;
    if (now - windowStart >= 1000) {
      const fps = (windowFrames * 1000) / (now - windowStart);
      fpsSamples.push(Math.round(fps * 10) / 10);
      quality.sample(fps, fpsSamples.length);
      windowFrames = 0;
      windowStart = now;
      if (showDebug) hud.textContent = `${fps.toFixed(0)} fps · ${p.y.toFixed(0)} m`;
    }
    if (window.__nori) window.__nori.frames = frames;
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
};

/** GLB を読む前・読めなかったときの飛行機（箱の胴と翼。前は −Z、原点は底の中心） */
const createBoxPlane = (): THREE.Object3D => {
  const root = new THREE.Group();
  root.name = "plane";
  root.rotation.order = "YXZ";
  const mat = new THREE.MeshStandardMaterial({ color: 0xf28a8a, roughness: 0.6 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.9, 3.4).translate(0, 0.7, 0), mat);
  const wing = new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.15, 1).translate(0, 0.7, 0), mat);
  body.castShadow = wing.castShadow = true;
  root.add(body, wing);
  return root;
};

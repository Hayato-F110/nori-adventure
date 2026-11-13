// ステージ4（海・潜水艇）の起動とゲームのループ。URL に ?stage=4 のときだけ main.ts から読み込む（NORI-28）。
// タイトル画面（NORI-30）ができたら、ほかのステージと起動の部分をまとめる。
// 状態（src/core/stage4）を固定刻みで進め、描画はその状態を読むだけ。
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { ASSET, CAMERA, LOOK, SIM, STAGE4 } from "./config";
import { createFixedStepper } from "./core/loop";
import { createStage4Game, type Stage4State, type SubState } from "./core/stage4";
import type { InputFrame } from "./core/types";
import { createGamepadInput } from "./input/gamepad";
import { createKeyboardInput } from "./input/keyboard";
import { mergeInputs } from "./input/merge";
import { drivenInput } from "./input/testDriver";
import { createTouchInput, touchLayoutFor } from "./input/touch";
import type { ModelManifest } from "./render/carModel";
import { LIGHTMAPS, loadLook, surfacesFor } from "./render/look";
import { startQuality } from "./render/qualityControl";
import { createStage4View } from "./render/stage4View";
import { createStatusView } from "./render/statusView";
import { startClearFlow } from "./render/clearFlow";
import { startSound } from "./render/sound";

/** 潜水艇の高さの半分（原点は底の中心。状態の y は機体の真ん中） */
const HALF_HEIGHT = ASSET.vehicles.sub.size.height / 2;

export const startStage4 = async (canvas: HTMLCanvasElement, hud: HTMLElement, showDebug: boolean) => {
  const byId = (id: string) => {
    const el = document.getElementById(id);
    if (el === null) throw new Error(`index.html に #${id} が必要です`);
    return el;
  };
  // 上の表示：ほしの絵を魚の絵にして、見つけた生きものの数を出す。旗は使わないので隠す
  const icon = byId("star-count").parentElement?.querySelector("svg");
  if (icon) {
    icon.innerHTML =
      '<path d="M12 50 Q40 18 72 50 Q40 82 12 50 Z" fill="#ff8c1a" stroke="#fff" stroke-width="5"/>' +
      '<path d="M70 50 L92 32 L92 68 Z" fill="#ff8c1a" stroke="#fff" stroke-width="5" stroke-linejoin="round"/>' +
      '<circle cx="30" cy="46" r="5" fill="#fff"/>';
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

  const game = createStage4Game();
  const view = createStage4View(game.hints, game.treasure);

  // 水：霧と背景を同じ色にし、深さで明るい青 → 暗い青へ（真っ暗にはしない）
  const scene = new THREE.Scene();
  const waterColor = view.waterAt(STAGE4.start.depth).clone();
  scene.background = waterColor;
  const fog = new THREE.Fog(waterColor, STAGE4.fogNear, STAGE4.fogFar);
  scene.fog = fog;
  // まわりの明るさ：最小 minAmbient（深いところでも見える）
  const hemi = new THREE.HemisphereLight(0xbfe8ff, 0x3a5a6a, LOOK.hemiPlain);
  scene.add(hemi);
  // 海面からの光（上から）。影は潜水艇のまわりだけ
  const sun = new THREE.DirectionalLight(0xdff6ff, STAGE4.sunIntensity);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -25, right: 25, top: 25, bottom: -25, near: 1, far: 80 });
  scene.add(sun, sun.target);
  // 潜水艇のライト（前を照らす）
  const spot = new THREE.SpotLight(
    0xfff2cc,
    STAGE4.spotIntensity,
    STAGE4.lightRange,
    STAGE4.lightAngle,
    0.5,
    1,
  );
  scene.add(spot, spot.target);
  scene.add(view.root);

  const camera = new THREE.PerspectiveCamera(CAMERA.fov, 1, 0.1, 300);
  const resize = () => {
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
  };
  window.addEventListener("resize", resize);

  // ---- 見た目と画質（ほかのステージと同じ。画質はボタンで選べる） ----
  const quality = startQuality({
    renderer,
    scene,
    sun,
    hemi,
    applyLook: (look) => view.applyLook(look),
    resize: () => resize(),
  });
  resize();
  void loadLook({
    base: import.meta.env.BASE_URL,
    renderer,
    surfaces: surfacesFor(LOOK.surfaces, "stage4"),
    aoIntensity: LOOK.aoIntensity,
    aoDirect: LOOK.aoDirect,
    maxAnisotropy: LOOK.maxAnisotropy,
    lightmap: LIGHTMAPS.stage4,
  }).then((look) => quality.lookLoaded(look));

  // ---- 潜水艇：箱で始め、GLB（sub）が読めたら差しかえる。プロペラを回す ----
  let subRoot: THREE.Object3D = createBoxSub();
  let propeller: THREE.Object3D | undefined;
  let subModel: "box" | "glb" = "box";
  scene.add(subRoot);
  const gltfLoader = new GLTFLoader();
  void (async () => {
    try {
      const base = import.meta.env.BASE_URL;
      const manifest = (await (await fetch(`${base}models/manifest.json`)).json()) as ModelManifest;
      // 海の生きもの（7種類）：読めたものから差し替える。読めないものは簡単な形のまま
      void Promise.allSettled(
        ASSET.sea.variants.map(async (name) => {
          const e = manifest.models.find((m) => m.name === name);
          if (e === undefined) throw new Error(`${name} がない`);
          return [name, (await gltfLoader.loadAsync(`${base}models/${e.file}`)).scene] as const;
        }),
      ).then((results) => {
        const models = new Map<string, THREE.Object3D>();
        for (const r of results) if (r.status === "fulfilled") models.set(r.value[0], r.value[1]);
        view.useSeaModels(models);
      });
      const entry = manifest.models.find((m) => m.name === "sub");
      if (entry === undefined) return;
      const model = (await gltfLoader.loadAsync(`${base}models/${entry.file}`)).scene;
      if (ASSET.vehicles.sub.nodes.some((n) => model.getObjectByName(n) === undefined)) return;
      model.traverse((o) => {
        if (o instanceof THREE.Mesh) o.castShadow = true;
      });
      const root = new THREE.Group();
      root.add(model);
      root.rotation.order = "YXZ";
      scene.remove(subRoot);
      subRoot = root;
      propeller = model.getObjectByName("propeller");
      scene.add(subRoot);
      subModel = "glb";
    } catch {
      // 読めなければ箱のまま
    }
  })();

  // ---- 入力と上の表示（見つけた生きものの数・時間） ----
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
    touchLayoutFor(4), // ▲▼（上下）のボタン
  );
  const gamepads = createGamepadInput();
  const statusView = createStatusView(
    { starCount: byId("star-count"), flags: [], time: byId("time"), goal: byId("goal") },
    SIM.fixedDt,
  );

  // ゴールしたら紙ふぶきと「もう一回・つぎ・タイトル」（NORI-30）
  const clearFlow = startClearFlow(4);
  const sound = startSound(4);
  const stepper = createFixedStepper(SIM.fixedDt, SIM.maxStepsPerFrame);
  let previous: Stage4State = game.initial();
  let current: Stage4State = previous;
  let input: InputFrame = { throttle: 0, steer: 0 };

  // ---- カメラ：潜水艇の後ろ・上から追う ----
  const desired = new THREE.Vector3();
  const target = new THREE.Vector3();
  const lookAt = new THREE.Vector3();
  const placeCamera = (p: SubState, t: number) => {
    const fx = -Math.sin(p.heading);
    const fz = -Math.cos(p.heading);
    desired.set(
      p.x - fx * STAGE4.cameraDistance,
      p.y + STAGE4.cameraHeight,
      p.z - fz * STAGE4.cameraDistance,
    );
    target.set(p.x + fx * CAMERA.lookAhead, p.y, p.z + fz * CAMERA.lookAhead);
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
      return subModel;
    },
    frames: 0,
    state: () => {
      throw new Error("ステージ4では sub() を使う");
    },
    stage: 4,
    sub: () => structuredClone(current),
    creatures: () => STAGE4.creatures.map((_, i) => view.creatureAt(i)),
    sparkles: () => STAGE4.creatures.map((_, i) => view.sparkleAt(i)),
    get seaModels() {
      return view.seaModels;
    },
    treasureMarker: () => {
      const m = view.marker();
      return { treasure: v3(m.treasure), water: v3(m.water) };
    },
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
  placeCamera(current.sub, 1);
  let lastTime = performance.now();
  // E2E 用：時間を止める（状態を進めず、描画だけ続ける）。遅い CI でも、読んだ位置と撮った画面がずれない
  let frozenAt: number | null = null;
  if (window.__nori) {
    window.__nori.freeze = (on: boolean) => {
      frozenAt = on ? lastTime : null;
    };
  }

  const frame = (realNow: number) => {
    const now = frozenAt ?? realNow;
    const frameSeconds = frozenAt === null ? Math.min(0.25, (realNow - lastTime) / 1000) : 0;
    if (frozenAt === null) lastTime = realNow;
    input = mergeInputs([keyboard.read(), touch.read(), ...gamepads.read()]);
    const { alpha } = stepper.advance(frameSeconds, () => {
      previous = current;
      current = game.step(current, drivenInput(current, input));
    });

    // 前の刻みとの間を補間して描く（状態は変えない）
    const a = previous.sub;
    const b = current.sub;
    const p: SubState = {
      ...b,
      x: a.x + (b.x - a.x) * alpha,
      y: a.y + (b.y - a.y) * alpha,
      z: a.z + (b.z - a.z) * alpha,
      heading: lerpAngle(a.heading, b.heading, alpha),
      tilt: a.tilt + (b.tilt - a.tilt) * alpha,
    };
    subRoot.position.set(p.x, p.y - HALF_HEIGHT, p.z);
    subRoot.rotation.set(p.tilt, p.heading, 0, "YXZ");
    if (propeller && !reducedMotion.matches) propeller.rotation.z += frameSeconds * p.speed * 4;
    view.update(current, now / 1000, reducedMotion.matches);
    statusView.update(current.tick, {
      stars: current.found,
      nextCheckpoint: 0,
      finishTick: current.finishTick,
    });
    clearFlow.update(current.finishTick !== null, realNow / 1000);
    sound.update({
      tick: current.tick,
      collected: current.found.filter(Boolean).length,
      checkpoints: 0,
      finished: current.finishTick !== null,
      touching: current.sub.touching,
    });
    placeCamera(p, 1 - Math.exp(-CAMERA.followSharpness * frameSeconds));

    // 水の色（霧・背景）は深さで変わる
    // three.js の霧は色をコピーして持つので、背景と霧の両方に入れる
    const color = view.waterAt(-p.y);
    waterColor.copy(color);
    fog.color.copy(color);
    // 上からの光は、深いほど弱く（minAmbient より暗くしない）
    const depthRatio = Math.min(1, -p.y / STAGE4.maxDepth);
    sun.intensity = STAGE4.sunIntensity * Math.max(STAGE4.minAmbient, 1 - depthRatio);
    sun.position.set(p.x + 10, p.y + 40, p.z + 5);
    sun.target.position.set(p.x, p.y, p.z);
    // ライト：潜水艇の前から、進む向きへ
    const fx = -Math.sin(p.heading);
    const fz = -Math.cos(p.heading);
    spot.position.set(p.x + fx * 1.6, p.y, p.z + fz * 1.6);
    spot.target.position.set(p.x + fx * 10, p.y + Math.sin(p.tilt) * 10, p.z + fz * 10);

    renderer.render(scene, camera);

    frames++;
    windowFrames++;
    if (realNow - windowStart >= 1000) {
      const fps = (windowFrames * 1000) / (realNow - windowStart);
      fpsSamples.push(Math.round(fps * 10) / 10);
      quality.sample(fps, fpsSamples.length);
      windowFrames = 0;
      windowStart = realNow;
      if (showDebug) hud.textContent = `${fps.toFixed(0)} fps · ${(-p.y).toFixed(0)} m`;
    }
    if (window.__nori) window.__nori.frames = frames;
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
};

/** GLB を読む前・読めなかったときの潜水艇（丸い胴と窓。前は −Z、原点は底の中心） */
const createBoxSub = (): THREE.Object3D => {
  const root = new THREE.Group();
  root.name = "sub";
  root.rotation.order = "YXZ";
  const body = new THREE.Mesh(
    new THREE.SphereGeometry(0.9, 16, 12).scale(1, 1, 1.7).translate(0, 0.9, 0),
    new THREE.MeshStandardMaterial({ color: 0xffd23f, roughness: 0.5 }),
  );
  const window_ = new THREE.Mesh(
    new THREE.SphereGeometry(0.45, 12, 8).translate(0, 1.05, -1.2),
    new THREE.MeshStandardMaterial({ color: 0x7fd3ff, roughness: 0.2 }),
  );
  body.castShadow = true;
  root.add(body, window_);
  return root;
};

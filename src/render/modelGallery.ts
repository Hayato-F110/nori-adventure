// 乗り物のモデルを並べて見る確認用の画面（NORI-20〜23）。URL に ?models を付けたときだけ動く。
// ゲームは始めない。public/models/manifest.json にあるモデルを、同じオリジンから読むだけ（CSP の default-src 'self'）。
// 紹介動画のターンテーブルのカット（NORI-43）にも使える。
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import type { ModelManifest } from "./carModel";

/** 並べる順（ステージの順。最後に木 NORI-26）。manifest にないものは飛ばす */
export const GALLERY_ORDER = ["car", "train", "plane", "sub", "rover", "tree-a", "tree-b"] as const;
/** 隣との間（m） */
export const GALLERY_GAP = 1.5;

/** 幅の一覧から、左から右へ並べたときの中心の x を返す（全体の中心が 0） */
export const galleryLayout = (widths: readonly number[], gap = GALLERY_GAP): number[] => {
  const total = widths.reduce((sum, w) => sum + w, 0) + gap * Math.max(0, widths.length - 1);
  let left = -total / 2;
  return widths.map((w) => {
    const center = left + w / 2;
    left += w + gap;
    return center;
  });
};

declare global {
  interface Window {
    /** E2E 用の読み取り口（確認用の画面） */
    __noriGallery?: { loaded: string[]; failed: string[]; frames: number; fpsSamples: number[] };
  }
}

export const startModelGallery = async (canvas: HTMLCanvasElement, base: string): Promise<void> => {
  const info = { loaded: [] as string[], failed: [] as string[], frames: 0, fpsSamples: [] as number[] };
  window.__noriGallery = info;

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x9fd8ff);
  scene.add(new THREE.HemisphereLight(0xdff3ff, 0x8a8f99, 1.6));
  const sun = new THREE.DirectionalLight(0xffffff, 2.0);
  sun.position.set(8, 14, 10);
  sun.castShadow = true;
  Object.assign(sun.shadow.camera, { left: -16, right: 16, top: 8, bottom: -8, near: 1, far: 50 });
  scene.add(sun);
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(400, 400),
    new THREE.MeshStandardMaterial({ color: 0xd9dde3 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  const manifest = (await (await fetch(`${base}models/manifest.json`)).json()) as ModelManifest;
  const loader = new GLTFLoader();
  const entries = GALLERY_ORDER.flatMap((name) => manifest.models.filter((m) => m.name === name));
  const models: THREE.Object3D[] = [];
  for (const entry of entries) {
    try {
      const model = (await loader.loadAsync(`${base}models/${entry.file}`)).scene;
      model.traverse((obj) => {
        if (obj instanceof THREE.Mesh) obj.castShadow = true;
      });
      model.name = entry.name;
      models.push(model);
      info.loaded.push(entry.name);
    } catch {
      info.failed.push(entry.name);
    }
  }
  // 向きを変えても重ならないよう、上から見た対角の長さを幅として並べる
  const widths = models.map((m) => {
    const size = new THREE.Box3().setFromObject(m).getSize(new THREE.Vector3());
    return Math.hypot(size.x, size.z);
  });
  galleryLayout(widths).forEach((x, i) => {
    const holder = new THREE.Group();
    holder.position.x = x;
    holder.rotation.y = Math.PI * 0.8; // 斜め前（前は −Z）をカメラに向ける
    holder.add(models[i] as THREE.Object3D);
    scene.add(holder);
  });

  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 200);
  const totalWidth = widths.reduce((s, w) => s + w, 0) + GALLERY_GAP * Math.max(0, widths.length - 1);
  const resize = () => {
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    camera.aspect = window.innerWidth / window.innerHeight;
    // 横いっぱいに全部が入る距離
    const halfFov = Math.atan(Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.aspect);
    const distance = (totalWidth / 2 + 1) / Math.tan(halfFov);
    camera.position.set(0, distance * 0.35, distance);
    camera.lookAt(0, 0.9, 0);
    camera.updateProjectionMatrix();
  };
  window.addEventListener("resize", resize);
  resize();

  let windowFrames = 0;
  let windowStart = performance.now();
  const frame = (now: number) => {
    renderer.render(scene, camera);
    info.frames++;
    windowFrames++;
    if (now - windowStart >= 1000) {
      info.fpsSamples.push(Math.round(((windowFrames * 1000) / (now - windowStart)) * 10) / 10);
      windowFrames = 0;
      windowStart = now;
    }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
};

// リアル寄りの見た目の素材を読む（NORI-56。docs/game-rules.md「見た目」）。
// public/textures/ の CC0 の素材だけを、同じオリジンから読む（CSP の default-src 'self'）。読めなければ null（単色のまま続ける）。
import * as THREE from "three";
import { HDRLoader } from "three/addons/loaders/HDRLoader.js";

export type SurfaceName = "grass" | "road" | "brick" | "facade" | "bark" | "sand";

export type SurfaceSpec = {
  readonly texture: string;
  readonly tileMeters: number;
  readonly tint: readonly number[];
};

export type Look = {
  /** 素材ごとの材質（建物の色をのせる facade は、色ごとに作る） */
  material(surface: SurfaceName, tint?: THREE.ColorRepresentation): THREE.MeshStandardMaterial;
  /** まわりの光（HDRI を PMREM にしたもの） */
  environment: THREE.Texture;
  tileMeters(surface: SurfaceName): number;
};

type TextureManifest = { textures: { file: string }[] };

export type LookDeps = {
  base: string;
  renderer: THREE.WebGLRenderer;
  /** 読む素材（ステージで使うものだけ。surfacesFor） */
  surfaces: Readonly<Partial<Record<SurfaceName, SurfaceSpec>>>;
  /** 焼き付けた地面の陰の強さ（LOOK.aoIntensity） */
  aoIntensity?: number;
  /** 焼き付けた陰を、太陽の直接の光にも効かせる割合（LOOK.aoDirect。0 なら効かせない） */
  aoDirect?: number;
  /** テクスチャの異方性フィルタの上限（LOOK.maxAnisotropy） */
  maxAnisotropy?: number;
  /** 地面に重ねる焼き付けた陰（ステージごと。既定はステージ1の LIGHTMAPS.stage1） */
  lightmap?: string;
  fetchManifest?: (url: string) => Promise<TextureManifest>;
};

/** 焼き付けた地面の陰の画像（ステージごと。tools/assets/textures.ts の LIGHTMAP_FILES と同じ） */
export const LIGHTMAPS = {
  stage1: "ground_ao.webp",
  stage2: "ground_ao_stage2.webp",
  stage3: "ground_ao_stage3.webp",
  stage4: "ground_ao_stage4.webp",
} as const;

/**
 * ステージごとに使う素材（その分だけ読む。使わない素材を読むと、起動の直後が重くなる）。
 * 街（city.ts）：芝・道・れんが・外壁、木（trees.ts）：幹・芝、ステージ2：芝・道（土手）・れんが、ステージ3：芝、ステージ4：砂
 */
export const STAGE_SURFACES = {
  stage1: ["grass", "road", "brick", "facade", "bark"],
  stage2: ["grass", "road", "brick", "bark"],
  stage3: ["grass", "bark"],
  stage4: ["sand"],
} as const satisfies Record<keyof typeof LIGHTMAPS, readonly SurfaceName[]>;

/** 全部の素材（LOOK.surfaces）から、そのステージで使うものだけを取り出す */
export const surfacesFor = (
  all: Readonly<Record<SurfaceName, SurfaceSpec>>,
  stage: keyof typeof STAGE_SURFACES,
): Partial<Record<SurfaceName, SurfaceSpec>> =>
  Object.fromEntries(STAGE_SURFACES[stage].map((name) => [name, all[name]]));

const MAPS = ["color", "normal", "roughness"] as const;

export const loadLook = async (deps: LookDeps): Promise<Look | null> => {
  try {
    const fetchManifest =
      deps.fetchManifest ?? (async (url: string) => (await (await fetch(url)).json()) as TextureManifest);
    const manifest = await fetchManifest(`${deps.base}textures/manifest.json`);
    const listed = new Set(manifest.textures.map((t) => t.file));
    const textureLoader = new THREE.TextureLoader();
    const load = async (file: string, color: boolean) => {
      if (!listed.has(file)) throw new Error(`manifest にない：${file}`);
      const t = await textureLoader.loadAsync(`${deps.base}textures/${file}`);
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.colorSpace = color ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      t.anisotropy = Math.min(deps.maxAnisotropy ?? 1, deps.renderer.capabilities.getMaxAnisotropy());
      return t;
    };
    const specs = (Object.entries(deps.surfaces) as [SurfaceName, SurfaceSpec | undefined][]).filter(
      (e): e is [SurfaceName, SurfaceSpec] => e[1] !== undefined,
    );
    const maps = new Map<SurfaceName, Record<(typeof MAPS)[number], THREE.Texture>>();
    await Promise.all(
      specs.map(async ([name, spec]) => {
        const [color, normal, roughness] = await Promise.all(
          MAPS.map((m) => load(`${spec.texture}_${m}.webp`, m === "color")),
        );
        // UV はメートル単位（setBoxUvMeters・setPlaneUvMeters）。素材1枚の大きさは繰り返しで合わせる
        for (const t of [color, normal, roughness]) t?.repeat.set(1 / spec.tileMeters, 1 / spec.tileMeters);
        maps.set(name, { color, normal, roughness } as Record<(typeof MAPS)[number], THREE.Texture>);
      }),
    );
    // 焼き付けた地面の陰（AO）。uv1（setGroundUv1）で地面と道に重ねる
    const groundAo = await load(deps.lightmap ?? LIGHTMAPS.stage1, false);
    groundAo.wrapS = groundAo.wrapT = THREE.ClampToEdgeWrapping;
    groundAo.channel = 1;
    if (!listed.has("sky.hdr")) throw new Error("manifest に sky.hdr がない");
    const hdr = await new HDRLoader().loadAsync(`${deps.base}textures/sky.hdr`);
    hdr.mapping = THREE.EquirectangularReflectionMapping;
    const pmrem = new THREE.PMREMGenerator(deps.renderer);
    const environment = pmrem.fromEquirectangular(hdr).texture;
    hdr.dispose();
    pmrem.dispose();

    const cache = new Map<string, THREE.MeshStandardMaterial>();
    return {
      environment,
      tileMeters: (surface) => deps.surfaces[surface]?.tileMeters ?? 1,
      material(surface, tint) {
        const key = `${surface}|${tint === undefined ? "" : new THREE.Color(tint).getHexString()}`;
        const hit = cache.get(key);
        if (hit) return hit;
        const m = maps.get(surface);
        if (m === undefined) throw new Error(`素材がない：${surface}`);
        const [r = 1, g = 1, b = 1] = deps.surfaces[surface]?.tint ?? [];
        // tint は線形の値。建物の色（sRGB の16進）は、その上にかける
        const color = new THREE.Color().setRGB(r, g, b, THREE.LinearSRGBColorSpace);
        if (tint !== undefined) color.multiply(new THREE.Color(tint));
        const mat = new THREE.MeshStandardMaterial({
          map: m.color,
          normalMap: m.normal,
          roughnessMap: m.roughness,
          color,
          roughness: surface === "grass" ? 0.95 : 1,
          // 地面と道だけに、焼き付けた陰を重ねる（建物の壁には使わない）
          ...(surface === "grass" || surface === "road"
            ? { aoMap: groundAo, aoMapIntensity: deps.aoIntensity ?? 1 }
            : {}),
        });
        if (mat.aoMap !== null) {
          // three.js の aoMap は「まわりからの光」だけを暗くする。建物の足元の陰が見えるよう、
          // 太陽の直接の光にも aoDirect の割合だけ効かせる（シェーダーに1行足す）
          const direct = deps.aoDirect ?? 0;
          mat.onBeforeCompile = (shader) => {
            shader.fragmentShader = shader.fragmentShader.replace(
              "#include <aomap_fragment>",
              `#include <aomap_fragment>\n#ifdef USE_AOMAP\nreflectedLight.directDiffuse *= mix(1.0, ambientOcclusion, ${direct.toFixed(3)});\n#endif`,
            );
          };
          mat.customProgramCacheKey = () => `ao-direct-${direct}`;
        }
        cache.set(key, mat);
        return mat;
      },
    };
  } catch {
    return null;
  }
};

/**
 * 面の UV を、実際の大きさ（m）÷ tile にする（既定はメートル単位。テクスチャが伸びない）。
 * BoxGeometry（分割1）の面の順：+X・−X・+Y・−Y・+Z・−Z。各面は4頂点
 */
export const setBoxUvMeters = (geo: THREE.BufferGeometry, w: number, h: number, d: number, tile = 1) => {
  const uv = geo.getAttribute("uv") as THREE.BufferAttribute;
  // 面ごとの（横, 縦）の長さ
  const faces: [number, number][] = [
    [d, h],
    [d, h],
    [w, d],
    [w, d],
    [w, h],
    [w, h],
  ];
  faces.forEach(([su, sv], f) => {
    for (let i = 0; i < 4; i++) {
      const k = f * 4 + i;
      uv.setXY(k, (uv.getX(k) * su) / tile, (uv.getY(k) * sv) / tile);
    }
  });
  uv.needsUpdate = true;
  return geo;
};

/**
 * 2つ目の UV（uv1）を、世界の位置から地面全体の 0〜1 にする（焼き付けた地面の陰を重ねるため）。
 * u = (x + 半分) / 大きさ、v = (−z + 半分) / 大きさ（tools/blender/bake-ground-ao.py と同じ）。
 * 形（geometry）はメッシュごとに別のものにしておく（同じ形を共有すると、置き場所の違いが反映されない）
 */
export const setGroundUv1 = (mesh: THREE.Mesh, groundSize: number) => {
  mesh.updateMatrixWorld(true);
  const pos = mesh.geometry.getAttribute("position");
  const half = groundSize / 2;
  const p = new THREE.Vector3();
  const uv1 = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    p.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld);
    uv1[i * 2] = (p.x + half) / groundSize;
    uv1[i * 2 + 1] = (-p.z + half) / groundSize;
  }
  mesh.geometry.setAttribute("uv1", new THREE.BufferAttribute(uv1, 2));
  return mesh;
};

/** 平面（PlaneGeometry）の UV を、幅・長さ（m）÷ 素材の大きさにする */
export const setPlaneUvMeters = (geo: THREE.BufferGeometry, w: number, h: number, tile = 1) => {
  const uv = geo.getAttribute("uv") as THREE.BufferAttribute;
  for (let k = 0; k < uv.count; k++) uv.setXY(k, (uv.getX(k) * w) / tile, (uv.getY(k) * h) / tile);
  uv.needsUpdate = true;
  return geo;
};

/**
 * 焼き付けた地面の陰（ステージ1の配置。uv1）を外した材質。ステージ1の地面以外（ステージ2・木の葉）で芝などの素材を使うとき
 */
export const withoutAo = (mat: THREE.MeshStandardMaterial): THREE.MeshStandardMaterial => {
  if (mat.aoMap === null) return mat;
  const copy = mat.clone();
  copy.aoMap = null;
  copy.onBeforeCompile = () => undefined;
  copy.customProgramCacheKey = () => "no-ao";
  return copy;
};

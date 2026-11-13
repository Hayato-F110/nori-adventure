// ステージ1の街のにぎわい（NORI-61。docs/game-rules.md「街をにぎやかに」）：ほかの車・自転車・バイク・人・雲・太陽。
// 位置はゲームの状態（src/core/traffic.ts・citySky.ts）を読むだけ。簡単な箱で始め、Blender の自作モデル（ASSET.city）が
// 読めたら差しかえる（useModels）。
import * as THREE from "three";
import { ASSET, CITY_SKY, TRAFFIC } from "../config";
import { cloudPositions, lampsOn } from "../core/citySky";
import { hash01 } from "../core/stage1Layout";
import type { BikeKind, TrafficPoses } from "../core/traffic";
import type { Pose2D } from "../core/types";

type CityName = (typeof ASSET.city.variants)[number];

export type CityLifeView = {
  root: THREE.Group;
  /**
   * prev・next は前と今の刻みの位置、t は2つの間のどこを描くか（0〜1。子どもの車と同じ補間）。
   * tick は今の刻みの数（雲・ランプ）、focus は太陽を置く基準（カメラの見ている所）
   */
  update(
    prev: TrafficPoses,
    next: TrafficPoses,
    t: number,
    tick: number,
    reducedMotion: boolean,
    focus: THREE.Vector3,
  ): void;
  /** 自作モデル（名前 → 読んだ GLB の scene）で差しかえる。差しかえた種類の数を返す */
  useModels(models: ReadonlyMap<string, THREE.Object3D>): number;
  /** 自作モデルに差しかえた種類の数（E2E で確かめる） */
  readonly models: number;
};

type Slot = {
  /** 置き場所（向き・位置を付ける）。中身（箱かモデル）を入れかえる */
  holder: THREE.Group;
  model: CityName;
  /** 服の色（人・乗る人）。null なら塗りかえない */
  shirt: THREE.Color | null;
  /** パトカー・消防車のランプ（差しかえたあと） */
  lamps: { red: THREE.MeshStandardMaterial[]; blue: THREE.MeshStandardMaterial[] };
};

const shirtColor = (i: number): THREE.Color =>
  new THREE.Color(
    TRAFFIC.shirtColors[
      ((i % TRAFFIC.shirtColors.length) + TRAFFIC.shirtColors.length) % TRAFFIC.shirtColors.length
    ],
  );

/** 読みこむ前の簡単な形：モデルの大きさの箱（原点は底の中心） */
const placeholder = (model: CityName, color: THREE.ColorRepresentation): THREE.Mesh => {
  const size = ASSET.city.sizes[model];
  const box = new THREE.Mesh(
    new THREE.BoxGeometry(size.width, size.height, size.length),
    new THREE.MeshStandardMaterial({ color, roughness: 0.6 }),
  );
  box.position.y = size.height / 2;
  box.castShadow = true;
  return box;
};

const lerpAngle = (a: number, b: number, t: number): number =>
  a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * t;

const place = (holder: THREE.Object3D, a: Pose2D | undefined, b: Pose2D | undefined, t: number): void => {
  if (!a || !b) return;
  // 道は閉じた輪なので、1刻みで位置が飛ぶことはない（前と今の間をそのまま補間する）
  holder.position.set(a.x + (b.x - a.x) * t, 0, a.z + (b.z - a.z) * t);
  holder.rotation.y = lerpAngle(a.heading, b.heading, t);
};

export const createCityLifeView = (
  vehicleModels: readonly string[],
  bikeKinds: readonly BikeKind[],
  people: number,
): CityLifeView => {
  const root = new THREE.Group();
  root.name = "city-life";

  const makeSlot = (model: CityName, shirt: THREE.Color | null): Slot => {
    const holder = new THREE.Group();
    holder.name = model;
    // 読みこむ前の箱は1色（服の色で塗ると、自転車の箱が丸ごと色の箱になって目立つ。kids-ui-reviewer の指摘）
    holder.add(placeholder(model, TRAFFIC.placeholderColor));
    root.add(holder);
    return { holder, model, shirt, lamps: { red: [], blue: [] } };
  };
  const asCity = (name: string): CityName => {
    if (!(ASSET.city.variants as readonly string[]).includes(name))
      throw new Error(`${name} は ASSET.city にない`);
    return name as CityName;
  };
  const vehicles = vehicleModels.map((m) => makeSlot(asCity(m), null));
  const bikes = bikeKinds.map((k, i) => makeSlot(k, shirtColor(i + 2)));
  const walkers = Array.from({ length: people }, (_, k) => makeSlot("person", shirtColor(k)));
  const all = [...vehicles, ...bikes, ...walkers];

  // ---- 雲（ステージ2と同じ形。位置は刻みの数で決まる） ----
  const cloudMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, flatShading: true });
  const { minRadius, maxRadius, scale } = CITY_SKY.cloudSize;
  const clouds = Array.from({ length: CITY_SKY.clouds.count }, (_, i) => {
    const radius = minRadius + hash01(i, 4, 61) * (maxRadius - minRadius);
    const cloud = new THREE.Mesh(new THREE.IcosahedronGeometry(radius, 1), cloudMat);
    cloud.scale.set(scale[0], scale[1], scale[2]);
    root.add(cloud);
    return cloud;
  });

  // ---- 太陽（光の向きの 300 m 先。光・霧・トーンマッピングの影響を受けない色） ----
  const sun = new THREE.Sprite(
    new THREE.SpriteMaterial({ color: new THREE.Color(CITY_SKY.sunColor), fog: false, toneMapped: false }),
  );
  sun.name = "sun";
  sun.scale.setScalar(CITY_SKY.sunRadius * 2);
  root.add(sun);
  /** 光の向き（main.ts の太陽の光と同じ CITY_SKY.sunOffset の向き） */
  const sunDir = new THREE.Vector3(
    CITY_SKY.sunOffset.x,
    CITY_SKY.sunOffset.y,
    CITY_SKY.sunOffset.z,
  ).normalize();

  let models = 0;

  return {
    root,
    get models() {
      return models;
    },
    update(prev, next, t, tick, reducedMotion, focus) {
      vehicles.forEach((s, i) => place(s.holder, prev.vehicles[i], next.vehicles[i], t));
      bikes.forEach((s, i) => place(s.holder, prev.bikes[i], next.bikes[i], t));
      walkers.forEach((s, i) => place(s.holder, prev.people[i], next.people[i], t));

      const lamps = lampsOn(tick, TRAFFIC, reducedMotion);
      for (const s of vehicles) {
        for (const m of s.lamps.red) m.emissiveIntensity = lamps.red ? TRAFFIC.lampGlow : 0;
        for (const m of s.lamps.blue) m.emissiveIntensity = lamps.blue ? TRAFFIC.lampGlow : 0;
      }

      cloudPositions(tick, CITY_SKY).forEach((c, i) => clouds[i]?.position.set(c.x, c.y, c.z));
      sun.position.copy(focus).addScaledVector(sunDir, CITY_SKY.sunDistance);
    },
    useModels(loaded) {
      const replaced = new Set<CityName>();
      for (const slot of all) {
        const source = loaded.get(slot.model);
        if (!source?.getObjectByName(ASSET.city.nodes[0])) continue;
        const model = source.clone(true);
        slot.lamps = { red: [], blue: [] };
        model.traverse((o) => {
          if (!(o instanceof THREE.Mesh) || Array.isArray(o.material)) return;
          o.castShadow = true;
          const mat = o.material as THREE.MeshStandardMaterial;
          if (mat.name === "shirt" && slot.shirt) {
            o.material = mat.clone();
            (o.material as THREE.MeshStandardMaterial).color.copy(slot.shirt);
          } else if (mat.name === "lamp_red" || mat.name === "lamp_blue") {
            // ランプは1台ごとに素材を分け、自分の色で自ら光らせる（つける・消すは update）
            const lamp = mat.clone();
            lamp.emissive.copy(lamp.color);
            lamp.emissiveIntensity = 0;
            o.material = lamp;
            slot.lamps[mat.name === "lamp_red" ? "red" : "blue"].push(lamp);
          }
        });
        slot.holder.clear();
        slot.holder.add(model);
        replaced.add(slot.model);
      }
      models = replaced.size;
      return models;
    },
  };
};

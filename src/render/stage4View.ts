// ステージ4の海の見た目（docs/game-rules.md「ステージ4」。NORI-28）。状態を読むだけ。
// 海底（砂）・岩・海草・光るあわ（手がかり）・たからばこ・泳ぐ生きもの6種類・まわりの魚の群れ。
// 生きもの・魚は簡単な形で始め、Blender の自作モデル（sea-*）が読めたら差し替える（useSeaModels）。
// 並びは設定（STAGE4）と、決まった式で作る。
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { ASSET, LOOK, SIM, STAGE4 } from "../config";
import { type Creature, creaturePosition, type Hint, type Point3, type Stage4State } from "../core/stage4";
import { type Look, setGroundUv1, setPlaneUvMeters } from "./look";

const SEABED = -STAGE4.maxDepth;
const GROUND_SIZE = STAGE4.boundsHalfSize * 2 + 120;

/** 水の色：浅いところ（明るい）と深いところ（暗い。真っ暗にはしない） */
const WATER_SHALLOW = new THREE.Color(STAGE4.waterShallowColor);
const WATER_DEEP = new THREE.Color(STAGE4.waterDeepColor);

/** 0〜1 の決まった値（海草・魚の並びだけに使う） */
const hash = (i: number): number => {
  const v = Math.sin(i * 12.9898 + 78.233) * 43758.5453;
  return v - Math.floor(v);
};

export type Stage4View = {
  root: THREE.Group;
  applyLook(look: Look | null): void;
  /** seconds は描画の時刻（あわ・魚の群れの動きだけに使う。ゲームの状態には影響しない） */
  update(state: Stage4State, seconds: number, reducedMotion: boolean): void;
  /** 深さ（m）の水の色 */
  waterAt(depth: number): THREE.Color;
  /** 生きもの（番号 i）の今の位置（E2E で操縦の目標にする） */
  creatureAt(i: number): Point3;
  /** 生きもの（番号 i）のきらきら（1つめ）の今の位置。見つけたあとは null（E2E で明るさの比を測る） */
  sparkleAt(i: number): Point3 | null;
  /** たからばこの真ん中と、横の海底（E2E で明るさの比を測る） */
  marker(): { treasure: THREE.Vector3; water: THREE.Vector3 };
  /**
   * 自作モデル（名前 → 読んだ GLB の scene）で、生きもの・群れの魚を差し替える。
   * ないモデル・部品 body のないモデルは、その種類だけ簡単な形のまま。差し替えた種類の数を返す
   */
  useSeaModels(models: ReadonlyMap<string, THREE.Object3D>): number;
  /** 自作モデルに差し替えた種類の数（0 なら全部簡単な形。E2E で確かめる） */
  readonly seaModels: number;
};

type SeaName = (typeof ASSET.sea.variants)[number];

/** モデルの部品 body の下の形を、body より外側の位置・向きも焼き込んで取り出す（素材ごとに1つ） */
const seaParts = (model: THREE.Object3D) => {
  const body = model.getObjectByName(ASSET.sea.nodes[0]);
  if (body === undefined) return null;
  model.updateMatrixWorld(true);
  const parts: { geometry: THREE.BufferGeometry; material: THREE.Material }[] = [];
  body.traverse((o) => {
    if (o instanceof THREE.Mesh && !Array.isArray(o.material)) {
      parts.push({ geometry: o.geometry.clone().applyMatrix4(o.matrixWorld), material: o.material });
    }
  });
  return parts.length > 0 ? parts : null;
};

const std = (color: THREE.ColorRepresentation, extra: THREE.MeshStandardMaterialParameters = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness: 0.8, ...extra });

/**
 * 生きものを、自分の色の STAGE4.creatureGlow 倍だけ自ら光らせる（青い水の中でも見えるように。NORI-62）。
 * 素材は生きものごとに別にする（GLB の素材を書き換えるので、ほかと共有しない）
 */
const selfLit = <T extends THREE.Object3D>(obj: T): T => {
  obj.traverse((o) => {
    if (!(o instanceof THREE.Mesh) || !(o.material instanceof THREE.MeshStandardMaterial)) return;
    const m = o.material.clone();
    m.emissive.copy(m.color).multiplyScalar(STAGE4.creatureGlow);
    m.emissiveIntensity = 1;
    o.material = m;
  });
  return obj;
};

/** 生きものの簡単な形（前は −Z。大きさはおよそ 1〜3 m） */
const creatureMesh = (kind: Creature["kind"]): THREE.Object3D => {
  const g = new THREE.Group();
  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, pos: [number, number, number] = [0, 0, 0]) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(...pos);
    g.add(m);
    return m;
  };
  switch (kind) {
    case "turtle": {
      const shell = std(0x5d7a3a, { flatShading: true });
      const skin = std(0x9bbf7a);
      add(new THREE.SphereGeometry(1, 12, 8).scale(1, 0.4, 1.2), shell);
      add(new THREE.SphereGeometry(0.35, 10, 8), skin, [0, 0.05, -1.3]);
      for (const [x, z] of [
        [-1, -0.5],
        [1, -0.5],
        [-0.7, 0.8],
        [0.7, 0.8],
      ] as const) {
        add(new THREE.BoxGeometry(0.9, 0.08, 0.35), skin, [x, -0.05, z]);
      }
      break;
    }
    case "ray": {
      const shape = new THREE.Shape();
      shape.moveTo(0, -1.4);
      shape.lineTo(1.8, 0.2);
      shape.lineTo(0, 1);
      shape.lineTo(-1.8, 0.2);
      shape.closePath();
      add(
        new THREE.ExtrudeGeometry(shape, { depth: 0.15, bevelEnabled: false }).rotateX(Math.PI / 2),
        std(0x55606e),
      );
      add(new THREE.CylinderGeometry(0.04, 0.02, 2.2).rotateX(Math.PI / 2), std(0x55606e), [0, 0, 2]);
      break;
    }
    case "jellyfish": {
      const mat = new THREE.MeshStandardMaterial({
        color: 0xff9ad5,
        emissive: 0x803060,
        transparent: true,
        opacity: 0.8,
      });
      add(new THREE.SphereGeometry(0.8, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat);
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        add(new THREE.CylinderGeometry(0.04, 0.02, 1.6), mat, [Math.cos(a) * 0.5, -0.8, Math.sin(a) * 0.5]);
      }
      break;
    }
    case "octopus": {
      const mat = std(0xe0603a);
      add(new THREE.SphereGeometry(0.7, 12, 10).scale(1, 1.2, 1), mat, [0, 0.6, 0]);
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        const leg = add(new THREE.CylinderGeometry(0.1, 0.05, 1.2), mat, [
          Math.cos(a) * 0.6,
          -0.1,
          Math.sin(a) * 0.6,
        ]);
        leg.rotation.set(Math.sin(a) * 0.8, 0, -Math.cos(a) * 0.8);
      }
      break;
    }
    case "tropical": {
      add(new THREE.SphereGeometry(0.5, 12, 8).scale(0.4, 1, 1.2), std(0xff8c1a));
      add(new THREE.BoxGeometry(0.22, 1, 0.12), std(0xffffff), [0, 0, -0.1]);
      add(new THREE.ConeGeometry(0.35, 0.5, 4).rotateX(-Math.PI / 2), std(0xff8c1a), [0, 0, 0.75]);
      break;
    }
    case "dolphin": {
      const mat = std(0x8aa4b8, { roughness: 0.4 });
      add(new THREE.SphereGeometry(0.6, 14, 10).scale(1, 0.9, 3), mat);
      add(new THREE.ConeGeometry(0.2, 0.7, 6).rotateX(-Math.PI / 2), mat, [0, -0.05, -2]);
      add(new THREE.ConeGeometry(0.3, 0.6, 4), mat, [0, 0.7, 0.2]);
      add(new THREE.BoxGeometry(1.4, 0.08, 0.4), mat, [0, 0, 1.8]);
      break;
    }
  }
  return g;
};

/** 魚1匹の形（群れ用。前は −Z） */
const fishGeometry = () =>
  mergeGeometries([
    new THREE.SphereGeometry(0.25, 8, 6).scale(0.5, 0.9, 1.4),
    new THREE.ConeGeometry(0.2, 0.3, 4).rotateX(-Math.PI / 2).translate(0, 0, 0.45),
  ]);

export const createStage4View = (hints: readonly Hint[], treasure: Point3): Stage4View => {
  const root = new THREE.Group();
  root.name = "stage4";

  // 海底（砂）と岩
  // 高画質では砂の素材（LOOK.surfaces.sand）と焼き付けた海底の陰（岩の足元。範囲は LOOK.seaBakeSize）。
  // 低画質・素材が読めないときは単色の砂（STAGE4.sandColor。同じ平均の明るさ）
  const sandPlain = std(STAGE4.sandColor, { roughness: 1 });
  const sandGeo = setPlaneUvMeters(
    new THREE.PlaneGeometry(GROUND_SIZE, GROUND_SIZE),
    GROUND_SIZE,
    GROUND_SIZE,
  );
  const sand = new THREE.Mesh(sandGeo.rotateX(-Math.PI / 2), sandPlain);
  sand.position.y = SEABED;
  root.add(sand);
  setGroundUv1(sand, LOOK.seaBakeSize);
  const rockMat = std(0x6b6f73, { flatShading: true, roughness: 1 });
  STAGE4.rocks.forEach((r, i) => {
    const rock = new THREE.Mesh(new THREE.IcosahedronGeometry(r.radius, 1), rockMat);
    rock.position.set(r.x, SEABED, r.z);
    rock.rotation.set(i, i * 2, 0);
    root.add(rock);
  });

  // 海草（細い板。決まった並び。岩・道の上を避けずに、海底一面に散らす）
  const weedGeo = new THREE.BoxGeometry(0.25, 3, 0.05).translate(0, 1.5, 0);
  const weeds = new THREE.InstancedMesh(weedGeo, std(0x2f8a4a), 160);
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const one = new THREE.Vector3(1, 1, 1);
  const pos = new THREE.Vector3();
  const scl = new THREE.Vector3();
  for (let i = 0; i < weeds.count; i++) {
    pos.set(
      (hash(i) - 0.5) * 2 * STAGE4.boundsHalfSize,
      SEABED,
      (hash(i + 500) - 0.5) * 2 * STAGE4.boundsHalfSize,
    );
    q.setFromEuler(e.set((hash(i + 900) - 0.5) * 0.3, hash(i + 700) * Math.PI, 0));
    scl.set(1, 0.6 + hash(i + 300) * 1.2, 1);
    weeds.setMatrixAt(i, m4.compose(pos, q, scl));
  }
  root.add(weeds);

  // 光るあわ（手がかり）：近いほど多い。上へのぼって、また下から
  const bubbleGeo = new THREE.SphereGeometry(STAGE4.bubbleRadius, 8, 6);
  const bubbleMat = new THREE.MeshBasicMaterial({ color: STAGE4.bubbleColor, toneMapped: false });
  const bubbleTotal = hints.reduce((s, h) => s + h.bubbles, 0);
  const bubbles = new THREE.InstancedMesh(bubbleGeo, bubbleMat, bubbleTotal);
  const bubbleBase: { x: number; y: number; z: number; phase: number }[] = [];
  hints.forEach((h, hi) => {
    for (let k = 0; k < h.bubbles; k++) {
      const n = hi * 31 + k;
      bubbleBase.push({
        x: h.x + (hash(n) - 0.5) * 2 * STAGE4.bubbleSpread,
        y: h.y - 2,
        z: h.z + (hash(n + 100) - 0.5) * 2 * STAGE4.bubbleSpread,
        phase: hash(n + 200),
      });
    }
  });
  root.add(bubbles);

  // たからばこ（金色の箱とふた）。ゴールしたら、ふたが開く
  // 金色は光の当たり方に左右されない色（深い海でも水との明るさの比 3 以上）。霧は残す（遠くからは見えない）。
  // 箱とふたで金色を少し変え、茶色の帯で形が分かるようにする
  const chest = new THREE.Group();
  chest.name = "treasure";
  // さらに STAGE4.treasureGlow 倍に明るくして、霧で薄まっても明るさが残るようにする
  const glowing = (color: string) =>
    new THREE.MeshBasicMaterial({
      color: new THREE.Color(color).multiplyScalar(STAGE4.treasureGlow),
      toneMapped: false,
    });
  const gold = glowing(STAGE4.treasureColor);
  const lidGold = glowing(STAGE4.treasureLidColor);
  const strap = std(0x6b3f1d);
  const box = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.2, 1.4), gold);
  box.name = "gold";
  const lidPivot = new THREE.Group();
  lidPivot.position.set(0, 0.6, 0.7);
  const lid = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.4, 1.4).translate(0, 0.2, -0.7), lidGold);
  lid.name = "gold";
  lidPivot.add(lid);
  for (const x of [-0.75, 0.75]) {
    const band = new THREE.Mesh(new THREE.BoxGeometry(0.16, 1.22, 1.42), strap);
    band.position.x = x;
    chest.add(band);
    const lidBand = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.42, 1.42).translate(0, 0.2, -0.7), strap);
    lidBand.position.x = x;
    lidPivot.add(lidBand);
  }
  const glow = new THREE.PointLight(0xffd36b, STAGE4.treasureLightIntensity, STAGE4.treasureLightRange);
  glow.position.y = 2;
  chest.add(box, lidPivot, glow);
  chest.position.set(treasure.x, treasure.y, treasure.z);
  root.add(chest);

  // 生きもの（見つけたら、上に小さな黄色い星）
  const starMat = new THREE.MeshBasicMaterial({ color: 0xffd23f, toneMapped: false });
  // mesh は位置・向きを持つ入れ物。中の shape（簡単な形 → 自作モデル）だけを差し替える
  const creatures = STAGE4.creatures.map((c) => {
    const mesh = new THREE.Group();
    mesh.name = c.kind;
    let shape = selfLit(creatureMesh(c.kind));
    const star = new THREE.Mesh(new THREE.OctahedronGeometry(STAGE4.foundStarSize), starMat);
    star.name = "star";
    star.position.y = 1.4 + STAGE4.foundStarGap; // 簡単な形の高さの半分（約 1.4 m）の上
    star.visible = false;
    mesh.add(shape, star);
    root.add(mesh);
    const replace = (next: THREE.Object3D, height: number) => {
      mesh.remove(shape);
      shape = next;
      mesh.add(shape);
      star.position.y = height / 2 + STAGE4.foundStarGap;
    };
    return { c, mesh, star, replace };
  });

  // まだ見つけていない生きもののまわりの「きらきら」（光に左右されない色。見つけたら消えて星になる）
  // 全部で1つの InstancedMesh（生きもの × sparkleCount 個）。生きものの端から sparkleGap 外を水平に回る
  const sparkles = new THREE.InstancedMesh(
    // 丸い粒（見つけた印の星＝八面体と、形でも分ける）
    new THREE.SphereGeometry(STAGE4.sparkleSize / 2, 8, 6),
    new THREE.MeshBasicMaterial({
      color: new THREE.Color(STAGE4.sparkleColor).multiplyScalar(STAGE4.sparkleGlow),
      toneMapped: false,
    }),
    creatures.length * STAGE4.sparkleCount,
  );
  sparkles.name = "sparkles";
  root.add(sparkles);
  const sparkleRadius = creatures.map(({ c }) => {
    const size = ASSET.sea.sizes[`sea-${c.kind}` as SeaName];
    return Math.max(size.width, size.length) / 2 + STAGE4.sparkleGap;
  });
  const sparklePos = creatures.map(() => new THREE.Vector3());
  const hidden = new THREE.Vector3(0, 0, 0);
  const placeSparkles = (seconds: number, found: readonly boolean[]) => {
    creatures.forEach(({ mesh }, i) => {
      for (let k = 0; k < STAGE4.sparkleCount; k++) {
        const a =
          (2 * Math.PI * seconds) / STAGE4.sparkleTurnSeconds + (2 * Math.PI * k) / STAGE4.sparkleCount;
        const r = sparkleRadius[i] ?? STAGE4.sparkleGap;
        pos.set(mesh.position.x + Math.cos(a) * r, mesh.position.y, mesh.position.z + Math.sin(a) * r);
        if (k === 0) sparklePos[i]?.copy(pos);
        sparkles.setMatrixAt(
          i * STAGE4.sparkleCount + k,
          m4.compose(pos, q.identity(), found[i] === true ? hidden : one),
        );
      }
    });
    sparkles.instanceMatrix.needsUpdate = true;
  };

  // まわりの魚の群れ（景色だけ）：群れごとに円を回る。1匹ずつ少しずらす
  const schoolColor = (s: number) => STAGE4.schoolColors[s % STAGE4.schoolColors.length] ?? "#ffffff";
  const newSchoolMesh = (geometry: THREE.BufferGeometry, material: THREE.Material | THREE.Material[]) => {
    const mesh = new THREE.InstancedMesh(geometry, material, STAGE4.schoolSize);
    mesh.name = "school";
    return mesh;
  };
  const fishGeo = fishGeometry();
  const schools = Array.from({ length: STAGE4.schoolCount }, (_, s) => {
    const mesh = newSchoolMesh(fishGeo, std(schoolColor(s)));
    root.add(mesh);
    return {
      mesh,
      cx: (hash(s + 40) - 0.5) * 120,
      cz: (hash(s + 50) - 0.5) * 180,
      depth: 8 + hash(s + 60) * 26,
      radius: 10 + hash(s + 70) * 12,
      speed: (0.15 + hash(s + 80) * 0.15) * (s % 2 === 0 ? 1 : -1),
      offsets: Array.from({ length: STAGE4.schoolSize }, (_, f) => ({
        dx: (hash(s * 97 + f) - 0.5) * 3,
        dy: (hash(s * 97 + f + 1000) - 0.5) * 2,
        dz: (hash(s * 97 + f + 2000) - 0.5) * 3,
      })),
    };
  });

  const placeSchools = (seconds: number) => {
    for (const s of schools) {
      const a = s.speed * seconds;
      const heading = Math.atan2(Math.sin(a) * Math.sign(s.speed), -Math.cos(a) * Math.sign(s.speed));
      q.setFromEuler(e.set(0, heading, 0));
      s.offsets.forEach((o, i) => {
        pos.set(s.cx + Math.cos(a) * s.radius + o.dx, -s.depth + o.dy, s.cz + Math.sin(a) * s.radius + o.dz);
        s.mesh.setMatrixAt(i, m4.compose(pos, q, one));
      });
      s.mesh.instanceMatrix.needsUpdate = true;
    }
  };
  const placeBubbles = (seconds: number) => {
    bubbleBase.forEach((b, i) => {
      const h = STAGE4.bubbleRiseHeight;
      const rise = ((seconds * (STAGE4.bubbleRiseSpeed / h) + b.phase) % 1) * h;
      pos.set(b.x, b.y + rise, b.z);
      bubbles.setMatrixAt(i, m4.compose(pos, q.identity(), one));
    });
    bubbles.instanceMatrix.needsUpdate = true;
  };
  placeSchools(0);
  placeBubbles(0);

  // ---- 自作モデルへの差し替え ----
  let seaModels = 0;
  const useSeaModels = (models: ReadonlyMap<string, THREE.Object3D>) => {
    let used = 0;
    for (const cr of creatures) {
      const name = `sea-${cr.c.kind}` as SeaName;
      const model = models.get(name);
      if (model === undefined || model.getObjectByName(ASSET.sea.nodes[0]) === undefined) continue;
      const height = ASSET.sea.sizes[name].height;
      const holder = new THREE.Group();
      selfLit(model);
      model.position.y = -height / 2; // モデルの原点は底の中心。状態の位置は生きものの真ん中
      holder.add(model);
      cr.replace(holder, height);
      used++;
    }
    // 群れの魚：部品（素材）ごとの形を1つにまとめ（groups）、群れごとに1つの InstancedMesh のまま描く
    const fish = models.get("sea-fish");
    const parts = fish === undefined ? null : seaParts(fish);
    const geometry =
      parts === null
        ? null
        : mergeGeometries(
            parts.map((p) => p.geometry),
            true,
          );
    if (parts !== null && geometry !== null) {
      geometry.translate(0, -ASSET.sea.sizes["sea-fish"].height / 2, 0);
      schools.forEach((s, i) => {
        // 1つめの部品（背中）を群れの色にする。ほかの部品（おなか・目）はモデルのまま
        const materials = parts.map((p, k) => {
          if (k !== 0) return p.material;
          const m = p.material.clone() as THREE.MeshStandardMaterial;
          m.color.set(schoolColor(i));
          return m;
        });
        const next = newSchoolMesh(geometry, materials);
        next.instanceMatrix.copy(s.mesh.instanceMatrix);
        root.remove(s.mesh);
        root.add(next);
        s.mesh = next;
      });
      used++;
    }
    seaModels = used;
    return used;
  };

  let lastFound: readonly boolean[] = [];
  const water = new THREE.Color();
  return {
    root,
    useSeaModels,
    get seaModels() {
      return seaModels;
    },
    applyLook(look) {
      sand.material = look === null ? sandPlain : look.material("sand");
    },
    update(state, seconds, reducedMotion) {
      const t = reducedMotion ? 0 : seconds;
      placeSchools(t);
      placeBubbles(t);
      lastFound = state.found;
      creatures.forEach(({ c, mesh, star }, i) => {
        const p = creaturePosition(c, state.tick);
        mesh.position.set(p.x, p.y, p.z);
        mesh.rotation.y = p.heading;
        star.visible = state.found[i] === true;
      });
      placeSparkles(t, state.found);
      // ゴールしたら、約1秒でふたが開く
      const open =
        state.finishTick === null
          ? 0
          : Math.min(1, ((state.tick - state.finishTick) * SIM.fixedDt) / STAGE4.lidOpenSeconds);
      lidPivot.rotation.x = -open * STAGE4.lidOpenAngle;
    },
    waterAt(depth) {
      return water.copy(WATER_SHALLOW).lerp(WATER_DEEP, Math.min(1, Math.max(0, depth / STAGE4.maxDepth)));
    },
    sparkleAt(i) {
      if (lastFound[i] === true) return null;
      const p = sparklePos[i];
      return p === undefined ? null : { x: p.x, y: p.y, z: p.z };
    },
    creatureAt(i) {
      const m = creatures[i]?.mesh;
      if (m === undefined) throw new Error(`生きもの ${i} がいない`);
      return { x: m.position.x, y: m.position.y, z: m.position.z };
    },
    marker() {
      return {
        treasure: new THREE.Vector3(treasure.x, treasure.y, treasure.z),
        // 横の海底（たからばこのまわり）。真上の点は、後ろから見ると潜水艇に重なる
        water: new THREE.Vector3(treasure.x + 4, SEABED + 0.3, treasure.z),
      };
    },
  };
};

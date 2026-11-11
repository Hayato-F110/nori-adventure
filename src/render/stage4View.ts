// ステージ4の海の見た目（docs/game-rules.md「ステージ4」。NORI-28）。状態を読むだけ。
// 海底（砂）・岩・海草・光るあわ（手がかり）・たからばこ・泳ぐ生きもの6種類・まわりの魚の群れ。
// 生きもの・魚は簡単な形（あとで Blender の自作モデルに差し替える）。並びは設定（STAGE4）と、決まった式で作る。
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { SIM, STAGE4 } from "../config";
import { type Creature, creaturePosition, type Hint, type Point3, type Stage4State } from "../core/stage4";
import type { Look } from "./look";

const SEABED = -STAGE4.maxDepth;
const GROUND_SIZE = STAGE4.boundsHalfSize * 2 + 120;

/** 水の色：浅いところ（明るい）と深いところ（暗い。真っ暗にはしない） */
export const WATER_SHALLOW = new THREE.Color(0x2f8fc0);
export const WATER_DEEP = new THREE.Color(0x0d3a5c);
/** たからばこ（金色。自ら光るので、暗い海でも目立つ） */
const TREASURE_COLOR = 0xffc93c;

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
  /** たからばこの真ん中と、その少し上の水（E2E で明るさの比を測る） */
  marker(): { treasure: THREE.Vector3; water: THREE.Vector3 };
};

const std = (color: number, extra: THREE.MeshStandardMaterialParameters = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness: 0.8, ...extra });

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
  const sand = new THREE.Mesh(
    new THREE.PlaneGeometry(GROUND_SIZE, GROUND_SIZE).rotateX(-Math.PI / 2),
    std(0xcdb88a, { roughness: 1 }),
  );
  sand.position.y = SEABED;
  root.add(sand);
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
  const bubbleGeo = new THREE.SphereGeometry(0.25, 8, 6);
  const bubbleMat = new THREE.MeshBasicMaterial({ color: 0xbff4ff, toneMapped: false });
  const bubbleTotal = hints.reduce((s, h) => s + h.bubbles, 0);
  const bubbles = new THREE.InstancedMesh(bubbleGeo, bubbleMat, bubbleTotal);
  const bubbleBase: { x: number; y: number; z: number; phase: number }[] = [];
  hints.forEach((h, hi) => {
    for (let k = 0; k < h.bubbles; k++) {
      const n = hi * 31 + k;
      bubbleBase.push({
        x: h.x + (hash(n) - 0.5) * 2,
        y: h.y - 2,
        z: h.z + (hash(n + 100) - 0.5) * 2,
        phase: hash(n + 200),
      });
    }
  });
  root.add(bubbles);

  // たからばこ（金色の箱とふた）。ゴールしたら、ふたが開く
  const chest = new THREE.Group();
  const gold = std(TREASURE_COLOR, {
    emissive: 0xb07800,
    emissiveIntensity: 0.9,
    metalness: 0.3,
    roughness: 0.4,
  });
  const box = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.2, 1.4), gold);
  const lidPivot = new THREE.Group();
  lidPivot.position.set(0, 0.6, 0.7);
  const lid = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.4, 1.4).translate(0, 0.2, -0.7), gold);
  lidPivot.add(lid);
  const glow = new THREE.PointLight(0xffd36b, 30, 14);
  glow.position.y = 2;
  chest.add(box, lidPivot, glow);
  chest.position.set(treasure.x, treasure.y, treasure.z);
  root.add(chest);

  // 生きもの（見つけたら、上に小さな黄色い星）
  const starMat = new THREE.MeshBasicMaterial({ color: 0xffd23f, toneMapped: false });
  const creatures = STAGE4.creatures.map((c) => {
    const mesh = creatureMesh(c.kind);
    mesh.name = c.kind;
    const star = new THREE.Mesh(new THREE.OctahedronGeometry(0.4), starMat);
    star.position.y = 2.2;
    star.visible = false;
    mesh.add(star);
    root.add(mesh);
    return { c, mesh, star };
  });

  // まわりの魚の群れ（景色だけ）：群れごとに円を回る。1匹ずつ少しずらす
  const fishGeo = fishGeometry();
  const schoolColors = [0xffd23f, 0x4fc3f7, 0xff7043, 0xba68c8, 0xc0ca33];
  const schools = Array.from({ length: STAGE4.schoolCount }, (_, s) => {
    const mesh = new THREE.InstancedMesh(
      fishGeo,
      std(schoolColors[s % schoolColors.length] ?? 0xffffff),
      STAGE4.schoolSize,
    );
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
      const rise = ((seconds * 0.4 + b.phase) % 1) * 4;
      pos.set(b.x, b.y + rise, b.z);
      bubbles.setMatrixAt(i, m4.compose(pos, q.identity(), one));
    });
    bubbles.instanceMatrix.needsUpdate = true;
  };
  placeSchools(0);
  placeBubbles(0);

  const water = new THREE.Color();
  return {
    root,
    applyLook() {
      // 海の素材（砂など）は、Blender で取り込んだあとに貼る。今は単色のまま
    },
    update(state, seconds, reducedMotion) {
      const t = reducedMotion ? 0 : seconds;
      placeSchools(t);
      placeBubbles(t);
      creatures.forEach(({ c, mesh, star }, i) => {
        const p = creaturePosition(c, state.tick);
        mesh.position.set(p.x, p.y, p.z);
        mesh.rotation.y = p.heading;
        star.visible = state.found[i] === true;
      });
      // ゴールしたら、約1秒でふたが開く
      const open =
        state.finishTick === null ? 0 : Math.min(1, ((state.tick - state.finishTick) * SIM.fixedDt) / 1);
      lidPivot.rotation.x = -open * 1.9;
    },
    waterAt(depth) {
      return water.copy(WATER_SHALLOW).lerp(WATER_DEEP, Math.min(1, Math.max(0, depth / STAGE4.maxDepth)));
    },
    creatureAt(i) {
      const m = creatures[i]?.mesh;
      if (m === undefined) throw new Error(`生きもの ${i} がいない`);
      return { x: m.position.x, y: m.position.y, z: m.position.z };
    },
    marker() {
      return {
        treasure: new THREE.Vector3(treasure.x, treasure.y, treasure.z),
        water: new THREE.Vector3(treasure.x, treasure.y + 5, treasure.z),
      };
    },
  };
};

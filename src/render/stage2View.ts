// ステージ2の山道の見た目（docs/game-rules.md「線路・駅・見え方」。NORI-26）。
// 線路（土手・枕木・2本のレール）・駅のホーム（屋根つき）・山・木・動物の乗客。状態を読むだけ。
// 並びは決まった式で作る（Math.random を使わない。毎回同じ景色）。
// NORI-59：すれ違う電車（並んだ線路）・海辺・富士山風の山（遠景）・雲。
import * as THREE from "three";
import { LOOK, STAGE2 } from "../config";
import type { Stage2State } from "../core/stage2";
import { createStage2Scenery, passingTrainDistance, sceneryHash, STAGE2_SCENERY } from "../core/stage2Layout";
import type { Track } from "../core/track";
import type { Pose2D } from "../core/types";
import { type Look, setGroundUv1, setPlaneUvMeters, withoutAo } from "./look";
import { createTreeField, type TreeField, type TreeFieldOptions } from "./trees";

// ---- 線路の断面（m）。見た目だけの寸法 ----
const BED_TOP = STAGE2_SCENERY.bedTop; // 土手の上面（線路の点からの高さ）
const BED_HALF = STAGE2_SCENERY.bedHalf; // 土手の上面の半分の幅（枕木 2.4 m より少し広い）
const SLEEPER = STAGE2_SCENERY.sleeper;
const RAIL = STAGE2_SCENERY.rail;
/** 列車の車輪が乗る高さ（線路の点から） */
export const RAIL_TOP = BED_TOP + SLEEPER.height + RAIL.height;
const PLATFORM = STAGE2_SCENERY.platform;
const SAMPLE_STEP = 2; // 線路に沿って断面を置く間隔

/** 進む向きの右（上から見て） */
const rightOf = (heading: number) => ({ x: Math.cos(heading), z: -Math.sin(heading) });

/** 線路に沿って断面（横・上の点の列）を伸ばした形。断面は距離ごとに変えられる */
const sweep = (
  track: Track,
  profile: (s: number, y: number) => readonly (readonly [number, number])[],
  step = SAMPLE_STEP,
): THREE.BufferGeometry => {
  const count = Math.ceil(track.length / step);
  const positions: number[] = [];
  const uvs: number[] = [];
  const index: number[] = [];
  let width = 0;
  for (let i = 0; i <= count; i++) {
    const s = (i / count) * track.length;
    const p = track.pointAt(s);
    const r = rightOf(track.headingAt(s));
    const prof = profile(s, p.y);
    width = prof.length;
    let across = 0;
    prof.forEach(([lateral, up], k) => {
      positions.push(p.x + r.x * lateral, p.y + up, p.z + r.z * lateral);
      if (k > 0) {
        const [pl, pu] = prof[k - 1] as readonly [number, number];
        across += Math.hypot(lateral - pl, up - pu);
      }
      uvs.push(across, s); // メートル単位（素材の繰り返しは tileMeters で合わせる）
    });
  }
  for (let i = 0; i < count; i++) {
    for (let k = 0; k < width - 1; k++) {
      const a = i * width + k;
      const b = a + width;
      // 表が外（断面の左から右へ回って、上・外側）を向く順番
      index.push(a, a + 1, b, a + 1, b + 1, b);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(index);
  geo.computeVertexNormals();
  return geo;
};

/** 線路の上の点から、右へ lateral・上へ up ずらした場所 */
const offsetPoint = (track: Track, s: number, lateral: number, up: number) => {
  const p = track.pointAt(s);
  const r = rightOf(track.headingAt(s));
  return new THREE.Vector3(p.x + r.x * lateral, p.y + up, p.z + r.z * lateral);
};

export type Stage2View = {
  root: THREE.Group;
  /** 素材を貼る（null なら単色に戻す） */
  applyLook(look: Look | null): void;
  /** 木（Blender の木の形は、読めたら trees.setModels で渡す） */
  trees: TreeField;
  /** 列車の位置と向き（描画の補間のあと） */
  trainPose(distance: number): Pose2D & { y: number; pitch: number };
  /** tick はすれ違う電車を置く時刻（刻みの間を補間した小数でもよい。省くと state.tick） */
  update(state: Stage2State, seconds: number, reducedMotion: boolean, tick?: number): void;
  /** すれ違う電車の形（自作のふつうの電車）を渡す。帯と車体の色だけ変える */
  usePassingModel(model: THREE.Object3D): void;
  /** すれ違う電車（E2E・テスト用） */
  readonly passing: THREE.Group;
  /** 駅ごとの、旗の真ん中と、そのそばの土手の上（E2E で明るさの比を測る） */
  readonly markers: readonly { flag: THREE.Vector3; bed: THREE.Vector3 }[];
};

export const createStage2View = (
  track: Track,
  stations: readonly number[],
  treeOptions: TreeFieldOptions = {},
): Stage2View => {
  const root = new THREE.Group();
  root.name = "stage2";
  const swaps: { mesh: THREE.Mesh; plain: THREE.Material; pick: (look: Look) => THREE.Material }[] = [];

  // 地面（芝）
  const groundSize = STAGE2_SCENERY.groundSize;
  const groundGeo = setPlaneUvMeters(new THREE.PlaneGeometry(groundSize, groundSize), groundSize, groundSize);
  groundGeo.rotateX(-Math.PI / 2);
  const groundPlain = new THREE.MeshStandardMaterial({ color: 0x6cc35a, roughness: 0.95 });
  const ground = new THREE.Mesh(groundGeo, groundPlain);
  ground.receiveShadow = true;
  root.add(ground);
  // 焼き付けた地面の陰（ステージ2。木・山・ホームの足元）を uv1 で重ねる。範囲は LOOK.mountainBakeSize（外は陰なし）
  setGroundUv1(ground, LOOK.mountainBakeSize);
  swaps.push({ mesh: ground, plain: groundPlain, pick: (look) => look.material("grass") });

  // 土手：上面は砂利（線路の下だけ）、斜面は芝。線路が高い所では斜面が横に長くなるので、
  // 斜面まで砂利にすると道路のような太い帯に見える（本物の鉄道の土手と同じ分け方）
  const foot = (y: number) => BED_HALF + 0.3 + (y + BED_TOP) * 0.8;
  // 左はすれ違う電車の線路（NORI-59）のぶんだけ広げて、1つの土手にする
  const LEFT_EDGE = STAGE2.passingOffset + BED_HALF;
  const bedGeo = sweep(track, () => [
    [-LEFT_EDGE, BED_TOP],
    [BED_HALF, BED_TOP],
  ]);
  // 暗い灰色の砂利（黄色の旗・明るいホームとの差を大きくする）
  const bedPlain = new THREE.MeshStandardMaterial({ color: 0x3d3a37, roughness: 1 });
  const bed = new THREE.Mesh(bedGeo, bedPlain);
  bed.receiveShadow = true;
  root.add(bed);
  // 茶色がかった暗い砂利
  swaps.push({ mesh: bed, plain: bedPlain, pick: (look) => withoutAo(look.material("road", 0x6e655d)) });
  for (const side of [-1, 1]) {
    const slopeGeo = sweep(track, (_s, y) =>
      side < 0
        ? [
            [-(foot(y) + STAGE2.passingOffset), -y - 0.05],
            [-LEFT_EDGE, BED_TOP],
          ]
        : [
            [BED_HALF, BED_TOP],
            [foot(y), -y - 0.05],
          ],
    );
    const slope = new THREE.Mesh(slopeGeo, groundPlain);
    slope.receiveShadow = true;
    root.add(slope);
    swaps.push({ mesh: slope, plain: groundPlain, pick: (look) => withoutAo(look.material("grass")) });
  }

  // 枕木（同じ形をまとめて描く）
  const sleeperCount = Math.floor(track.length / SLEEPER.spacing);
  const LANES = [0, -STAGE2.passingOffset]; // 自分の線路と、すれ違う電車の線路（左）
  const sleepers = new THREE.InstancedMesh(
    new THREE.BoxGeometry(SLEEPER.width, SLEEPER.height, SLEEPER.depth),
    new THREE.MeshStandardMaterial({ color: 0x6b4a32, roughness: 0.9 }),
    sleeperCount * LANES.length,
  );
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const one = new THREE.Vector3(1, 1, 1);
  LANES.forEach((lane, k) => {
    for (let i = 0; i < sleeperCount; i++) {
      const s = i * SLEEPER.spacing;
      q.setFromAxisAngle(up, track.headingAt(s));
      m.compose(offsetPoint(track, s, lane, BED_TOP + SLEEPER.height / 2), q, one);
      sleepers.setMatrixAt(k * sleeperCount + i, m);
    }
  });
  sleepers.receiveShadow = true;
  root.add(sleepers);

  // 2本のレール
  const railMat = new THREE.MeshStandardMaterial({ color: 0xb8bcc4, metalness: 0.6, roughness: 0.35 });
  for (const c of LANES.flatMap((lane) => [lane - RAIL.gauge, lane + RAIL.gauge])) {
    const w = RAIL.width / 2;
    const bottom = BED_TOP + SLEEPER.height;
    const rail = new THREE.Mesh(
      sweep(
        track,
        () => [
          [c - w, bottom],
          [c - w, RAIL_TOP],
          [c + w, RAIL_TOP],
          [c + w, bottom],
        ],
        1,
      ),
      railMat,
    );
    root.add(rail);
  }

  // 駅のホーム（屋根つき）と、上の表示の旗と同じ形の旗
  const platformPlain = new THREE.MeshStandardMaterial({ color: 0xd9cbb5, roughness: 0.9 });
  const roofMat = new THREE.MeshStandardMaterial({ color: 0xd8574a, roughness: 0.7 });
  const poleMat = new THREE.MeshStandardMaterial({ color: 0xf4f1ea, roughness: 0.6 });
  // 駅の旗は子どもが探す目印。光の当たり方・色の仕上げに左右されない、いつも同じ明るい黄色（信号灯と同じ扱い）
  const flagMat = new THREE.MeshBasicMaterial({ color: 0xffd23f, toneMapped: false });
  const borderMat = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide });
  const markers: { flag: THREE.Vector3; bed: THREE.Vector3 }[] = [];
  const animals: { group: THREE.Group; station: number; phase: number }[] = [];
  stations.forEach((at, i) => {
    const station = new THREE.Group();
    const p = track.pointAt(at);
    const heading = track.headingAt(at);
    const center = offsetPoint(track, at, PLATFORM.offset, 0);
    station.position.set(center.x, p.y, center.z);
    station.rotation.y = heading;
    const platformGeo = new THREE.BoxGeometry(PLATFORM.width, PLATFORM.height + p.y + 0.3, PLATFORM.length);
    platformGeo.translate(0, (PLATFORM.height - p.y - 0.3) / 2, 0);
    const platform = new THREE.Mesh(platformGeo, platformPlain);
    platform.castShadow = platform.receiveShadow = true;
    station.add(platform);
    swaps.push({ mesh: platform, plain: platformPlain, pick: (look) => look.material("brick") });
    for (const [x, z] of [
      [-1.1, -5],
      [1.1, -5],
      [-1.1, 5],
      [1.1, 5],
    ] as const) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 2.6, 8), poleMat);
      pole.position.set(x, PLATFORM.height + 1.3, z);
      station.add(pole);
    }
    const roof = new THREE.Mesh(
      new THREE.BoxGeometry(PLATFORM.width + 0.6, 0.2, PLATFORM.length + 0.6),
      roofMat,
    );
    roof.position.y = PLATFORM.height + 2.7;
    roof.castShadow = true;
    station.add(roof);
    // 大きな旗（ホームの手前の端）。止まる場所の目印
    const flagPole = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 5, 8), poleMat);
    flagPole.position.set(PLATFORM.width / 2 + 0.4, PLATFORM.height + 2.5, PLATFORM.length / 2);
    station.add(flagPole);
    const flagShape = new THREE.Shape([
      new THREE.Vector2(0, 0),
      new THREE.Vector2(2, -0.6),
      new THREE.Vector2(0, -1.3),
    ]);
    const flag = new THREE.Mesh(new THREE.ShapeGeometry(flagShape), flagMat);
    flag.material.side = THREE.DoubleSide;
    flag.position.set(PLATFORM.width / 2 + 0.4, PLATFORM.height + 5, PLATFORM.length / 2);
    flag.rotation.y = Math.PI / 2;
    station.add(flag);
    // 白い縁（空を背にしても形が分かる）。旗の形をくり抜いた枠を、旗と同じ面に置く。
    // 旗の後ろに板を置くと、反対側から見たときに板が旗を隠すため
    const frame = new THREE.Shape([
      new THREE.Vector2(-0.15, 0.25),
      new THREE.Vector2(2.4, -0.6),
      new THREE.Vector2(-0.15, -1.55),
    ]);
    frame.holes.push(new THREE.Path(flagShape.getPoints()));
    const border = new THREE.Mesh(new THREE.ShapeGeometry(frame), borderMat);
    border.position.copy(flag.position);
    border.rotation.y = Math.PI / 2;
    station.add(border);
    station.updateMatrixWorld(true);
    markers.push({
      flag: new THREE.Vector3(0.6, -0.6, 0).applyMatrix4(flag.matrixWorld),
      // 駅に止まった列車の左横の砂利（ホームの反対側。枕木 ±1.2 m の外、列車 ±1.1 m の外）
      bed: offsetPoint(track, at - 2, -(BED_HALF - 0.15), BED_TOP),
    });
    // 動物の乗客（2ひき）
    for (let k = 0; k < 2; k++) {
      const group = createAnimal(i * 2 + k);
      group.position.set(-0.2 + k * 0.7, PLATFORM.height, -1 + k * 2);
      station.add(group);
      animals.push({ group, station: i, phase: k * 0.9 });
    }
    root.add(station);
  });

  // 山（線路の外と、輪の内側）と木。配置は core（stage2Layout）と同じもの（光のベイクも同じ配置を使う）
  const scenery = createStage2Scenery(track, stations);
  const mountainMat = new THREE.MeshStandardMaterial({ color: 0x7c8f6a, roughness: 1, flatShading: true });
  const snowMat = new THREE.MeshStandardMaterial({ color: 0xf2f4f7, roughness: 0.8, flatShading: true });
  for (const { x, z, radius, height, rotation } of scenery.mountains) {
    const cone = new THREE.Mesh(new THREE.ConeGeometry(radius, height, 7, 1), mountainMat);
    cone.position.set(x, height / 2, z);
    cone.rotation.y = rotation;
    cone.receiveShadow = true;
    root.add(cone);
    if (height > 60) {
      const capH = height * 0.25;
      const cap = new THREE.Mesh(new THREE.ConeGeometry(radius * 0.25 + 0.2, capH, 7, 1), snowMat);
      cap.position.set(x, height - capH / 2 + 0.05, z);
      cap.rotation.y = rotation;
      root.add(cap);
    }
  }

  // 木（線路の両側。まとめて描く。ステージ1と同じ木）
  const trees = createTreeField(scenery.trees, treeOptions);
  root.add(trees.root);

  // ---- NORI-59：海辺・富士山風の山・雲・すれ違う電車 ----
  const half = groundSize / 2;
  const beach = new THREE.Mesh(
    new THREE.PlaneGeometry(groundSize, STAGE2.beachWidth).rotateX(-Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: 0xe6d3a3, roughness: 1 }),
  );
  beach.name = "beach";
  beach.position.set(0, 0.02, STAGE2.seaFromZ + STAGE2.beachWidth / 2);
  beach.receiveShadow = true;
  const seaDepth = half - STAGE2.seaFromZ - STAGE2.beachWidth;
  const sea = new THREE.Mesh(
    new THREE.PlaneGeometry(groundSize, seaDepth).rotateX(-Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: 0x2f7fc1, roughness: 0.15, metalness: 0 }),
  );
  sea.name = "sea";
  sea.position.set(0, 0.04, half - seaDepth / 2);
  root.add(beach, sea);
  root.add(createBigMountain());
  root.add(createClouds());

  // すれ違う電車（最初は箱。ふつうの電車の GLB が読めたら usePassingModel で差しかえる）
  const passing = new THREE.Group();
  passing.name = "passing-train";
  passing.add(createPassingBox());
  root.add(passing);
  const placePassing = (tick: number) => {
    const s = passingTrainDistance(track.length, tick);
    passing.position.copy(offsetPoint(track, s, -STAGE2.passingOffset, RAIL_TOP));
    // 逆向きに走るので、線路の向きの反対を向く。坂の向きも反対
    passing.rotation.set(-Math.atan(track.slopeAt(s)), track.headingAt(s) + Math.PI, 0, "YXZ");
  };
  placePassing(0);

  return {
    root,
    markers,
    trees,
    passing,
    usePassingModel(model) {
      const copy = model.clone(true);
      const recolor = (mat: THREE.Material) => {
        if (!(mat instanceof THREE.MeshStandardMaterial)) return mat;
        const color = PASSING_COLORS[mat.name];
        if (color === undefined) return mat;
        const c = mat.clone();
        c.color.set(color);
        return c;
      };
      copy.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          o.material = Array.isArray(o.material)
            ? o.material.map(recolor)
            : recolor(o.material as THREE.Material);
          o.castShadow = true;
        }
      });
      passing.clear();
      passing.add(copy);
    },
    applyLook(look) {
      for (const swap of swaps) swap.mesh.material = look === null ? swap.plain : swap.pick(look);
      trees.applyLook(look);
    },
    trainPose(distance) {
      const p = track.pointAt(distance);
      return {
        x: p.x,
        z: p.z,
        y: p.y + RAIL_TOP,
        heading: track.headingAt(distance),
        pitch: Math.atan(track.slopeAt(distance)),
      };
    },
    update(state, seconds, reducedMotion, tick = state.tick) {
      placePassing(tick);
      const stopped = state.stoppedTicks > 0;
      for (const a of animals) {
        // 乗った駅（着いた駅）の動物は、列車に乗ったので見えなくする
        a.group.visible = a.station >= state.nextStation;
        const hop = stopped && a.station === state.nextStation && !reducedMotion;
        a.group.position.y = PLATFORM.height + (hop ? Math.abs(Math.sin(seconds * 6 + a.phase)) * 0.35 : 0);
      }
    },
  };
};

const ANIMAL_COLORS = [0xf7c59f, 0xffffff, 0xc89f7a, 0xf2a6b8, 0xd7d7d7, 0xffe08a];

/** 動物の乗客（丸い体・頭・耳。オリジナルの簡単な形） */
const createAnimal = (i: number): THREE.Group => {
  const group = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({
    color: ANIMAL_COLORS[i % ANIMAL_COLORS.length] ?? 0xffffff,
    roughness: 0.8,
  });
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.32, 12, 8), mat);
  body.position.y = 0.32;
  body.scale.y = 1.1;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 8), mat);
  head.position.y = 0.82;
  group.add(body, head);
  for (const side of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.22, 8), mat);
    ear.position.set(side * 0.12, 1.05, 0);
    group.add(ear);
  }
  for (const o of group.children) o.castShadow = true;
  return group;
};

/** 空の色（stage2Main の背景・霧と同じ） */
export const SKY_COLOR = 0x9fd8ff;

/** すれ違う電車の色（自分が選べるふつうの電車と見分ける。帯を緑、車体を少し明るい灰色に） */
const PASSING_COLORS: Record<string, string> = { commuter_stripe: "#3fae5a", commuter_body: "#eef0f2" };

/** GLB を読む前・読めなかったときのすれ違う電車（箱。前は −Z、原点は底の中心） */
const createPassingBox = (): THREE.Group => {
  const g = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(2.1, 2.2, 7).translate(0, 1.4, 0),
    new THREE.MeshStandardMaterial({ color: 0xeef0f2, roughness: 0.6 }),
  );
  const stripe = new THREE.Mesh(
    new THREE.BoxGeometry(2.14, 0.24, 6.8).translate(0, 1.3, 0),
    new THREE.MeshStandardMaterial({ color: 0x3fae5a }),
  );
  g.add(body, stripe);
  return g;
};

/**
 * 富士山風の大きな山（遠景。形はオリジナル：くぼんだ斜面と平らな頂）。霧（330 m で空の色）の外にあるので、
 * 霧を効かせず、空の色を 下 hazeBottom 〜 上 hazeTop の割合でまぜる（遠くのかすみ）
 */
const createBigMountain = (): THREE.Mesh => {
  const { x, z, radius, height, snowFraction, hazeTop, hazeBottom } = STAGE2.bigMountain;
  const rows = 24;
  // 半径は高さとともに (1 − h)^1.6 で細くなる（下が広がる、くぼんだ斜面）。頂は半径の 8% で平ら
  const profile = Array.from({ length: rows + 1 }, (_, i) => {
    const h = i / rows;
    return new THREE.Vector2(Math.max(radius * 0.08, radius * (1 - h) ** 1.6), h * height);
  });
  profile.push(new THREE.Vector2(0, height));
  const geo = new THREE.LatheGeometry(profile, 40);
  const sky = new THREE.Color(SKY_COLOR);
  const rock = new THREE.Color(0x5d6f8a);
  const snow = new THREE.Color(0xffffff);
  const pos = geo.getAttribute("position");
  const colors = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const h = pos.getY(i) / height;
    // 雪の境目は、向きで少しゆらす（決まった値）
    const a = Math.atan2(pos.getZ(i), pos.getX(i));
    const line = 1 - snowFraction + Math.sin(a * 7) * 0.03;
    c.copy(h >= line ? snow : rock).lerp(sky, hazeBottom + (hazeTop - hazeBottom) * h);
    colors.set([c.r, c.g, c.b], i * 3);
  }
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, fog: false }));
  mesh.name = "big-mountain";
  mesh.position.set(x, 0, z);
  return mesh;
};

/** 雲（白い平たいかたまり。決まった並び。ステージ3と同じ作り方） */
const createClouds = (): THREE.Group => {
  const g = new THREE.Group();
  g.name = "clouds";
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, flatShading: true });
  for (let i = 0; i < STAGE2.cloudCount; i++) {
    const cloud = new THREE.Mesh(new THREE.IcosahedronGeometry(6 + sceneryHash(i + 700) * 6, 1), mat);
    const a = sceneryHash(i + 710) * Math.PI * 2;
    const d = 60 + sceneryHash(i + 720) * 190;
    const y = STAGE2.cloudMinHeight + sceneryHash(i + 730) * (STAGE2.cloudMaxHeight - STAGE2.cloudMinHeight);
    cloud.position.set(Math.cos(a) * d, y, Math.sin(a) * d);
    cloud.scale.set(1.8, 0.6, 1.2);
    g.add(cloud);
  }
  return g;
};

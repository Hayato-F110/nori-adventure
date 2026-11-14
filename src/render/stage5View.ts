// ステージ5の月面の見た目（docs/game-rules.md「ステージ5」。NORI-29）。状態を読むだけ。
// 月の砂・道（タイヤの跡）・ジャンプ台・ほし・景色の岩・クレーター・広場のふち・ボス・転がる岩・なかよしの星・空（星と地球）。
// ほし・ジャンプ台・なかよしの星は光に左右されない色（toneMapped: false）。色は「ステージ5の色」の表（式で計算した）。
// ボスはまず簡単な形（丸い体・目・口・腕）。あとで隔離した Blender の自作モデルに差し替える。
import * as THREE from "three";
import { BOSS, LOOK, ROVER, SIM, STAGE5 } from "../config";
import { bossAt, friendAvailable, rocksAt, type Stage5State } from "../core/stage5";
import { friendStarPositions, jumpPads, pathPoint, starPositions } from "../core/stage5Layout";
import { bossColor, bossHop, bossMouth, bossPuff, type Mouth } from "./bossLook";
import { type Look, setGroundUv1, setPlaneUvMeters } from "./look";

const GROUND_SIZE = STAGE5.boundsHalfSize * 2 + 160;
const C = STAGE5.arenaCenter;

/** 0〜1 の決まった値（空の星の並びだけに使う） */
const hash = (i: number): number => {
  const v = Math.sin(i * 12.9898 + 78.233) * 43758.5453;
  return v - Math.floor(v);
};

const std = (color: THREE.ColorRepresentation, extra: THREE.MeshStandardMaterialParameters = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness: 1, ...extra });
const glow = (color: THREE.ColorRepresentation) => new THREE.MeshBasicMaterial({ color, toneMapped: false });

export type Point3 = { x: number; y: number; z: number };

export type Stage5View = {
  root: THREE.Group;
  /** seconds は描画の時刻（ほしが回るのに使うだけ。ゲームの状態には影響しない） */
  /** 素材を貼る（null なら単色。画質の切り替えから呼ばれる） */
  applyLook(look: Look | null): void;
  update(state: Stage5State, seconds: number, reducedMotion: boolean): void;
  /** E2E で明るさの比を測る点：ほし（1つめ）・道、ジャンプ台（1つめ）、なかよしの星（1つめ）・砂 */
  marker(): { star: Point3; path: Point3; pad: Point3; sand: Point3; friend: Point3; ground: Point3 };
  /** 今の口の形（E2E・確かめ用） */
  readonly mouth: Mouth;
};

/** 星の形（ステージ1と同じ八面体を少し平たく） */
const starGeometry = (size: number) => new THREE.OctahedronGeometry(size, 0).scale(1, 1.2, 0.5);

export const createStage5View = (): Stage5View => {
  const root = new THREE.Group();
  root.name = "stage5";

  // ---- 地面（月の砂）と道（タイヤの跡） ----
  // 高画質では月の砂の素材（LOOK.surfaces.moon）と焼き付けた陰（岩の足元。範囲は LOOK.moonBakeSize）。
  // 低画質・素材が読めないときは単色（STAGE5.groundColor。素材の平均と同じ色）
  const groundPlain = std(STAGE5.groundColor);
  const ground = new THREE.Mesh(
    setPlaneUvMeters(new THREE.PlaneGeometry(GROUND_SIZE, GROUND_SIZE), GROUND_SIZE, GROUND_SIZE).rotateX(
      -Math.PI / 2,
    ),
    groundPlain,
  );
  setGroundUv1(ground, LOOK.moonBakeSize);
  ground.receiveShadow = true;
  root.add(ground);

  // 道：道すじに沿った帯（1 m きざみ）。地面の少し上
  const pathGeo = (() => {
    const half = STAGE5.pathWidth / 2;
    const n = Math.ceil(STAGE5.pathLength);
    const positions: number[] = [];
    const index: number[] = [];
    for (let i = 0; i <= n; i++) {
      const d = Math.min(STAGE5.pathLength, i);
      const p = pathPoint(d);
      const q = pathPoint(Math.min(STAGE5.pathLength, d + 0.5));
      const r = pathPoint(Math.max(0, d - 0.5));
      // 進む向きに直角（左右）
      const tx = q.x - r.x;
      const tz = q.z - r.z;
      const len = Math.hypot(tx, tz) || 1;
      const nx = -tz / len;
      const nz = tx / len;
      positions.push(p.x + nx * half, 0.02, p.z + nz * half, p.x - nx * half, 0.02, p.z - nz * half);
      if (i > 0) {
        const a = (i - 1) * 2;
        index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    g.setIndex(index);
    g.computeVertexNormals();
    return g;
  })();
  const pathMat = std(STAGE5.pathColor, { side: THREE.DoubleSide });
  const path = new THREE.Mesh(pathGeo, pathMat);
  path.receiveShadow = true;
  root.add(path);

  // ---- クレーター（見た目だけ）：暗い円と、ふちの輪 ----
  const craterMat = std(STAGE5.craterColor);
  for (const c of STAGE5.craters) {
    const floor = new THREE.Mesh(new THREE.CircleGeometry(c.radius, 32).rotateX(-Math.PI / 2), craterMat);
    floor.position.set(c.x, 0.01, c.z);
    const rim = new THREE.Mesh(
      new THREE.TorusGeometry(c.radius, 0.4, 6, 40).rotateX(-Math.PI / 2),
      std(STAGE5.groundColor),
    );
    rim.position.set(c.x, 0, c.z);
    rim.scale.y = 0.6;
    root.add(floor, rim);
  }

  // ---- 景色の岩（半球） ----
  const rockMat = std(STAGE5.rockColor, { flatShading: true });
  STAGE5.rocks.forEach((r, i) => {
    const rock = new THREE.Mesh(
      new THREE.SphereGeometry(r.radius, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2),
      rockMat,
    );
    rock.position.set(r.x, 0, r.z);
    rock.rotation.y = i;
    rock.castShadow = true;
    root.add(rock);
  });

  // ---- ジャンプ台（光る円と、矢印の形） ----
  const padMat = glow(STAGE5.jumpPadColor);
  const pads = jumpPads();
  for (const p of pads) {
    const pad = new THREE.Mesh(
      new THREE.CircleGeometry(STAGE5.jumpPadRadius, 32).rotateX(-Math.PI / 2),
      padMat,
    );
    pad.position.set(p.x, 0.04, p.z);
    // 進む向きの「く」の字（道と同じ暗い色で、上に乗せる）
    const chevron = new THREE.Mesh(
      new THREE.ConeGeometry(1.2, 1.6, 3).rotateX(-Math.PI / 2).scale(1, 0.05, 1),
      std(STAGE5.pathColor),
    );
    chevron.position.set(p.x, 0.06, p.z);
    chevron.rotation.y = p.heading;
    root.add(pad, chevron);
  }

  // ---- ほし（地面の 6 個＋空中の 6 個） ----
  const starMat = glow(LOOK.starColor);
  const starGeo = starGeometry(0.6);
  const stars = starPositions().map((s) => {
    const m = new THREE.Mesh(starGeo, starMat);
    // 地面のほしは浮かせて見せる（取る距離は高さを含めて 2 m なので、0.8 m なら取れる）
    m.position.set(s.x, s.y === 0 ? 0.8 : s.y, s.z);
    root.add(m);
    return m;
  });

  // ---- 広場のふちの線 ----
  const arenaLine = new THREE.Mesh(
    new THREE.RingGeometry(STAGE5.arenaRadius - 0.3, STAGE5.arenaRadius, 96).rotateX(-Math.PI / 2),
    std(STAGE5.arenaLineColor),
  );
  arenaLine.position.set(C.x, 0.03, C.z);
  root.add(arenaLine);

  // ---- なかよしの星（大きめ。ピンク） ----
  const friendMat = glow(STAGE5.friendStarColor);
  const friendGeo = starGeometry(0.8);
  const friends = friendStarPositions().map((f) => {
    const m = new THREE.Mesh(friendGeo, friendMat);
    m.position.set(f.x, f.y, f.z);
    root.add(m);
    return m;
  });
  // 持っている星（ローバーの上に見せる）
  const carried = new THREE.Mesh(friendGeo, friendMat);
  carried.visible = false;
  root.add(carried);

  // ---- ボス（簡単な形）：丸い体・目・口・小さな腕 ----
  const boss = new THREE.Group();
  boss.name = "boss";
  const bodyMat = std(BOSS.angryColor, { roughness: 0.8 });
  const body = new THREE.Mesh(
    new THREE.SphereGeometry(BOSS.radius, 32, 20).translate(0, BOSS.radius, 0),
    bodyMat,
  );
  body.castShadow = true;
  boss.add(body);
  const white = std(0xffffff, { roughness: 0.4 });
  const black = std(0x1a1a22, { roughness: 0.4 });
  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.55, 16, 12), white);
    eye.position.set(side * 1.0, BOSS.radius + 0.9, -BOSS.radius * 0.85);
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.28, 12, 8), black);
    pupil.position.set(side * 1.0, BOSS.radius + 0.9, -BOSS.radius * 0.85 - 0.4);
    const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.4, 1.2, 4, 8), bodyMat);
    arm.position.set(side * (BOSS.radius + 0.3), BOSS.radius * 0.8, 0);
    arm.rotation.z = side * 0.6;
    boss.add(eye, pupil, arm);
  }
  // 口：への字（下向きの弧）・まっすぐ・笑顔（上向きの弧）を作っておき、1つだけ見せる
  const mouthMat = black;
  const arc = new THREE.TorusGeometry(0.9, 0.14, 6, 16, Math.PI);
  const mouths: Record<Mouth, THREE.Mesh> = {
    frown: new THREE.Mesh(arc, mouthMat),
    flat: new THREE.Mesh(new THREE.CapsuleGeometry(0.14, 1.4, 4, 6).rotateZ(Math.PI / 2), mouthMat),
    smile: new THREE.Mesh(arc, mouthMat),
  };
  mouths.frown.position.set(0, BOSS.radius - 0.2, -BOSS.radius * 0.95);
  mouths.flat.position.set(0, BOSS.radius - 0.3, -BOSS.radius * 0.95);
  mouths.smile.position.set(0, BOSS.radius + 0.1, -BOSS.radius * 0.95);
  mouths.smile.rotation.z = Math.PI; // 弧を下向きに → 笑顔
  for (const m of Object.values(mouths)) boss.add(m);
  root.add(boss);

  // ---- 転がる岩（一度に 1 つ。余裕をみて 2 つ用意） ----
  const rolling = [0, 1].map(() => {
    const m = new THREE.Mesh(new THREE.IcosahedronGeometry(BOSS.rockRadius, 1), rockMat);
    m.castShadow = true;
    m.visible = false;
    root.add(m);
    return m;
  });

  // ---- 空：遠くの星（点）と地球 ----
  const skyStars = (() => {
    const n = 400;
    const pos: number[] = [];
    for (let i = 0; i < n; i++) {
      // 上半分の球の上に、決まった並びで
      const a = hash(i) * Math.PI * 2;
      const h = 0.08 + hash(i + 1000) * 0.9;
      const r = 400;
      pos.push(Math.cos(a) * Math.sqrt(1 - h * h) * r, h * r, Math.sin(a) * Math.sqrt(1 - h * h) * r);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    return new THREE.Points(
      g,
      new THREE.PointsMaterial({ color: 0xffffff, size: 1.6, sizeAttenuation: false, fog: false }),
    );
  })();
  const earth = new THREE.Mesh(
    new THREE.SphereGeometry(28, 32, 20),
    new THREE.MeshBasicMaterial({ color: STAGE5.earthColor, fog: false }),
  );
  earth.position.set(-120, 160, -330);
  root.add(skyStars, earth);

  let mouth: Mouth = "frown";
  const roverY = ROVER.collisionRadius;

  return {
    root,
    get mouth() {
      return mouth;
    },
    applyLook(look) {
      ground.material = look === null ? groundPlain : look.material("moon");
    },
    update(state, seconds, reducedMotion) {
      const spin = reducedMotion ? 0 : seconds * 1.5;
      stars.forEach((m, i) => {
        m.visible = state.stars[i] !== true;
        m.rotation.y = spin;
      });
      friends.forEach((m, i) => {
        m.visible = friendAvailable(state, i) && state.finishTick === null;
        m.rotation.y = spin;
      });
      carried.visible = state.carrying;
      carried.position.set(state.rover.x, state.rover.y + roverY + 2.2, state.rover.z);
      carried.rotation.y = spin;

      // ボス：位置・色・口・前ぶれのふくらみ。落ち着いたら、はねる（動きを減らす設定でははねない）
      const b = bossAt(state);
      const calmNow = state.finishTick !== null;
      const hop = bossHop(seconds, calmNow, reducedMotion);
      boss.position.set(b.x, hop, b.z);
      // 体の前（目のある −Z）を、ローバー（子ども）へ向ける。どこから近づいても顔が見える（見た目だけ）
      boss.rotation.y = Math.atan2(-(state.rover.x - b.x), -(state.rover.z - b.z));
      const puff = bossPuff(state.tick, SIM.fixedDt, calmNow);
      body.scale.setScalar(1 + 0.12 * puff);
      bodyMat.color.set(bossColor(state.calm));
      mouth = bossMouth(state.calm);
      for (const [k, m] of Object.entries(mouths)) m.visible = k === mouth;

      const rocks = rocksAt(state);
      rolling.forEach((m, i) => {
        const r = rocks[i];
        m.visible = r !== undefined;
        if (r === undefined) return;
        m.position.set(r.x, BOSS.rockRadius, r.z);
        // 外向きに転がって見えるように回す
        const dist = Math.hypot(r.x - C.x, r.z - C.z);
        m.rotation.set(dist / BOSS.rockRadius, Math.atan2(r.x - C.x, r.z - C.z), 0, "YXZ");
      });
    },
    marker() {
      const s = starPositions()[0] ?? { x: 0, y: 0, z: 0 };
      const p = pathPoint(STAGE5.groundStars[0] ?? 0);
      const pad = pads[0] ?? { x: 0, z: 0, heading: 0 };
      // 広場の入口にいちばん近いなかよしの星（道すじの終わりから見える）
      const end = pathPoint(STAGE5.pathLength);
      const f = [...friendStarPositions()].sort(
        (a, b) => Math.hypot(a.x - end.x, a.z - end.z) - Math.hypot(b.x - end.x, b.z - end.z),
      )[0] ?? { x: 0, y: 0, z: 0 };
      return {
        star: { x: s.x, y: 0.8, z: s.z },
        // ほしの横の道（ほしと重ならない、道の端寄り）
        path: { x: p.x + STAGE5.pathWidth / 2 - 1, y: 0.02, z: p.z },
        // ほしの横の砂：道の端から 2 m 外（ルールは、ほし・台を「まわりの月の砂」と比べる。NORI-70：初見レビュー R1-70-1）
        sand: { x: p.x + STAGE5.pathWidth / 2 + 2, y: 0, z: p.z },
        // 台の真ん中の矢印を避けて、右へ 1.8 m（台の半径 2.5 m の中）
        pad: { x: pad.x + Math.cos(pad.heading) * 1.8, y: 0.04, z: pad.z - Math.sin(pad.heading) * 1.8 },
        friend: { x: f.x, y: f.y, z: f.z },
        // なかよしの星の横の砂（3 m 横。道や広場のふちの線にかからない）
        ground: { x: f.x + 3, y: 0, z: f.z },
      };
    },
  };
};

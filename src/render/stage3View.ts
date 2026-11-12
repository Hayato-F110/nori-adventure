// ステージ3の空の見た目（docs/game-rules.md「ステージ3」。NORI-27）。状態を読むだけ。
// 地面（芝）・山（円すい）・気球・雲・輪・ゴールの輪。並びは設定（STAGE3）と、決まった式（雲）で作る。
// 空をにぎやかに（NORI-60）：ほかの飛行機・ただよう気球・鳥の群れ・山のふもとの木。位置は core/stage3Scenery の式
import * as THREE from "three";
import { LOOK, STAGE3 } from "../config";
import type { Ring, Stage3State } from "../core/stage3";
import { birdPose, driftBalloonPosition, otherPlanePose, sceneryTrees } from "../core/stage3Scenery";
import { type Look, setGroundUv1, setPlaneUvMeters } from "./look";
import { createTreeField, type TreeField, type TreeFieldOptions } from "./trees";

const GROUND_SIZE = 900; // 飛べる範囲（±300 m）の外まで地面を見せる

/** 輪の色：空（明るい水色）より十分に暗く、明るさの比 3 以上（docs/game-rules.md「見え方」） */
const RING_COLOR = 0xc0262d;
const RING_DONE_COLOR = 0x7fd38a; // くぐった輪（色だけでなく、細くもする）
const GOAL_COLOR = 0x1f3fbf;

/** 0〜1 の決まった値（雲の並びだけに使う） */
const hash = (i: number): number => {
  const v = Math.sin(i * 12.9898 + 78.233) * 43758.5453;
  return v - Math.floor(v);
};

export type Stage3View = {
  root: THREE.Group;
  applyLook(look: Look | null): void;
  /** tick は描く時刻（刻みの間を補間した小数でもよい。省くと state.tick） */
  update(state: Stage3State, tick?: number): void;
  /** ほかの飛行機の形（自作の plane.glb）を渡す。機体の色（plane_body・plane_wing）だけ設定の色に変える */
  usePlaneModel(model: THREE.Object3D): void;
  /** 山のふもとの木（Blender の木の形は、読めたら trees.setModels で渡す） */
  trees: TreeField;
  /** 景色の物（E2E・テスト用） */
  scenery: { planes: THREE.Group; balloons: THREE.Group; birds: THREE.InstancedMesh[] };
  /** 輪の上の端と、その少し上の空（E2E で明るさの比を測る。i は輪の番号、-1 はゴール） */
  marker(i: number): { ring: THREE.Vector3; sky: THREE.Vector3 };
};

/** 気球（球と、下のかご）。中心が原点 */
const makeBalloon = (color: THREE.ColorRepresentation, radius: number): THREE.Group => {
  const group = new THREE.Group();
  const ball = new THREE.Mesh(
    new THREE.SphereGeometry(radius, 20, 14),
    new THREE.MeshStandardMaterial({ color }),
  );
  ball.scale.y = 1.15;
  const basket = new THREE.Mesh(
    new THREE.BoxGeometry(1.2, 0.9, 1.2),
    new THREE.MeshStandardMaterial({ color: 0x8d5a2b }),
  );
  basket.position.y = -radius - 1.6;
  group.add(ball, basket);
  for (const o of group.children) o.castShadow = true;
  return group;
};

/** GLB を読む前・読めなかったときのほかの飛行機（箱の胴と翼。前は −Z、原点は底の中心） */
const makeBoxPlane = (color: THREE.ColorRepresentation): THREE.Group => {
  const root = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.6 });
  root.add(
    new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.9, 3.4).translate(0, 0.7, 0), mat),
    new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.15, 1).translate(0, 0.7, 0), mat),
  );
  return root;
};

/** 鳥の羽（片側の三角形。付け根は原点、外へ x に伸びる。side は −1 で左、1 で右） */
const wingGeometry = (side: number) => {
  const s = STAGE3.birdWingSpan;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute(
    "position",
    new THREE.Float32BufferAttribute([0, 0, -0.18, 0, 0, 0.22, side * s, 0, 0.08], 3),
  );
  geo.computeVertexNormals();
  return geo;
};

export const createStage3View = (
  rings: readonly Ring[],
  goal: Ring,
  treeOptions: TreeFieldOptions = {},
): Stage3View => {
  const root = new THREE.Group();
  root.name = "stage3";
  const swaps: { mesh: THREE.Mesh; plain: THREE.Material; pick: (look: Look) => THREE.Material }[] = [];

  // 地面（芝）
  const groundGeo = setPlaneUvMeters(
    new THREE.PlaneGeometry(GROUND_SIZE, GROUND_SIZE),
    GROUND_SIZE,
    GROUND_SIZE,
  );
  groundGeo.rotateX(-Math.PI / 2);
  const groundPlain = new THREE.MeshStandardMaterial({ color: 0x6cc35a, roughness: 0.95 });
  const ground = new THREE.Mesh(groundGeo, groundPlain);
  ground.receiveShadow = true;
  root.add(ground);
  // 焼き付けた地面の陰（ステージ3。山のすそ）を uv1 で重ねる。範囲は LOOK.skyBakeSize（外は陰なし。NORI-27）
  setGroundUv1(ground, LOOK.skyBakeSize);
  swaps.push({ mesh: ground, plain: groundPlain, pick: (look) => look.material("grass") });

  // 山（設定の場所。当たり判定と同じ円すい）
  const mountainMat = new THREE.MeshStandardMaterial({ color: 0x7c8f6a, roughness: 1, flatShading: true });
  const snowMat = new THREE.MeshStandardMaterial({ color: 0xf2f4f7, roughness: 0.8, flatShading: true });
  STAGE3.mountains.forEach((m, i) => {
    const cone = new THREE.Mesh(new THREE.ConeGeometry(m.radius, m.height, 8, 1), mountainMat);
    cone.position.set(m.x, m.height / 2, m.z);
    cone.rotation.y = i * 0.7;
    cone.castShadow = cone.receiveShadow = true;
    root.add(cone);
    const capH = m.height * 0.25;
    const cap = new THREE.Mesh(new THREE.ConeGeometry(m.radius * 0.25 + 0.2, capH, 8, 1), snowMat);
    cap.position.set(m.x, m.height - capH / 2 + 0.05, m.z);
    cap.rotation.y = cone.rotation.y;
    root.add(cap);
  });

  // 気球（球と、下のかご。動かない。当たると押し出す）
  const balloonColors = [0xff7a3d, 0xffd23f, 0x9b5de5];
  STAGE3.balloons.forEach((b, i) => {
    const group = makeBalloon(balloonColors[i % balloonColors.length] ?? 0xffffff, b.radius);
    group.position.set(b.x, b.y, b.z);
    root.add(group);
  });

  // ---- 空をにぎやかに（NORI-60。景色だけ。当たり判定なし） ----
  // ほかの飛行機（最初は箱。plane.glb が読めたら usePlaneModel で差しかえる）
  const planes = new THREE.Group();
  planes.name = "other-planes";
  for (const p of STAGE3.otherPlanes) {
    const holder = new THREE.Group();
    holder.rotation.order = "YXZ";
    holder.add(makeBoxPlane(p.color));
    planes.add(holder);
  }
  root.add(planes);
  // ただよう気球
  const balloons = new THREE.Group();
  balloons.name = "drift-balloons";
  for (const b of STAGE3.driftBalloons) balloons.add(makeBalloon(b.color, STAGE3.driftBalloonRadius));
  root.add(balloons);
  // 鳥の群れ（左右の羽を、それぞれ全部の鳥でまとめて1回で描く）
  const birdCount = STAGE3.birdFlocks.length * STAGE3.birdsPerFlock;
  const birdMat = new THREE.MeshLambertMaterial({ color: 0x2f3340, side: THREE.DoubleSide });
  const birds = [-1, 1].map((side) => {
    const mesh = new THREE.InstancedMesh(wingGeometry(side), birdMat, birdCount);
    mesh.name = side < 0 ? "birds-left" : "birds-right";
    mesh.frustumCulled = false; // 群れは動くので、元の形の範囲では見え方を判定しない
    root.add(mesh);
    return mesh;
  });
  // 山のふもとの木（ステージ1・2と同じ描き方）
  const trees = createTreeField(sceneryTrees(), treeOptions);
  root.add(trees.root);

  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const euler = new THREE.Euler(0, 0, 0, "YXZ");
  const at = new THREE.Vector3();
  const one = new THREE.Vector3(1, 1, 1);
  const placeScenery = (tick: number) => {
    planes.children.forEach((holder, i) => {
      const p = otherPlanePose(i, tick);
      holder.position.set(p.x, p.y, p.z);
      // 円を回るので、内側へ少し傾ける（左回りは左の翼が下がる）
      holder.rotation.set(0, p.heading, (STAGE3.otherPlanes[i]?.dir ?? 1) * 0.25);
    });
    balloons.children.forEach((g, i) => {
      const b = driftBalloonPosition(i, tick);
      g.position.set(b.x, b.y, b.z);
    });
    let k = 0;
    for (let f = 0; f < STAGE3.birdFlocks.length; f++) {
      for (let j = 0; j < STAGE3.birdsPerFlock; j++, k++) {
        const b = birdPose(f, j, tick);
        at.set(b.x, b.y, b.z);
        birds.forEach((mesh, s) => {
          // 左の羽（s = 0）は −flap、右の羽は +flap だけ前後の軸（z）まわりに回すと、どちらも上がる
          q.setFromEuler(euler.set(0, b.heading, s === 0 ? -b.flap : b.flap));
          mesh.setMatrixAt(k, m4.compose(at, q, one));
        });
      }
    }
    for (const mesh of birds) mesh.instanceMatrix.needsUpdate = true;
  };
  placeScenery(0);

  // 雲（白い平たいかたまり。高さ 60〜78 m。決まった並び）
  const cloudMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, flatShading: true });
  for (let i = 0; i < 14; i++) {
    const cloud = new THREE.Mesh(new THREE.IcosahedronGeometry(6 + hash(i) * 6, 1), cloudMat);
    const a = hash(i + 10) * Math.PI * 2;
    const d = 60 + hash(i + 20) * 220;
    cloud.position.set(Math.cos(a) * d, 60 + hash(i + 30) * 18, Math.sin(a) * d);
    cloud.scale.set(1.8, 0.6, 1.2);
    root.add(cloud);
  }

  // 輪（トーラス。輪の面が進む向きに向く）とゴール（太く、白い内側の輪つき）
  const ringMat = new THREE.MeshBasicMaterial({ color: RING_COLOR, toneMapped: false });
  const doneMat = new THREE.MeshBasicMaterial({ color: RING_DONE_COLOR, toneMapped: false });
  const ringGeo = new THREE.TorusGeometry(STAGE3.ringRadius, 0.55, 12, 40);
  const doneGeo = new THREE.TorusGeometry(STAGE3.ringRadius, 0.3, 8, 40);
  const ringMeshes = rings.map((r) => {
    const mesh = new THREE.Mesh(ringGeo, ringMat);
    mesh.position.set(r.x, r.y, r.z);
    mesh.rotation.y = r.heading;
    root.add(mesh);
    return mesh;
  });
  const goalGroup = new THREE.Group();
  goalGroup.add(
    new THREE.Mesh(
      new THREE.TorusGeometry(goal.radius, 0.9, 12, 56),
      new THREE.MeshBasicMaterial({ color: GOAL_COLOR, toneMapped: false }),
    ),
    new THREE.Mesh(
      new THREE.TorusGeometry(goal.radius - 1.2, 0.3, 8, 56),
      new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }),
    ),
  );
  goalGroup.position.set(goal.x, goal.y, goal.z);
  goalGroup.rotation.y = goal.heading;
  root.add(goalGroup);

  return {
    root,
    applyLook(look) {
      for (const s of swaps) s.mesh.material = look === null ? s.plain : s.pick(look);
      trees.applyLook(look);
    },
    trees,
    scenery: { planes, balloons, birds },
    usePlaneModel(model) {
      planes.children.forEach((holder, i) => {
        const color = STAGE3.otherPlanes[i]?.color ?? "#ffffff";
        const copy = model.clone(true);
        const recolor = (m: THREE.Material) => {
          if (!(m instanceof THREE.MeshStandardMaterial)) return m;
          if (m.name !== "plane_body" && m.name !== "plane_wing") return m;
          const c = m.clone();
          c.color.set(color);
          return c;
        };
        copy.traverse((o) => {
          if (o instanceof THREE.Mesh) {
            o.material = Array.isArray(o.material)
              ? o.material.map(recolor)
              : recolor(o.material as THREE.Material);
          }
        });
        holder.clear();
        holder.add(copy);
      });
    },
    update(state, tick = state.tick) {
      placeScenery(tick);
      state.rings.forEach((done, i) => {
        const mesh = ringMeshes[i];
        if (mesh === undefined) return;
        // くぐった輪は緑で細く（色だけに頼らない）
        mesh.material = done ? doneMat : ringMat;
        mesh.geometry = done ? doneGeo : ringGeo;
      });
    },
    marker(i) {
      const r = i < 0 ? goal : rings[i];
      if (r === undefined) throw new Error(`輪 ${i} がない`);
      return {
        ring: new THREE.Vector3(r.x, r.y + r.radius, r.z),
        sky: new THREE.Vector3(r.x, r.y + r.radius + 4, r.z),
      };
    },
  };
};

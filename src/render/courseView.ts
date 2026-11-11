// ステージ1のコースの見た目：ほし・チェックポイントの門・ゴールの門・行き先の矢印（NORI-25）。
// 状態（core の CourseState）を読んで描くだけ。場所は core と同じ（STAGE1.route・starPositions）。
import * as THREE from "three";
import type { CourseState, Point } from "../core/course";

export type CourseViewConfig = {
  readonly route: readonly Point[];
  readonly roadWidth: number;
  readonly starHeight: number;
  readonly guideArrowHeight: number;
  readonly checkpointCount: number;
};

const COLORS = {
  star: 0xffd23f,
  next: 0xff8a1f, // 次に行く門：オレンジ（光る）
  later: 0xc9ccd6, // まだ先の門：うすい灰色
  passed: 0x5fcf6b, // 通った門：緑
  goal: 0xff5c93,
  arrow: 0xffffff, // ほし（黄色）と取り違えないよう、白
};

const starShape = () => {
  const shape = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? 0.75 : 0.32;
    const a = (i / 10) * Math.PI * 2 + Math.PI / 2;
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r;
    if (i === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: 0.22,
    bevelEnabled: true,
    bevelSize: 0.06,
    bevelThickness: 0.06,
    bevelSegments: 1,
  });
  geo.center();
  return geo;
};

/** 門：道を横切る2本の柱と横棒。向きは、門に入ってくる道の向き（dir）に直角 */
const makeGate = (at: Point, dir: Point, width: number, height: number, material: THREE.Material) => {
  const gate = new THREE.Group();
  gate.position.set(at.x, 0, at.z);
  gate.rotation.y = Math.atan2(dir.x, dir.z);
  const post = new THREE.CylinderGeometry(0.3, 0.3, height, 12);
  post.translate(0, height / 2, 0);
  for (const side of [-1, 1]) {
    const p = new THREE.Mesh(post, material);
    p.position.x = (side * width) / 2;
    p.castShadow = true;
    gate.add(p);
  }
  const bar = new THREE.Mesh(new THREE.BoxGeometry(width + 0.6, 0.6, 0.6), material);
  bar.position.y = height;
  bar.castShadow = true;
  gate.add(bar);
  return gate;
};

export type CourseView = {
  root: THREE.Group;
  /** 毎フレーム：状態に合わせて、ほしを消す・門の色を変える・矢印を向ける */
  update(course: CourseState, car: { x: number; z: number }, seconds: number): void;
};

export const createCourseView = (stars: readonly Point[], config: CourseViewConfig): CourseView => {
  const root = new THREE.Group();
  root.name = "course";

  // ほし
  const starGeo = starShape();
  const starMat = new THREE.MeshStandardMaterial({
    color: COLORS.star,
    emissive: 0x6b5200,
    roughness: 0.35,
    metalness: 0.2,
  });
  const starMeshes = stars.map((p) => {
    const m = new THREE.Mesh(starGeo, starMat);
    m.position.set(p.x, config.starHeight, p.z);
    m.castShadow = true;
    root.add(m);
    return m;
  });

  // チェックポイントの門（道すじの2〜4番目の点）とゴールの門（最後の点）
  const gateWidth = config.roadWidth + 1;
  const mats = {
    next: new THREE.MeshStandardMaterial({ color: COLORS.next, emissive: 0x7a3300 }),
    later: new THREE.MeshStandardMaterial({ color: COLORS.later }),
    passed: new THREE.MeshStandardMaterial({ color: COLORS.passed }),
    goal: new THREE.MeshStandardMaterial({ color: COLORS.goal, emissive: 0x5a1430 }),
    goalLater: new THREE.MeshStandardMaterial({ color: COLORS.later }),
  };
  const incoming = (i: number): Point => {
    const a = config.route[i - 1] ?? { x: 0, z: 0 };
    const b = config.route[i] ?? { x: 0, z: 0 };
    return { x: b.x - a.x, z: b.z - a.z };
  };
  const checkpointGates = config.route.slice(1, -1).map((p, k) => {
    const gate = makeGate(p, incoming(k + 1), gateWidth, 6, mats.later);
    root.add(gate);
    return gate;
  });
  const lastIndex = config.route.length - 1;
  const goalGate = makeGate(
    config.route[lastIndex] ?? { x: 0, z: 0 },
    incoming(lastIndex),
    gateWidth,
    7.5,
    mats.goalLater,
  );
  root.add(goalGate);
  const paint = (gate: THREE.Group, mat: THREE.Material) => {
    for (const child of gate.children) (child as THREE.Mesh).material = mat;
  };

  // 行き先の矢印（車の上に浮かべ、次の門を指す）。後ろの追従カメラから形が分かるよう、平たい矢印を
  // ほぼ水平に寝かせ、カメラの方へ少し起こす（先が奥を向く円すいだと、後ろからは丸にしか見えない）
  const arrow = new THREE.Group();
  const arrowMat = new THREE.MeshStandardMaterial({
    color: COLORS.arrow,
    emissive: 0x404040,
    side: THREE.DoubleSide,
  });
  const shape = new THREE.Shape();
  shape.moveTo(0, 1.1); // 先
  shape.lineTo(0.9, 0.1);
  shape.lineTo(0.35, 0.1);
  shape.lineTo(0.35, -0.9);
  shape.lineTo(-0.35, -0.9);
  shape.lineTo(-0.35, 0.1);
  shape.lineTo(-0.9, 0.1);
  shape.closePath();
  const flat = new THREE.Mesh(
    new THREE.ExtrudeGeometry(shape, {
      depth: 0.15,
      bevelEnabled: true,
      bevelSize: 0.05,
      bevelThickness: 0.05,
      bevelSegments: 1,
    }),
    arrowMat,
  );
  // 形の +Y（先）を −Z へ向けて寝かせ（−π/2）、そこから 0.5 rad 起こす
  flat.rotation.x = -Math.PI / 2 + 0.5;
  flat.castShadow = true;
  arrow.add(flat);
  root.add(arrow);

  return {
    root,
    update(course, car, seconds) {
      starMeshes.forEach((m, i) => {
        m.visible = course.stars[i] !== true;
        m.rotation.y = seconds * 2 + i * 0.4;
      });
      // 色だけに頼らない：通った門は低くし、次の門はゆっくり明るさを変える（1 回 2 秒。点滅ではない）
      mats.next.emissiveIntensity = 0.6 + 0.4 * Math.sin(seconds * Math.PI);
      checkpointGates.forEach((gate, k) => {
        const passed = k < course.nextCheckpoint;
        paint(gate, passed ? mats.passed : k === course.nextCheckpoint ? mats.next : mats.later);
        gate.scale.y = passed ? 0.5 : 1;
      });
      const goalNext = course.nextCheckpoint >= config.checkpointCount;
      paint(goalGate, goalNext ? mats.goal : mats.goalLater);

      const finished = course.finishTick !== null;
      arrow.visible = !finished;
      const target = config.route[Math.min(lastIndex, course.nextCheckpoint + 1)] ?? { x: 0, z: 0 };
      arrow.position.set(car.x, config.guideArrowHeight + Math.sin(seconds * 3) * 0.15, car.z);
      arrow.rotation.y = Math.atan2(-(target.x - car.x), -(target.z - car.z));
    },
  };
};

// テスト用の仮の車の GLB を組み立てる（自作。外部の素材は使わない）。
// 正しい形を基本にして、壊したい所だけを options で変える。
import { Document, NodeIO } from "@gltf-transform/core";
import { ASSET } from "../../src/config/index.ts";

type Vec3 = [number, number, number];

export type FixtureOptions = {
  /** 車全体の大きさ（幅・高さ・長さ）を何倍にするか */
  scale?: number;
  /** 作らないノードの名前 */
  omitNodes?: readonly string[];
  /** 前輪と後輪を入れ替える（前が +Z を向いた車） */
  backwards?: boolean;
  /** 車体の箱の分割数（三角形を増やす）。1 で 12 三角形 */
  bodySegments?: number;
  /** 全体を上にずらす（原点が底にない） */
  liftY?: number;
  /** 前輪（左）に回転を入れる */
  rotateWheel?: boolean;
};

const addBox = (doc: Document, name: string, size: Vec3, segments = 1) => {
  const [sx, sy, sz] = size.map((v) => v / 2) as Vec3;
  const positions: number[] = [];
  const indices: number[] = [];
  // 箱の6面。segments で各面を細かく分ける（三角形の数を増やすため）
  const faces: [Vec3, Vec3, Vec3][] = [
    [
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
    ],
    [
      [-1, 0, 0],
      [0, 1, 0],
      [0, 0, -1],
    ],
    [
      [0, 1, 0],
      [0, 0, 1],
      [1, 0, 0],
    ],
    [
      [0, -1, 0],
      [0, 0, -1],
      [1, 0, 0],
    ],
    [
      [0, 0, 1],
      [1, 0, 0],
      [0, 1, 0],
    ],
    [
      [0, 0, -1],
      [-1, 0, 0],
      [0, 1, 0],
    ],
  ];
  for (const [n, u, v] of faces) {
    const base = positions.length / 3;
    for (let i = 0; i <= segments; i++) {
      for (let j = 0; j <= segments; j++) {
        const a = (i / segments) * 2 - 1;
        const b = (j / segments) * 2 - 1;
        positions.push(
          (n[0] + u[0] * a + v[0] * b) * sx,
          (n[1] + u[1] * a + v[1] * b) * sy,
          (n[2] + u[2] * a + v[2] * b) * sz,
        );
      }
    }
    for (let i = 0; i < segments; i++) {
      for (let j = 0; j < segments; j++) {
        const p = base + i * (segments + 1) + j;
        const q = p + segments + 1;
        indices.push(p, q, p + 1, p + 1, q, q + 1);
      }
    }
  }
  const buffer = doc.getRoot().listBuffers()[0] ?? doc.createBuffer();
  const prim = doc
    .createPrimitive()
    .setAttribute(
      "POSITION",
      doc.createAccessor().setType("VEC3").setArray(new Float32Array(positions)).setBuffer(buffer),
    )
    .setIndices(doc.createAccessor().setType("SCALAR").setArray(new Uint32Array(indices)).setBuffer(buffer));
  return doc.createMesh(name).addPrimitive(prim);
};

export const makeCarDocument = (options: FixtureOptions = {}): Document => {
  const s = options.scale ?? 1;
  const lift = options.liftY ?? 0;
  const { width, height, length } = ASSET.carSize;
  const doc = new Document();
  doc.createBuffer();
  const scene = doc.createScene("car");
  const omit = new Set(options.omitNodes ?? []);
  const wheelR = 0.42 * s;
  const front = options.backwards ? 1 : -1;
  const parts: [string, Vec3, Vec3][] = [
    // 名前、大きさ、中心の位置
    ["body", [width * s, (height - 0.42) * s, length * s], [0, ((height + 0.42) * s) / 2, 0]],
    ["wheel_FL", [0.34 * s, wheelR * 2, wheelR * 2], [-0.7 * s, wheelR, front * 1.1 * s]],
    ["wheel_FR", [0.34 * s, wheelR * 2, wheelR * 2], [0.7 * s, wheelR, front * 1.1 * s]],
    ["wheel_RL", [0.34 * s, wheelR * 2, wheelR * 2], [-0.7 * s, wheelR, -front * 1.1 * s]],
    ["wheel_RR", [0.34 * s, wheelR * 2, wheelR * 2], [0.7 * s, wheelR, -front * 1.1 * s]],
  ];
  for (const [name, size, [x, y, z]] of parts) {
    if (omit.has(name)) continue;
    const segments = name === "body" ? (options.bodySegments ?? 1) : 1;
    const node = doc
      .createNode(name)
      .setMesh(addBox(doc, name, size, segments))
      .setTranslation([x, y + lift, z]);
    if (options.rotateWheel && name === "wheel_FL") node.setRotation([0, 0.3826834, 0, 0.9238795]);
    scene.addChild(node);
  }
  doc.getRoot().setDefaultScene(scene);
  return doc;
};

export const makeCarGlb = async (options: FixtureOptions = {}): Promise<Uint8Array> =>
  new NodeIO().writeBinary(makeCarDocument(options));

export type VehicleKind = keyof typeof ASSET.vehicles;

export type VehicleFixtureOptions = FixtureOptions & {
  /** プロペラを決めた側の反対に付ける */
  propellerWrongSide?: boolean;
  /** プロペラを左右にずらす（m） */
  propellerOffsetX?: number;
  /** プロペラに回転を入れる */
  rotatePropeller?: boolean;
};

/** 車のほかの4台の、正しい形の仮の GLB（箱の組み合わせ）。壊したい所だけを options で変える */
export const makeVehicleDocument = (kind: VehicleKind, options: VehicleFixtureOptions = {}): Document => {
  const spec = ASSET.vehicles[kind];
  const s = options.scale ?? 1;
  const lift = options.liftY ?? 0;
  const { width, height, length } = spec.size;
  const nodes: readonly string[] = spec.nodes;
  const doc = new Document();
  doc.createBuffer();
  const scene = doc.createScene(kind);
  const omit = new Set(options.omitNodes ?? []);
  const front = options.backwards ? 1 : -1;
  const hasWheels = nodes.includes("wheel_FL");
  const wheelR = hasWheels ? 0.4 * s : 0;
  // 体は外形いっぱいの箱。タイヤがあるときは、タイヤの上に載せる
  const parts: [string, Vec3, Vec3][] = [
    ["body", [width * s, height * s - wheelR, length * s], [0, (height * s + wheelR) / 2, 0]],
  ];
  if (hasWheels) {
    const wx = (width / 2 - 0.2) * s;
    const wz = (length / 2 - 0.6) * s;
    parts.push(
      ["wheel_FL", [0.3 * s, wheelR * 2, wheelR * 2], [-wx, wheelR, front * wz]],
      ["wheel_FR", [0.3 * s, wheelR * 2, wheelR * 2], [wx, wheelR, front * wz]],
      ["wheel_RL", [0.3 * s, wheelR * 2, wheelR * 2], [-wx, wheelR, -front * wz]],
      ["wheel_RR", [0.3 * s, wheelR * 2, wheelR * 2], [wx, wheelR, -front * wz]],
    );
  }
  if (nodes.includes("propeller")) {
    const at = "propellerAt" in spec ? spec.propellerAt : "front";
    const sign = (at === "front" ? -1 : 1) * (options.propellerWrongSide ? -1 : 1);
    // 体の端の内側（外形を変えない）
    parts.push([
      "propeller",
      [0.6 * s, 0.6 * s, 0.1 * s],
      [options.propellerOffsetX ?? 0, (height * s) / 2, sign * (length / 2 - 0.1) * s],
    ]);
  }
  if (nodes.includes("light")) {
    parts.push(["light", [0.2 * s, 0.2 * s, 0.1 * s], [0, (height * s) / 2, front * (length / 2 - 0.1) * s]]);
  }
  for (const [name, size, [x, y, z]] of parts) {
    if (omit.has(name)) continue;
    const segments = name === "body" ? (options.bodySegments ?? 1) : 1;
    const node = doc
      .createNode(name)
      .setMesh(addBox(doc, name, size, segments))
      .setTranslation([x, y + lift, z]);
    if (options.rotateWheel && name === "wheel_FL") node.setRotation([0, 0.3826834, 0, 0.9238795]);
    if (options.rotatePropeller && name === "propeller") node.setRotation([0, 0, 0.3826834, 0.9238795]);
    scene.addChild(node);
  }
  doc.getRoot().setDefaultScene(scene);
  return doc;
};

export const makeVehicleGlb = async (
  kind: VehicleKind,
  options: VehicleFixtureOptions = {},
): Promise<Uint8Array> => new NodeIO().writeBinary(makeVehicleDocument(kind, options));

/** GLB の JSON の部分を書き換えて、詰め直す（外部の URI などを入れた壊れたファイルを作るため） */
export const rewriteGlbJson = (
  glb: Uint8Array,
  edit: (json: Record<string, unknown>) => void,
): Uint8Array => {
  const view = new DataView(glb.buffer, glb.byteOffset, glb.byteLength);
  const jsonLength = view.getUint32(12, true);
  const json = JSON.parse(new TextDecoder().decode(glb.subarray(20, 20 + jsonLength))) as Record<
    string,
    unknown
  >;
  edit(json);
  const rest = glb.subarray(20 + jsonLength);
  let text = JSON.stringify(json);
  while (new TextEncoder().encode(text).length % 4 !== 0) text += " ";
  const jsonBytes = new TextEncoder().encode(text);
  const out = new Uint8Array(12 + 8 + jsonBytes.length + rest.length);
  const outView = new DataView(out.buffer);
  outView.setUint32(0, 0x46546c67, true); // "glTF"
  outView.setUint32(4, 2, true);
  outView.setUint32(8, out.length, true);
  outView.setUint32(12, jsonBytes.length, true);
  outView.setUint32(16, 0x4e4f534a, true); // "JSON"
  out.set(jsonBytes, 20);
  out.set(rest, 20 + jsonBytes.length);
  return out;
};

export type TreeFixtureOptions = FixtureOptions & {
  /** 葉の箱の分割数（三角形を増やす）。1 で 12 三角形 */
  leafSegments?: number;
};

/** 木（ASSET.tree）の、正しい形の仮の GLB：幹（細い箱）と葉（外形いっぱいの箱）。原点は幹の底の中心 */
export const makeTreeDocument = (options: TreeFixtureOptions = {}): Document => {
  const s = options.scale ?? 1;
  const lift = options.liftY ?? 0;
  const { width, height, length } = ASSET.tree.size;
  const doc = new Document();
  doc.createBuffer();
  const scene = doc.createScene("tree");
  const omit = new Set(options.omitNodes ?? []);
  const trunkH = 1.6 * s;
  const parts: [string, Vec3, Vec3, number][] = [
    ["trunk", [0.5 * s, trunkH, 0.5 * s], [0, trunkH / 2, 0], 1],
    [
      "leaves",
      [width * s, height * s - trunkH + 0.4 * s, length * s],
      [0, (height * s + trunkH - 0.4 * s) / 2, 0],
      options.leafSegments ?? 1,
    ],
  ];
  for (const [name, size, [x, y, z], segments] of parts) {
    if (omit.has(name)) continue;
    scene.addChild(
      doc
        .createNode(name)
        .setMesh(addBox(doc, name, size, segments))
        .setTranslation([x, y + lift, z]),
    );
  }
  doc.getRoot().setDefaultScene(scene);
  return doc;
};

export const makeTreeGlb = async (options: TreeFixtureOptions = {}): Promise<Uint8Array> =>
  new NodeIO().writeBinary(makeTreeDocument(options));

/** 海の生きもの（ASSET.sea）の、正しい形の仮の GLB：外形いっぱいの箱1つ（body）。原点は底の中心 */
export const makeSeaGlb = async (
  name: (typeof ASSET.sea.variants)[number],
  options: FixtureOptions = {},
): Promise<Uint8Array> => makeBodyBoxGlb(name, ASSET.sea.sizes[name], options);

/** 街のモデル（ASSET.city。NORI-61）の、正しい形の仮の GLB：外形いっぱいの箱1つ（body）。原点は底の中心 */
export const makeCityGlb = async (
  name: (typeof ASSET.city.variants)[number],
  options: CityFixtureOptions = {},
): Promise<Uint8Array> =>
  makeBodyBoxGlb(
    name,
    ASSET.city.sizes[name],
    options,
    (ASSET.city.materials as Record<string, readonly string[]>)[name] ?? [],
  );

export type CityFixtureOptions = FixtureOptions & {
  /** 付けない素材の名前（NORI-70：素材の名前の検査を確かめるため） */
  omitMaterials?: readonly string[];
};

const makeBodyBoxGlb = async (
  name: string,
  size: { width: number; height: number; length: number },
  options: CityFixtureOptions,
  materials: readonly string[] = [],
): Promise<Uint8Array> => {
  const s = options.scale ?? 1;
  const lift = options.liftY ?? 0;
  const { width, height, length } = size;
  const doc = new Document();
  doc.createBuffer();
  const scene = doc.createScene(name);
  if (!(options.omitNodes ?? []).includes("body")) {
    const mesh = addBox(doc, "body", [width * s, height * s, length * s], 1);
    // 決まりの素材（ランプ・服）を、同じ箱の面にもう1つずつ付ける（名前を読み取れればよい）
    const base = mesh.listPrimitives()[0];
    for (const m of materials.filter((m) => !(options.omitMaterials ?? []).includes(m))) {
      if (base) mesh.addPrimitive(base.clone().setMaterial(doc.createMaterial(m)));
    }
    scene.addChild(
      doc
        .createNode("body")
        .setMesh(mesh)
        .setTranslation([0, (height * s) / 2 + lift, 0]),
    );
  }
  doc.getRoot().setDefaultScene(scene);
  return new NodeIO().writeBinary(doc);
};

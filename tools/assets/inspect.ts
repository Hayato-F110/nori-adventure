// GLB の検査（NORI-18）。docs/game-rules.md「3D モデル（アセット）」の決まりを守っているかを調べる。
// ゲームには入らない（開発のときだけ使う道具）。数値は src/config の ASSET から読む。
import { getBounds, NodeIO } from "@gltf-transform/core";
import type { Document, Node } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import validator from "gltf-validator";
import { ASSET } from "../../src/config/index.ts";

const GLB_MAGIC = 0x46546c67; // "glTF"
const TRIANGLES = 4; // glTF の primitive.mode

export type GlbReport = {
  bytes: number;
  /** 読めなかったときの理由（読めたら null） */
  parseError: string | null;
  triangles: number;
  /** 三角形の集まり以外（線・点など）の primitive の数 */
  nonTrianglePrimitives: number;
  size: { width: number; height: number; length: number };
  min: [number, number, number];
  max: [number, number, number];
  nodeNames: string[];
  /** 名前 → 位置・回転（ゲームが動かすノードを調べるため） */
  nodes: Record<string, { translation: number[]; rotation: number[] }>;
  /** buffers・images にある URI（GLB の中だけで完結していれば空） */
  uris: string[];
  extensions: string[];
};

const emptyReport = (bytes: number, parseError: string): GlbReport => ({
  bytes,
  parseError,
  triangles: 0,
  nonTrianglePrimitives: 0,
  size: { width: 0, height: 0, length: 0 },
  min: [0, 0, 0],
  max: [0, 0, 0],
  nodeNames: [],
  nodes: {},
  uris: [],
  extensions: [],
});

/** GLB の JSON の部分だけを読む（外部の URI を、gltf-transform に読みに行かせる前に調べるため） */
const readGlbJson = (glb: Uint8Array): Record<string, unknown> | null => {
  if (glb.byteLength < 20) return null;
  const view = new DataView(glb.buffer, glb.byteOffset, glb.byteLength);
  if (view.getUint32(0, true) !== GLB_MAGIC) return null;
  const jsonLength = view.getUint32(12, true);
  if (20 + jsonLength > glb.byteLength) return null;
  try {
    return JSON.parse(new TextDecoder().decode(glb.subarray(20, 20 + jsonLength))) as Record<string, unknown>;
  } catch {
    return null;
  }
};

const urisIn = (json: Record<string, unknown>): string[] =>
  (["buffers", "images"] as const).flatMap((key) => {
    const list = json[key];
    if (!Array.isArray(list)) return [];
    return list.flatMap((item: unknown) => {
      const uri = (item as { uri?: unknown } | null)?.uri;
      return typeof uri === "string" ? [uri] : [];
    });
  });

const countTriangles = (doc: Document): { triangles: number; nonTriangle: number } => {
  let triangles = 0;
  let nonTriangle = 0;
  // ノードごとに数える（同じメッシュを2か所で使えば2回分）
  for (const node of doc.getRoot().listNodes()) {
    for (const prim of node.getMesh()?.listPrimitives() ?? []) {
      if (prim.getMode() !== TRIANGLES) {
        nonTriangle++;
        continue;
      }
      const count = prim.getIndices()?.getCount() ?? prim.getAttribute("POSITION")?.getCount() ?? 0;
      triangles += Math.floor(count / 3);
    }
  }
  return { triangles, nonTriangle };
};

export const inspectGlb = async (glb: Uint8Array): Promise<GlbReport> => {
  const json = readGlbJson(glb);
  if (json === null) return emptyReport(glb.byteLength, "GLB として読めない（ヘッダーか JSON が壊れている）");
  const uris = urisIn(json);
  const extensions = Array.isArray(json.extensionsUsed) ? json.extensionsUsed.map(String) : [];
  // 外部の URI があるファイルは、ここで止める（gltf-transform に外を読みに行かせない）
  if (uris.length > 0) return { ...emptyReport(glb.byteLength, "外部の URI がある"), uris, extensions };

  let doc: Document;
  try {
    doc = await new NodeIO().registerExtensions(ALL_EXTENSIONS).readBinary(glb);
  } catch (error) {
    return { ...emptyReport(glb.byteLength, `読み込みに失敗：${String(error)}`), extensions };
  }
  const scene = doc.getRoot().getDefaultScene() ?? doc.getRoot().listScenes()[0];
  const bounds = scene ? getBounds(scene) : { min: [0, 0, 0], max: [0, 0, 0] };
  const [minX = 0, minY = 0, minZ = 0] = bounds.min;
  const [maxX = 0, maxY = 0, maxZ = 0] = bounds.max;
  const { triangles, nonTriangle } = countTriangles(doc);
  const nodeList: Node[] = doc.getRoot().listNodes();
  return {
    bytes: glb.byteLength,
    parseError: null,
    triangles,
    nonTrianglePrimitives: nonTriangle,
    size: { width: maxX - minX, height: maxY - minY, length: maxZ - minZ },
    min: [minX, minY, minZ],
    max: [maxX, maxY, maxZ],
    nodeNames: nodeList.map((n) => n.getName()),
    nodes: Object.fromEntries(
      nodeList.map((n) => [
        n.getName(),
        { translation: [...n.getTranslation()], rotation: [...n.getRotation()] },
      ]),
    ),
    uris,
    extensions,
  };
};

export type VehicleKind = keyof typeof ASSET.vehicles;
export type AssetKind = "car" | VehicleKind | "generic";

/** 名前（npm run assets:import <名前>）から、使う決まりを選ぶ。乗り物でなければ generic */
export const kindOf = (name: string): AssetKind =>
  name === "car" || Object.hasOwn(ASSET.vehicles, name) ? (name as AssetKind) : "generic";

type ShapeSpec = {
  size: { width: number; height: number; length: number };
  nodes: readonly string[];
  propellerAt?: "front" | "rear";
};

const specOf = (kind: Exclude<AssetKind, "generic">): ShapeSpec =>
  kind === "car" ? { size: ASSET.carSize, nodes: ASSET.carNodes } : ASSET.vehicles[kind];

const pct = (v: number) => `${Math.round(v * 100)}%`;

/** 決まりに合わない点を、日本語の文の一覧で返す（空なら合格） */
export const checkGlb = (report: GlbReport, kind: AssetKind): string[] => {
  const problems: string[] = [];
  if (report.bytes > ASSET.maxGlbBytes) {
    problems.push(`大きさが ${report.bytes} バイトで、上限 ${ASSET.maxGlbBytes} バイトを超えている`);
  }
  for (const uri of report.uris) problems.push(`外部の URI がある：${uri.slice(0, 60)}`);
  const allowed = new Set<string>(ASSET.allowedExtensions);
  for (const ext of report.extensions) {
    if (!allowed.has(ext)) problems.push(`許可していない拡張を使っている：${ext}`);
  }
  if (report.parseError !== null) {
    if (report.uris.length === 0) problems.push(report.parseError);
    return problems;
  }
  if (report.triangles > ASSET.maxTriangles) {
    problems.push(`三角形が ${report.triangles} 個で、上限 ${ASSET.maxTriangles} 個を超えている`);
  }
  if (report.nonTrianglePrimitives > 0) {
    problems.push(`三角形でない面（線・点など）が ${report.nonTrianglePrimitives} 個ある`);
  }
  if (kind !== "generic") problems.push(...checkShape(report, specOf(kind)));
  return problems;
};

const hasNoRotation = (rotation: number[] | undefined): boolean => {
  const [qx = 0, qy = 0, qz = 0, qw = 1] = rotation ?? [];
  return Math.abs(qx) <= 1e-4 && Math.abs(qy) <= 1e-4 && Math.abs(qz) <= 1e-4 && Math.abs(qw - 1) <= 1e-4;
};

const checkShape = (report: GlbReport, spec: ShapeSpec): string[] => {
  const problems: string[] = [];
  const tol = ASSET.sizeTolerance;
  const labels = { width: "幅", height: "高さ", length: "長さ" } as const;
  for (const key of ["width", "height", "length"] as const) {
    const want = spec.size[key];
    const got = report.size[key];
    if (Math.abs(got - want) > want * tol) {
      problems.push(`${labels[key]}が ${got.toFixed(2)} m で、${want} m ±${pct(tol)} の外`);
    }
  }
  // 原点は車体の底の中心
  const [minX, minY, minZ] = report.min;
  const [maxX, , maxZ] = report.max;
  const cx = (minX + maxX) / 2;
  const cz = (minZ + maxZ) / 2;
  if (
    Math.abs(minY) > spec.size.height * tol ||
    Math.abs(cx) > spec.size.width * tol ||
    Math.abs(cz) > spec.size.length * tol
  ) {
    problems.push(
      `原点が車体の底の中心にない（底の高さ ${minY.toFixed(2)} m、中心 x ${cx.toFixed(2)}・z ${cz.toFixed(2)} m）`,
    );
  }
  const missing = spec.nodes.filter((name) => !(name in report.nodes));
  for (const name of missing) problems.push(`ノード ${name} がない`);
  if (missing.length > 0) return problems;

  const z = (name: string) => report.nodes[name]?.translation[2] ?? 0;
  const x = (name: string) => report.nodes[name]?.translation[0] ?? 0;
  const wheels = spec.nodes.filter((n) => n.startsWith("wheel_"));
  if (wheels.length > 0) {
    if (!(z("wheel_FL") < z("wheel_RL") && z("wheel_FR") < z("wheel_RR"))) {
      problems.push("前輪が後輪より −Z の側にない（前は −Z）");
    }
    if (!(x("wheel_FL") < 0 && x("wheel_RL") < 0 && x("wheel_FR") > 0 && x("wheel_RR") > 0)) {
      problems.push("左のタイヤ（_L）が −X、右のタイヤ（_R）が +X の側にない");
    }
  }
  if (spec.propellerAt !== undefined) {
    const wantFront = spec.propellerAt === "front";
    if (wantFront ? !(z("propeller") < 0) : !(z("propeller") > 0)) {
      problems.push(`propeller が${wantFront ? "前（−Z）" : "後ろ（+Z）"}の側にない`);
    }
    // 回る軸（前後の向き）が、左右の中心の上にあること
    if (Math.abs(x("propeller")) > spec.size.width * tol) {
      problems.push(`propeller が左右の中心にない（x ${x("propeller").toFixed(2)} m。回る軸の上にない）`);
    }
  }
  for (const name of [...wheels, ...(spec.propellerAt !== undefined ? ["propeller"] : [])]) {
    if (!hasNoRotation(report.nodes[name]?.rotation)) {
      problems.push(`${name} に回転が入っている（回す・切るのはゲームがする。Blender で回転を適用する）`);
    }
  }
  return problems;
};

export type ValidationResult = { errors: number; messages: string[] };

/** Khronos の glTF-Validator で調べる。外部のファイルは読まない */
export const validateGlb = async (glb: Uint8Array): Promise<ValidationResult> => {
  const report = await validator.validateBytes(glb, {
    maxIssues: 20,
    externalResourceFunction: () => Promise.reject(new Error("外部のファイルは読まない")),
  });
  const messages = report.issues.messages
    .filter((m) => m.severity === 0)
    .map((m) => `${m.code}：${m.message}（${m.pointer ?? ""}）`);
  return { errors: report.issues.numErrors, messages };
};

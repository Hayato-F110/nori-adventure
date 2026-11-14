import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ASSET, STAGE4, TRAFFIC } from "../../src/config/index.ts";
import { type AssetKind, checkGlb, inspectGlb, kindOf, validateGlb } from "../../tools/assets/inspect.ts";
import {
  makeCarGlb,
  makeCityGlb,
  makeSeaGlb,
  makeTreeGlb,
  makeVehicleGlb,
  rewriteGlbJson,
  type VehicleKind,
} from "./fixture.ts";

// docs/game-rules.md「3D モデル（アセット）」の決まりを、tools/assets/ の検査が守らせることを確かめる。
// 数値は ASSET から読む（直書きしない）。

const problemsOf = async (glb: Uint8Array, kind: AssetKind = "car") => checkGlb(await inspectGlb(glb), kind);

describe("正しい仮の車", () => {
  it("Khronos の glTF-Validator でエラーが0", async () => {
    const result = await validateGlb(await makeCarGlb());
    expect(result.messages).toEqual([]);
    expect(result.errors).toBe(0);
  });

  it("決まりの検査で問題が0", async () => {
    expect(await problemsOf(await makeCarGlb())).toEqual([]);
  });

  it("大きさ・三角形・ノードの名前を読み取れる", async () => {
    const report = await inspectGlb(await makeCarGlb());
    expect(report.triangles).toBe(12 * 5);
    expect(report.size.width).toBeCloseTo(ASSET.carSize.width, 1);
    expect(report.size.height).toBeCloseTo(ASSET.carSize.height, 1);
    expect(report.size.length).toBeCloseTo(ASSET.carSize.length, 1);
    expect(report.nodeNames).toEqual(expect.arrayContaining([...ASSET.carNodes]));
  });
});

describe("上限（ASSET.maxGlbBytes・ASSET.maxTriangles）", () => {
  it("三角形が上限を超えると問題になる", async () => {
    // 6面 × n² × 2 が上限を超える分割数
    const n = Math.ceil(Math.sqrt(ASSET.maxTriangles / 12)) + 1;
    const problems = await problemsOf(await makeCarGlb({ bodySegments: n }));
    expect(problems.join("\n")).toMatch(/三角形/);
  });

  it("大きさ（バイト）が上限を超えると問題になる", async () => {
    // 三角形は上限以内のまま、余分なデータで大きくする
    const glb = await makeCarGlb();
    const big = rewriteGlbJson(glb, (json) => {
      json.extras = { padding: "x".repeat(ASSET.maxGlbBytes) };
    });
    const problems = await problemsOf(big);
    expect(problems.join("\n")).toMatch(/大きさ.*バイト|バイト/);
  });
});

describe("車の形（ASSET.carSize・ASSET.sizeTolerance・ASSET.carNodes）", () => {
  it("許容より大きいと問題になる", async () => {
    const problems = await problemsOf(await makeCarGlb({ scale: 1 + ASSET.sizeTolerance * 2 }));
    expect(problems.join("\n")).toMatch(/幅|高さ|長さ/);
  });

  it("許容の内側の差は問題にしない", async () => {
    expect(await problemsOf(await makeCarGlb({ scale: 1 + ASSET.sizeTolerance / 2 }))).toEqual([]);
  });

  it.each(ASSET.carNodes)("ノード %s がないと問題になる", async (name) => {
    const problems = await problemsOf(await makeCarGlb({ omitNodes: [name] }));
    expect(problems.join("\n")).toContain(name);
  });

  it("前が +Z を向いていると問題になる（前は −Z）", async () => {
    const problems = await problemsOf(await makeCarGlb({ backwards: true }));
    expect(problems.join("\n")).toMatch(/前/);
  });

  it("原点が車体の底にないと問題になる", async () => {
    const problems = await problemsOf(await makeCarGlb({ liftY: 1 }));
    expect(problems.join("\n")).toMatch(/原点|底/);
  });

  it("タイヤのノードに回転が入っていると問題になる（回す・切るのはゲームがする）", async () => {
    const problems = await problemsOf(await makeCarGlb({ rotateWheel: true }));
    expect(problems.join("\n")).toMatch(/wheel_FL.*回転|回転.*wheel_FL/);
  });

  it("車以外（generic）は、形と名前を調べない", async () => {
    expect(await problemsOf(await makeCarGlb({ omitNodes: ["body"], scale: 2 }), "generic")).toEqual([]);
  });
});

// 車のほかの4台（NORI-20〜23。docs/game-rules.md「車のほかの4台」）
const VEHICLES = Object.keys(ASSET.vehicles) as VehicleKind[];
const WHEELED = VEHICLES.filter((k) => (ASSET.vehicles[k].nodes as readonly string[]).includes("wheel_FL"));
const PROPELLED = VEHICLES.filter((k) =>
  (ASSET.vehicles[k].nodes as readonly string[]).includes("propeller"),
);

describe.each(VEHICLES)("乗り物 %s（ASSET.vehicles）", (kind) => {
  const spec = ASSET.vehicles[kind];

  it("正しい形は、glTF-Validator のエラーが0で、決まりの検査も問題が0", async () => {
    const glb = await makeVehicleGlb(kind);
    expect((await validateGlb(glb)).messages).toEqual([]);
    expect(await problemsOf(glb, kind)).toEqual([]);
  });

  it("大きさを設計値どおりに読み取れる", async () => {
    const report = await inspectGlb(await makeVehicleGlb(kind));
    expect(report.size.width).toBeCloseTo(spec.size.width, 1);
    expect(report.size.height).toBeCloseTo(spec.size.height, 1);
    expect(report.size.length).toBeCloseTo(spec.size.length, 1);
  });

  it("許容より大きいと問題になり、許容の内側なら問題にしない", async () => {
    const big = await problemsOf(await makeVehicleGlb(kind, { scale: 1 + ASSET.sizeTolerance * 2 }), kind);
    expect(big.join("\n")).toMatch(/幅|高さ|長さ/);
    const ok = await problemsOf(await makeVehicleGlb(kind, { scale: 1 + ASSET.sizeTolerance / 2 }), kind);
    expect(ok).toEqual([]);
  });

  it.each(spec.nodes)("ノード %s がないと問題になる", async (name) => {
    const problems = await problemsOf(await makeVehicleGlb(kind, { omitNodes: [name] }), kind);
    expect(problems.join("\n")).toContain(name);
  });

  it("原点が底にないと問題になる", async () => {
    const problems = await problemsOf(await makeVehicleGlb(kind, { liftY: 1 }), kind);
    expect(problems.join("\n")).toMatch(/原点|底/);
  });

  it("車の決まりで調べると、名前か大きさが合わない（取り違えに気づける）", async () => {
    expect((await problemsOf(await makeVehicleGlb(kind), "car")).length).toBeGreaterThan(0);
  });
});

describe.each(WHEELED)("タイヤのある乗り物 %s", (kind) => {
  it("前が +Z を向いていると問題になる", async () => {
    const problems = await problemsOf(await makeVehicleGlb(kind, { backwards: true }), kind);
    expect(problems.join("\n")).toMatch(/前/);
  });

  it("タイヤに回転が入っていると問題になる", async () => {
    const problems = await problemsOf(await makeVehicleGlb(kind, { rotateWheel: true }), kind);
    expect(problems.join("\n")).toMatch(/wheel_FL.*回転/);
  });
});

describe.each(PROPELLED)("プロペラのある乗り物 %s", (kind) => {
  it("プロペラが決めた側（propellerAt）の反対にあると問題になる", async () => {
    const problems = await problemsOf(await makeVehicleGlb(kind, { propellerWrongSide: true }), kind);
    expect(problems.join("\n")).toMatch(/propeller/);
  });

  it("プロペラが左右の中心からずれていると問題になる（回る軸の上にない）", async () => {
    const problems = await problemsOf(await makeVehicleGlb(kind, { propellerOffsetX: 0.5 }), kind);
    expect(problems.join("\n")).toMatch(/propeller.*中心/);
  });

  it("プロペラに回転が入っていると問題になる", async () => {
    const problems = await problemsOf(await makeVehicleGlb(kind, { rotatePropeller: true }), kind);
    expect(problems.join("\n")).toMatch(/propeller.*回転/);
  });
});

describe("外のものを読まない（脅威分析 S-06、CSP）", () => {
  it("外部の URI（画像）があると問題になる", async () => {
    const glb = rewriteGlbJson(await makeCarGlb(), (json) => {
      json.images = [{ uri: "https://example.com/a.png" }];
    });
    const problems = await problemsOf(glb);
    expect(problems.join("\n")).toMatch(/URI/);
  });

  it("data: の URI も問題にする（GLB の中の bufferView に入れる）", async () => {
    const glb = rewriteGlbJson(await makeCarGlb(), (json) => {
      json.images = [{ uri: "data:image/png;base64,AAAA" }];
    });
    expect((await problemsOf(glb)).join("\n")).toMatch(/URI/);
  });

  it("許可していない拡張（復号の WASM が要る Draco）があると問題になる", async () => {
    const glb = rewriteGlbJson(await makeCarGlb(), (json) => {
      json.extensionsUsed = ["KHR_draco_mesh_compression"];
    });
    expect((await problemsOf(glb)).join("\n")).toContain("KHR_draco_mesh_compression");
  });

  it("許可した拡張だけなら問題にしない", async () => {
    const glb = rewriteGlbJson(await makeCarGlb(), (json) => {
      json.extensionsUsed = [...ASSET.allowedExtensions];
    });
    expect(await problemsOf(glb)).toEqual([]);
  });

  it("GLB でないファイルは問題にする（読み込みで落ちない）", async () => {
    const problems = await problemsOf(new TextEncoder().encode("not a glb"));
    expect(problems.length).toBeGreaterThan(0);
  });
});

// docs/game-rules.md「木（NORI-26）」
describe("木（ASSET.tree）", () => {
  it.each(ASSET.tree.variants)("名前 %s は木の決まりで検査する", (name) => {
    expect(kindOf(name)).toBe("tree");
  });

  it("正しい形の木は、Validator のエラー0・決まりの問題0", async () => {
    const glb = await makeTreeGlb();
    expect((await validateGlb(glb)).errors).toBe(0);
    expect(await problemsOf(glb, "tree")).toEqual([]);
  });

  it(`三角形が ASSET.tree.maxTriangles（${ASSET.tree.maxTriangles}）を超えると止まる（乗り物の上限より厳しい）`, async () => {
    // 葉の箱を 9 分割：12 × 81 = 972 個 ＋ 幹 12 個
    const problems = await problemsOf(await makeTreeGlb({ leafSegments: 9 }), "tree");
    expect(problems.join("\n")).toMatch(/三角形/);
  });

  it(`大きさが ASSET.tree.maxGlbBytes（${ASSET.tree.maxGlbBytes} B）を超えると止まる`, async () => {
    const report = await inspectGlb(await makeTreeGlb());
    const problems = checkGlb({ ...report, bytes: ASSET.tree.maxGlbBytes + 1 }, "tree");
    expect(problems.join("\n")).toMatch(/大きさが/);
  });

  it("大きさが ±10% の外だと止まる", async () => {
    expect((await problemsOf(await makeTreeGlb({ scale: 1.3 }), "tree")).join("\n")).toMatch(/高さ/);
  });

  it.each(ASSET.tree.nodes)("部品 %s がないと止まる", async (name) => {
    const problems = await problemsOf(await makeTreeGlb({ omitNodes: [name] }), "tree");
    expect(problems).toContain(`ノード ${name} がない`);
  });

  it("原点が幹の底にないと止まる", async () => {
    expect((await problemsOf(await makeTreeGlb({ liftY: 1 }), "tree")).join("\n")).toMatch(/原点/);
  });
});

// docs/game-rules.md「海の生きもののモデル」（NORI-28）
describe("海の生きもの（ASSET.sea）", () => {
  it.each(ASSET.sea.variants)("%s は、自分の大きさの決まりで検査し、正しい形なら問題0", async (name) => {
    expect(kindOf(name)).toBe(name);
    const glb = await makeSeaGlb(name);
    expect((await validateGlb(glb)).errors).toBe(0);
    expect(await problemsOf(glb, name)).toEqual([]);
  });

  it("大きさが ±10% の外だと止まる", async () => {
    expect(
      (await problemsOf(await makeSeaGlb("sea-dolphin", { scale: 1.3 }), "sea-dolphin")).join("\n"),
    ).toMatch(/長さ/);
  });

  it(`大きさが ASSET.sea.maxGlbBytes（${ASSET.sea.maxGlbBytes} B）を超えると止まる`, async () => {
    const report = await inspectGlb(await makeSeaGlb("sea-fish"));
    expect(checkGlb({ ...report, bytes: ASSET.sea.maxGlbBytes + 1 }, "sea-fish").join("\n")).toMatch(
      /大きさが/,
    );
  });

  it(`三角形が ASSET.sea.maxTriangles（${ASSET.sea.maxTriangles}）を超えると止まる`, async () => {
    const report = await inspectGlb(await makeSeaGlb("sea-turtle"));
    expect(checkGlb({ ...report, triangles: ASSET.sea.maxTriangles + 1 }, "sea-turtle").join("\n")).toMatch(
      /三角形/,
    );
  });

  it("部品 body がないと止まる", async () => {
    expect(await problemsOf(await makeSeaGlb("sea-ray", { omitNodes: ["body"] }), "sea-ray")).toContain(
      "ノード body がない",
    );
  });

  it("見つける生きもの（STAGE4.creatures）は、みな sea- の名前のモデルがある", () => {
    for (const c of STAGE4.creatures) expect(ASSET.sea.variants).toContain(`sea-${c.kind}`);
  });
});

// docs/game-rules.md「街をにぎやかに」のモデルの表（NORI-61）
describe("街のモデル（ASSET.city）", () => {
  it.each(ASSET.city.variants)("%s は、自分の大きさの決まりで検査し、正しい形なら問題0", async (name) => {
    expect(kindOf(name)).toBe(name);
    const glb = await makeCityGlb(name);
    expect((await validateGlb(glb)).errors).toBe(0);
    expect(await problemsOf(glb, name)).toEqual([]);
  });

  it("大きさが ±10% の外だと止まる", async () => {
    expect((await problemsOf(await makeCityGlb("bus", { scale: 1.2 }), "bus")).join("\n")).toMatch(/長さ/);
  });

  it("原点が底にないと止まる", async () => {
    expect((await problemsOf(await makeCityGlb("person", { liftY: 0.5 }), "person")).join("\n")).toMatch(
      /原点/,
    );
  });

  it(`大きさが ASSET.city.maxGlbBytes（${ASSET.city.maxGlbBytes} B）を超えると止まる`, async () => {
    const report = await inspectGlb(await makeCityGlb("police"));
    expect(checkGlb({ ...report, bytes: ASSET.city.maxGlbBytes + 1 }, "police").join("\n")).toMatch(
      /大きさが/,
    );
  });

  it(`三角形が ASSET.city.maxTriangles（${ASSET.city.maxTriangles}）を超えると止まる`, async () => {
    const report = await inspectGlb(await makeCityGlb("fire-truck"));
    expect(checkGlb({ ...report, triangles: ASSET.city.maxTriangles + 1 }, "fire-truck").join("\n")).toMatch(
      /三角形/,
    );
  });

  it("部品 body がないと止まる", async () => {
    expect(await problemsOf(await makeCityGlb("bicycle", { omitNodes: ["body"] }), "bicycle")).toContain(
      "ノード body がない",
    );
  });

  // NORI-70（初見レビュー 61-34）：ルールの表「パトカーのランプ（素材の名前 lamp_red・lamp_blue）」「服（素材の名前 shirt）」。
  // 名前が違うと、ゲームはランプを光らせず、服を塗りかえない（cityLifeView.ts は素材の名前で探す）
  const required = Object.entries(ASSET.city.materials).flatMap(([name, mats]) =>
    mats.map((m) => [name as (typeof ASSET.city.variants)[number], m] as const),
  );
  it("ランプ・服の素材の決まり：パトカー・消防車は lamp_red・lamp_blue、人・自転車・バイクは shirt", () => {
    expect(ASSET.city.materials.police).toEqual(["lamp_red", "lamp_blue"]);
    expect(ASSET.city.materials["fire-truck"]).toEqual(["lamp_red", "lamp_blue"]);
    for (const name of ["person", "bicycle", "motorbike"] as const) {
      expect(ASSET.city.materials[name]).toEqual(["shirt"]);
    }
  });

  // 初見レビュー R1-70-8：検査は assets:import のときにしか動かないので、リポジトリに入っている本物の GLB を CI でも毎回かける
  it.each(ASSET.city.variants)(
    "本物の public/models/%s.glb は、glTF-Validator のエラー 0、街の決まり（大きさ・素材の名前など）で問題0",
    async (name) => {
      const glb = new Uint8Array(
        readFileSync(path.resolve(import.meta.dirname, `../../public/models/${name}.glb`)),
      );
      expect((await validateGlb(glb)).errors).toBe(0);
      expect(await problemsOf(glb, name)).toEqual([]);
    },
  );

  it.each(required)("%s に素材 %s がないと止まる", async (name, material) => {
    const glb = await makeCityGlb(name, { omitMaterials: [material] });
    expect(await problemsOf(glb, name)).toContain(`素材 ${material} がない`);
  });

  // NORI-70（初見レビュー R2-61-38）：モデルの表の大きさ（幅 × 高さ × 長さ）が、設定 ASSET.city.sizes と同じこと。
  // 表には「設定のキー」の欄がないので、game-rules.md と設定の一致の検査（rules-sync）が見ていなかった
  it("game-rules.md の街のモデルの表の大きさは、ASSET.city.sizes と同じ（7種類すべて）", () => {
    const rules = readFileSync(path.resolve(import.meta.dirname, "../../docs/game-rules.md"), "utf8");
    const rows = new Map(
      [...rules.matchAll(/^\| `([a-z-]+)` +\| ([\d.]+) × ([\d.]+) × ([\d.]+) /gm)].map((m) => [
        m[1] ?? "",
        { width: Number(m[2]), height: Number(m[3]), length: Number(m[4]) },
      ]),
    );
    for (const name of ASSET.city.variants) {
      expect(rows.get(name), `${name} の行`).toEqual(ASSET.city.sizes[name]);
    }
  });

  it("回る車（TRAFFIC.vehicles）と自転車・バイク・人は、みな ASSET.city のモデルがある", () => {
    const used = [...TRAFFIC.vehicles.map((v) => v.model), "bicycle", "motorbike", "person"];
    for (const m of used) expect(ASSET.city.variants).toContain(m);
  });
});

import { describe, expect, it } from "vitest";
import { ASSET } from "../../src/config/index.ts";
import { type AssetKind, checkGlb, inspectGlb, validateGlb } from "../../tools/assets/inspect.ts";
import { makeCarGlb, makeVehicleGlb, rewriteGlbJson, type VehicleKind } from "./fixture.ts";

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

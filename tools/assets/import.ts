// 使い方：npm run assets:import <名前>   例：npm run assets:import car
// Blender（隔離した noriblender）が書き出した GLB を検査し、合格したら public/models/ に置いて manifest を更新する。
// 書き出しの場所は C:\NoriBlender\work\export\（NORI_EXPORT_DIR で変えられる）。
import { createHash } from "node:crypto";
import { copyFileSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { type AssetKind, checkGlb, inspectGlb, validateGlb } from "./inspect.ts";
import { type Manifest, upsertEntry } from "./manifest.ts";

const NAME_PATTERN = /^[a-z][a-z0-9-]{0,31}$/; // ファイル名に使うので、フォルダをまたぐ文字（/ \ ..）を許さない
const KINDS: Record<string, AssetKind> = { car: "car" };

const root = path.resolve(import.meta.dirname, "../..");
const exportDir = process.env.NORI_EXPORT_DIR ?? "C:/NoriBlender/work/export";
const modelsDir = path.join(root, "public/models");

const fail = (lines: string[]): never => {
  console.error(["取り込みませんでした：", ...lines.map((l) => `  - ${l}`)].join("\n"));
  process.exit(1);
};

const name = process.argv[2] ?? "";
if (!NAME_PATTERN.test(name)) fail([`名前は英小文字で始まる英数字とハイフン（32文字まで）：「${name}」`]);

const from = path.join(exportDir, `${name}.glb`);
const glb = new Uint8Array(readFileSync(from));

const validation = await validateGlb(glb);
if (validation.errors > 0)
  fail([`glTF-Validator のエラーが ${validation.errors} 件`, ...validation.messages]);

const report = await inspectGlb(glb);
const problems = checkGlb(report, KINDS[name] ?? "generic");
if (problems.length > 0) fail(problems);

const file = `${name}.glb`;
copyFileSync(from, path.join(modelsDir, file));
const manifestPath = path.join(modelsDir, "manifest.json");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as Manifest;
const round = (v: number) => Math.round(v * 1000) / 1000;
const next = upsertEntry(manifest, {
  name,
  file,
  sha256: createHash("sha256").update(glb).digest("hex"),
  bytes: glb.byteLength,
  triangles: report.triangles,
  size: {
    width: round(report.size.width),
    height: round(report.size.height),
    length: round(report.size.length),
  },
  createdWith:
    process.env.NORI_CREATED_WITH ??
    "Blender 5.2.3（noriblender の隔離環境。Blender MCP で Claude が作成を補助）",
  source: `C:/NoriBlender/work/${name}.blend`,
  author: "オーナー",
  license: "オーナーの著作（リポジトリのライセンスに従う）",
  externalAssets: "なし",
  importedAt: new Date().toISOString().slice(0, 10),
});
writeFileSync(manifestPath, `${JSON.stringify(next, null, 2)}\n`);
console.info(
  `取り込みました：public/models/${file}（${glb.byteLength} バイト、三角形 ${report.triangles} 個、` +
    `幅 ${round(report.size.width)}・高さ ${round(report.size.height)}・長さ ${round(report.size.length)} m）`,
);

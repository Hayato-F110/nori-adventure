// 使い方：npm run textures:import
// Blender（隔離した noriblender）が縮小して書き出した見た目の素材を検査し、合格したら public/textures/ に置いて manifest を書く。
// 書き出しの場所は blender-work/export/textures/（.gitignore 済み。NORI_TEXTURE_DIR で変えられる）。
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  checkTextureFiles,
  LIGHTMAP_FILE,
  OWN_LICENSE,
  STAGE2_LIGHTMAP_FILE,
  STAGE3_LIGHTMAP_FILE,
  STAGE4_LIGHTMAP_FILE,
  STAGE5_LIGHTMAP_FILE,
  requiredTextureFiles,
  type TextureManifest,
} from "./textures.ts";

type Source = { source: string; id: string; name: string; url: string; license: string };

const root = path.resolve(import.meta.dirname, "../..");
const fromDir = process.env.NORI_TEXTURE_DIR ?? path.join(root, "blender-work/export/textures");
const toDir = path.join(root, "public/textures");

const fail = (lines: string[]): never => {
  console.error(["取り込みませんでした：", ...lines.map((l) => `  - ${l}`)].join("\n"));
  process.exit(1);
};

// 出所（Blender のスクリプトが asset.json から写したもの）
const sources = JSON.parse(readFileSync(path.join(fromDir, "sources.json"), "utf8")) as Record<
  string,
  Source
>;
// 自作の地面の陰（Blender の Cycles で焼き付け）。ステージ1・2
const ownBake = (id: string, name: string, script: string): Source => ({
  source: "自作（のりものアドベンチャー）",
  id,
  name,
  url: `https://github.com/Hayato-F110/nori-adventure/blob/main/tools/blender/${script}`,
  license: OWN_LICENSE,
});
const OWN: Record<string, Source> = {
  [LIGHTMAP_FILE]: ownBake("ground_ao", "ステージ1の地面の陰（AO）", "bake-ground-ao.py"),
  [STAGE2_LIGHTMAP_FILE]: ownBake("ground_ao_stage2", "ステージ2の地面の陰（AO）", "bake-stage2-ao.py"),
  [STAGE3_LIGHTMAP_FILE]: ownBake("ground_ao_stage3", "ステージ3の地面の陰（AO）", "bake-sky-sea-ao.py"),
  [STAGE4_LIGHTMAP_FILE]: ownBake("ground_ao_stage4", "ステージ4の海底の陰（AO）", "bake-sky-sea-ao.py"),
  [STAGE5_LIGHTMAP_FILE]: ownBake("ground_ao_stage5", "ステージ5の月面の陰（AO）", "bake-sky-sea-ao.py"),
};
const sourceOf = (file: string): Source | undefined =>
  OWN[file] ?? sources[file === "sky.hdr" ? "sky" : (file.split("_")[0] ?? "")];
// asset.json の "CC0 1.0" を SPDX の書き方に
const spdx = (license: string) =>
  license.replace(/\s+/g, "-").toUpperCase() === "CC0-1.0" ? "CC0-1.0" : license;

const names = requiredTextureFiles();
const files = names.map((name) => ({
  name,
  bytes: new Uint8Array(readFileSync(path.join(fromDir, name))),
  license: spdx(sourceOf(name)?.license ?? ""),
}));
const problems = checkTextureFiles(files);
if (problems.length > 0) fail(problems);

mkdirSync(toDir, { recursive: true });
const today = new Date().toISOString().slice(0, 10);
// 中身（ハッシュ値）が前と同じ素材は、前の取り込みの日付を残す（出所の記録を正しく保つ）
const manifestPath = path.join(toDir, "manifest.json");
const previous: TextureManifest = existsSync(manifestPath)
  ? (JSON.parse(readFileSync(manifestPath, "utf8")) as TextureManifest)
  : { textures: [] };
const previousOf = new Map(previous.textures.map((t) => [t.file, t]));
const manifest: TextureManifest = {
  textures: files.map((f) => {
    const src = sourceOf(f.name) as Source;
    copyFileSync(path.join(fromDir, f.name), path.join(toDir, f.name));
    const sha256 = createHash("sha256").update(f.bytes).digest("hex");
    const before = previousOf.get(f.name);
    return {
      file: f.name,
      sha256,
      bytes: f.bytes.byteLength,
      sourceId: src.id,
      sourceName: src.name,
      sourceUrl: src.url,
      provider: src.source,
      license: f.license,
      createdWith:
        f.name in OWN
          ? `Blender 5.3.0（noriblender の隔離環境）の Cycles で焼き付け（tools/blender/${src.url.split("/").pop() ?? ""}）`
          : (process.env.NORI_CREATED_WITH ??
            "Blender 5.3.0（noriblender の隔離環境）で縮小（tools/blender/export-textures.py）"),
      importedAt: before !== undefined && before.sha256 === sha256 ? before.importedAt : today,
    };
  }),
};
writeFileSync(path.join(toDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
const total = files.reduce((s, f) => s + f.bytes.byteLength, 0);
console.info(`取り込みました：public/textures/ に ${files.length} 個（合計 ${total} バイト）`);

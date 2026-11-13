// public/textures/manifest.json：見た目の素材（CC0）の出所の記録と検査（NORI-56。アセット版の SBOM。脅威分析 S-05）。
// 数値は src/config の LOOK から読む（docs/game-rules.md「見た目」）。

import { LOOK } from "../../src/config/index.ts";

export type TextureEntry = {
  file: string;
  sha256: string;
  bytes: number;
  /** どの素材から作ったか（ambientCG・Poly Haven の ID） */
  sourceId: string;
  sourceName: string;
  sourceUrl: string;
  /** 配布元（ambientCG・Poly Haven） */
  provider: string;
  license: string;
  /** 縮小のやり方 */
  createdWith: string;
  importedAt: string;
};

export type TextureManifest = { textures: TextureEntry[] };

/** 使ってよい素材のライセンス（パブリックドメインと同じ扱いの CC0 だけ） */
export const TEXTURE_LICENSE = "CC0-1.0";

const RIFF = [0x52, 0x49, 0x46, 0x46]; // "RIFF"
const WEBP = [0x57, 0x45, 0x42, 0x50]; // "WEBP"
const RADIANCE = "#?RADIANCE";

const startsWith = (bytes: Uint8Array, at: number, sig: readonly number[]) =>
  sig.every((b, i) => bytes[at + i] === b);

export const isWebp = (bytes: Uint8Array) => startsWith(bytes, 0, RIFF) && startsWith(bytes, 8, WEBP);
export const isRadianceHdr = (bytes: Uint8Array) =>
  new TextDecoder().decode(bytes.subarray(0, RADIANCE.length)) === RADIANCE;

/** 自作の素材（Blender で焼き付けた地面の陰）。ライセンスは自作の素材と同じ CC BY 4.0（LICENSE-ASSETS.md） */
export const LIGHTMAP_FILE = "ground_ao.webp";
/** ステージ2の地面の陰（NORI-26。tools/blender/bake-stage2-ao.py） */
export const STAGE2_LIGHTMAP_FILE = "ground_ao_stage2.webp";
/** ステージ3・4の地面・海底の陰（NORI-27・28。tools/blender/bake-sky-sea-ao.py） */
export const STAGE3_LIGHTMAP_FILE = "ground_ao_stage3.webp";
export const STAGE4_LIGHTMAP_FILE = "ground_ao_stage4.webp";
/** ステージ5の月面の陰（NORI-29。tools/blender/bake-sky-sea-ao.py） */
export const STAGE5_LIGHTMAP_FILE = "ground_ao_stage5.webp";
export const LIGHTMAP_FILES: readonly string[] = [
  LIGHTMAP_FILE,
  STAGE2_LIGHTMAP_FILE,
  STAGE3_LIGHTMAP_FILE,
  STAGE4_LIGHTMAP_FILE,
  STAGE5_LIGHTMAP_FILE,
];
export const OWN_LICENSE = "CC-BY-4.0";

/** ファイル名の決まり：<素材>_<color|normal|roughness>.webp、sky.hdr、ground_ao.webp・ground_ao_stage[2-5].webp だけ（フォルダをまたぐ文字は許さない） */
export const FILE_PATTERN =
  /^(?:[A-Za-z0-9]+_(?:color|normal|roughness)\.webp|sky\.hdr|ground_ao\.webp|ground_ao_stage[2-5]\.webp)$/;

/** 決まりに合わない点を、日本語の文の一覧で返す（空なら合格） */
export const checkTextureFiles = (
  files: readonly { name: string; bytes: Uint8Array; license: string }[],
): string[] => {
  const problems: string[] = [];
  let total = 0;
  for (const f of files) {
    total += f.bytes.byteLength;
    if (!FILE_PATTERN.test(f.name)) problems.push(`ファイル名が決まりに合わない：${f.name}`);
    const own = LIGHTMAP_FILES.includes(f.name);
    const wantLicense = own ? OWN_LICENSE : TEXTURE_LICENSE;
    if (f.license !== wantLicense) {
      problems.push(
        `${f.name} のライセンスが ${f.license}（${own ? "自作は CC BY 4.0" : "外部の素材は CC0 だけ使う"}）`,
      );
    }
    if (f.name.endsWith(".webp")) {
      if (!isWebp(f.bytes)) problems.push(`${f.name} が WebP でない`);
      const limit = own ? LOOK.maxLightmapBytes : LOOK.maxTextureBytes;
      if (f.bytes.byteLength > limit) {
        problems.push(`${f.name} が ${f.bytes.byteLength} バイトで、上限 ${limit} を超えている`);
      }
    }
    if (f.name.endsWith(".hdr")) {
      if (!isRadianceHdr(f.bytes)) problems.push(`${f.name} が Radiance HDR でない`);
      if (f.bytes.byteLength > LOOK.maxHdriBytes) {
        problems.push(`${f.name} が ${f.bytes.byteLength} バイトで、上限 ${LOOK.maxHdriBytes} を超えている`);
      }
    }
  }
  if (total > LOOK.maxTotalBytes)
    problems.push(`合計が ${total} バイトで、上限 ${LOOK.maxTotalBytes} を超えている`);
  return problems;
};

/** LOOK.surfaces が使う素材のファイルの一覧（3枚ずつ）と sky.hdr、地面の陰。同じ素材を色味を変えて使う（砂と月の砂）ので、重ねない */
export const requiredTextureFiles = (): string[] => [
  ...new Set([
    ...Object.values(LOOK.surfaces).flatMap((s) =>
      ["color", "normal", "roughness"].map((m) => `${s.texture}_${m}.webp`),
    ),
    "sky.hdr",
    ...LIGHTMAP_FILES,
  ]),
];

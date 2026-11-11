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

/** ファイル名の決まり：<素材>_<color|normal|roughness>.webp と sky.hdr だけ（フォルダをまたぐ文字は許さない） */
export const FILE_PATTERN = /^(?:[A-Za-z0-9]+_(?:color|normal|roughness)\.webp|sky\.hdr)$/;

/** 決まりに合わない点を、日本語の文の一覧で返す（空なら合格） */
export const checkTextureFiles = (
  files: readonly { name: string; bytes: Uint8Array; license: string }[],
): string[] => {
  const problems: string[] = [];
  let total = 0;
  for (const f of files) {
    total += f.bytes.byteLength;
    if (!FILE_PATTERN.test(f.name)) problems.push(`ファイル名が決まりに合わない：${f.name}`);
    if (f.license !== TEXTURE_LICENSE) problems.push(`${f.name} のライセンスが ${f.license}（CC0 だけ使う）`);
    if (f.name.endsWith(".webp")) {
      if (!isWebp(f.bytes)) problems.push(`${f.name} が WebP でない`);
      if (f.bytes.byteLength > LOOK.maxTextureBytes) {
        problems.push(
          `${f.name} が ${f.bytes.byteLength} バイトで、上限 ${LOOK.maxTextureBytes} を超えている`,
        );
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

/** LOOK.surfaces が使う素材のファイルの一覧（3枚ずつ）と sky.hdr */
export const requiredTextureFiles = (): string[] => [
  ...Object.values(LOOK.surfaces).flatMap((s) =>
    ["color", "normal", "roughness"].map((m) => `${s.texture}_${m}.webp`),
  ),
  "sky.hdr",
];

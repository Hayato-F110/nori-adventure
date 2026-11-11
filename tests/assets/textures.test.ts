import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { LOOK } from "../../src/config/index.ts";
import { LIGHTMAPS } from "../../src/render/look.ts";
import {
  checkTextureFiles,
  LIGHTMAP_FILE,
  LIGHTMAP_FILES,
  OWN_LICENSE,
  requiredTextureFiles,
  TEXTURE_LICENSE,
  type TextureManifest,
} from "../../tools/assets/textures.ts";

// docs/game-rules.md「見た目」（NORI-56）：素材の大きさの上限・形式・ライセンス・出所の記録
const webp = (size: number) => {
  const b = new Uint8Array(size);
  b.set([0x52, 0x49, 0x46, 0x46], 0);
  b.set([0x57, 0x45, 0x42, 0x50], 8);
  return b;
};
const hdr = (size: number) => {
  const b = new Uint8Array(size);
  b.set(new TextEncoder().encode("#?RADIANCE"), 0);
  return b;
};
const ok = (name: string, bytes: Uint8Array) => ({ name, bytes, license: TEXTURE_LICENSE });

describe("checkTextureFiles（LOOK の上限）", () => {
  it("決まりどおりなら問題なし", () => {
    expect(checkTextureFiles([ok("Grass004_color.webp", webp(1000)), ok("sky.hdr", hdr(1000))])).toEqual([]);
  });

  it(`地面の陰（${LIGHTMAP_FILE}）は自作なので CC BY 4.0。上限は LOOK.maxLightmapBytes`, () => {
    const own = (bytes: Uint8Array, license = OWN_LICENSE) => ({ name: LIGHTMAP_FILE, bytes, license });
    expect(checkTextureFiles([own(webp(LOOK.maxTextureBytes + 1))])).toEqual([]);
    expect(checkTextureFiles([own(webp(LOOK.maxLightmapBytes + 1))]).join("\n")).toMatch(/上限/);
    expect(checkTextureFiles([own(webp(16), TEXTURE_LICENSE)]).join("\n")).toMatch(/ライセンス/);
  });

  it("テクスチャ1枚の上限を超えると問題", () => {
    const p = checkTextureFiles([ok("Grass004_color.webp", webp(LOOK.maxTextureBytes + 1))]);
    expect(p.join("\n")).toMatch(/上限/);
  });

  it("HDRI の上限を超えると問題", () => {
    expect(checkTextureFiles([ok("sky.hdr", hdr(LOOK.maxHdriBytes + 1))]).join("\n")).toMatch(/上限/);
  });

  it("合計の上限を超えると問題", () => {
    const many = Array.from({ length: Math.ceil(LOOK.maxTotalBytes / LOOK.maxTextureBytes) + 1 }, (_, i) =>
      ok(`T${i}_color.webp`, webp(LOOK.maxTextureBytes)),
    );
    expect(checkTextureFiles(many).join("\n")).toMatch(/合計/);
  });

  it("中身が WebP・HDR でないと問題（名前だけ変えたファイルを入れない）", () => {
    expect(checkTextureFiles([ok("Grass004_color.webp", new Uint8Array(100))]).join("\n")).toMatch(
      /WebP でない/,
    );
    expect(checkTextureFiles([ok("sky.hdr", new Uint8Array(100))]).join("\n")).toMatch(/HDR でない/);
  });

  it("CC0 以外のライセンスは問題", () => {
    const p = checkTextureFiles([{ name: "Grass004_color.webp", bytes: webp(16), license: "CC-BY-4.0" }]);
    expect(p.join("\n")).toMatch(/ライセンス/);
  });

  it("決まりに合わないファイル名（フォルダをまたぐ文字など）は問題", () => {
    expect(checkTextureFiles([ok("../evil.webp", webp(16))]).join("\n")).toMatch(/ファイル名/);
  });
});

describe("public/textures/manifest.json（取り込んだ素材の出所の記録）", () => {
  const dir = path.resolve(import.meta.dirname, "../../public/textures");
  const manifest = JSON.parse(readFileSync(path.join(dir, "manifest.json"), "utf8")) as TextureManifest;

  it("LOOK.surfaces が使う素材がすべてそろっている", () => {
    expect(manifest.textures.map((t) => t.file).sort()).toEqual(requiredTextureFiles().sort());
  });

  it("記録した SHA-256 と大きさが、ファイルと一致する", () => {
    for (const t of manifest.textures) {
      const bytes = readFileSync(path.join(dir, t.file));
      expect(createHash("sha256").update(bytes).digest("hex"), t.file).toBe(t.sha256);
      expect(bytes.length, t.file).toBe(t.bytes);
    }
  });

  it("ファイルは上限以内。外部の素材は CC0 で出所は ambientCG か Poly Haven、自作の地面の陰は CC BY 4.0", () => {
    const files = manifest.textures.map((t) => ({
      name: t.file,
      bytes: new Uint8Array(readFileSync(path.join(dir, t.file))),
      license: t.license,
    }));
    expect(checkTextureFiles(files)).toEqual([]);
    for (const t of manifest.textures) {
      // 外部の素材は配布元、自作の地面の陰はこのリポジトリの作り方のスクリプト
      const pattern = LIGHTMAP_FILES.includes(t.file)
        ? /^https:\/\/github\.com\/Hayato-F110\/nori-adventure\//
        : /^https:\/\/(ambientcg\.com|polyhaven\.com)\//;
      expect(t.sourceUrl, t.file).toMatch(pattern);
    }
  });

  it("manifest にないファイルが public/textures/ にない", () => {
    expect(existsSync(dir)).toBe(true);
    const listed = new Set(["manifest.json", ...manifest.textures.map((t) => t.file)]);
    expect(readdirSync(dir).filter((f) => !listed.has(f))).toEqual([]);
  });

  // docs/game-rules.md「木（NORI-26）」：幹の素材（color・normal・roughness）の合計
  it(`木の素材（幹）の合計は LOOK.maxTreeTextureBytes（${LOOK.maxTreeTextureBytes} B）以下`, () => {
    const bark = LOOK.surfaces.bark.texture;
    const files = manifest.textures.filter((t) => t.file.startsWith(`${bark}_`));
    expect(files).toHaveLength(3);
    expect(files.reduce((sum, t) => sum + t.bytes, 0)).toBeLessThanOrEqual(LOOK.maxTreeTextureBytes);
  });

  it("ゲームが読む地面の陰（LIGHTMAPS）は、取り込みの決まり（LIGHTMAP_FILES）と同じで、manifest にある", () => {
    expect(Object.values(LIGHTMAPS)).toEqual([...LIGHTMAP_FILES]);
    for (const f of LIGHTMAP_FILES) expect(manifest.textures.map((t) => t.file)).toContain(f);
  });
});

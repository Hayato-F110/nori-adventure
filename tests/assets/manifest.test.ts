import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ASSET } from "../../src/config/index.ts";
import { type Manifest, REQUIRED_TEXT_FIELDS, upsertEntry } from "../../tools/assets/manifest.ts";

// public/models/ の出所の記録（アセット版の SBOM。脅威分析 S-05、公開チェックリスト #8）。
const root = path.resolve(import.meta.dirname, "../..");
const dir = path.join(root, "public/models");
const manifest = JSON.parse(readFileSync(path.join(dir, "manifest.json"), "utf8")) as Manifest;

describe("public/models/manifest.json", () => {
  it("ある", () => {
    expect(existsSync(path.join(dir, "manifest.json"))).toBe(true);
    expect(Array.isArray(manifest.models)).toBe(true);
  });

  it("記録した SHA-256 と大きさが、ファイルと一致する", () => {
    for (const m of manifest.models) {
      const bytes = readFileSync(path.join(dir, m.file));
      expect(createHash("sha256").update(bytes).digest("hex"), m.file).toBe(m.sha256);
      expect(bytes.length, m.file).toBe(m.bytes);
    }
  });

  it("大きさと三角形が上限以内", () => {
    for (const m of manifest.models) {
      expect(m.bytes, m.file).toBeLessThanOrEqual(ASSET.maxGlbBytes);
      expect(m.triangles, m.file).toBeLessThanOrEqual(ASSET.maxTriangles);
    }
  });

  it("作者・作り方・ライセンス・元のファイルが書いてあり、外部の素材は「なし」", () => {
    for (const m of manifest.models) {
      for (const field of REQUIRED_TEXT_FIELDS) expect(m[field], `${m.file} の ${field}`).not.toBe("");
      expect(m.externalAssets, m.file).toBe("なし");
    }
  });

  it("manifest にないファイルが public/models/ にない", () => {
    const listed = new Set(["manifest.json", ...manifest.models.map((m) => m.file)]);
    expect(readdirSync(dir).filter((f) => !listed.has(f))).toEqual([]);
  });

  it("名前とファイル名がそろっていて、重ならない", () => {
    const names = manifest.models.map((m) => m.name);
    expect(new Set(names).size).toBe(names.length);
    for (const m of manifest.models) expect(m.file).toBe(`${m.name}.glb`);
  });
});

describe("upsertEntry（取り込みで manifest を更新する）", () => {
  const entry = (name: string, sha256: string) => ({
    name,
    file: `${name}.glb`,
    sha256,
    bytes: 1,
    triangles: 1,
    size: { width: 1, height: 1, length: 1 },
    createdWith: "Blender",
    source: "work/x.blend",
    author: "オーナー",
    license: "x",
    externalAssets: "なし" as const,
    importedAt: "2026-11-07",
  });

  it("同じ名前は置き換え、名前の順に並べる", () => {
    const start: Manifest = { models: [entry("train", "a"), entry("car", "b")] };
    const next = upsertEntry(start, entry("car", "c"));
    expect(next.models.map((m) => `${m.name}:${m.sha256}`)).toEqual(["car:c", "train:a"]);
  });
});

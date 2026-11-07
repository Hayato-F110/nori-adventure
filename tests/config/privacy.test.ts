import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { maskGpu } from "../../e2e/report-mask";

// 公開リポジトリに、PC やユーザーを特定する値を書かない（2026-11-07 の privacy-reviewer の指摘 4・5）。
const root = path.resolve(import.meta.dirname, "../..");
const read = (file: string): string => readFileSync(path.join(root, file), "utf8");

describe("GPU の名前から識別子を消す（E2E の記録）", () => {
  it("（0x…）の識別子を消し、型の名前は残す", () => {
    expect(
      maskGpu("ANGLE (AMD, AMD Radeon (TM) Graphics (0x000015E7) Direct3D11 vs_5_0 ps_5_0, D3D11)"),
    ).toBe("ANGLE (AMD, AMD Radeon (TM) Graphics Direct3D11 vs_5_0 ps_5_0, D3D11)");
  });

  it("識別子がなければ、そのまま返す", () => {
    expect(maskGpu("ANGLE (AMD Radeon Graphics, Direct3D11)")).toBe(
      "ANGLE (AMD Radeon Graphics, Direct3D11)",
    );
  });

  it("E2E は記録する前に maskGpu を通す", () => {
    expect(read("e2e/car-drive.spec.ts")).toMatch(/gpu:\s*maskGpu\(/);
  });

  it("docs/evidence/ の JSON に GPU の識別子がない", () => {
    const dir = path.join(root, "docs/evidence");
    const found = readdirSync(dir)
      .filter((f) => f.endsWith(".json"))
      .filter((f) => /\(0x[0-9a-f]+\)/i.test(readFileSync(path.join(dir, f), "utf8")));
    expect(found).toEqual([]);
  });
});

describe("隔離の確認スクリプト（tools/blender/isolation-check.py）", () => {
  const text = read("tools/blender/isolation-check.py");

  it("ユーザー名そのものを結果に書かない", () => {
    expect(text).not.toMatch(/"user":\s*getpass\.getuser\(\)/);
  });

  it("専用ユーザーかどうかを真偽値で書く", () => {
    expect(text).toMatch(/dedicated\s*=\s*getpass\.getuser\(\)\.lower\(\)\s*==\s*"noriblender"/);
    expect(text).toMatch(/"isDedicatedUser":\s*dedicated,/);
  });

  it("専用ユーザーでなければ isolated にしない", () => {
    expect(text).toMatch(/"isolated":\s*dedicated\s*\n\s*and /);
  });
});

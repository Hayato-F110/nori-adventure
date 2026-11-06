import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// NORI-36：供給網の見張り（Dependabot・npm audit・SBOM）が設定から消えていないかを確かめる。
// 完了条件と脅威分析 S-01・S-02 の「確認方法」に対応する。
const root = path.resolve(import.meta.dirname, "../..");
const read = (file: string): string => readFileSync(path.join(root, file), "utf8");

describe("Dependabot（.github/dependabot.yml）", () => {
  const file = ".github/dependabot.yml";

  it("ファイルがあり、version 2 で書かれている", () => {
    expect(existsSync(path.join(root, file))).toBe(true);
    expect(read(file)).toMatch(/^version:\s*2\s*(#.*)?$/m);
  });

  it("npm と GitHub Actions の両方を、ルート（/）で見張る", () => {
    // 行末のコメント（# …）は許す
    const text = read(file);
    expect(text).toMatch(/package-ecosystem:\s*"npm"[^\n]*\n\s*directory:\s*"\/"/);
    expect(text).toMatch(/package-ecosystem:\s*"github-actions"[^\n]*\n\s*directory:\s*"\/"/);
  });

  it("コミットの文の先頭に課題キー（NORI-36）が付く", () => {
    expect(read(file).match(/prefix:\s*"NORI-36"/g)?.length).toBe(2);
  });
});

describe("CI（.github/workflows/ci.yml）", () => {
  const ci = read(".github/workflows/ci.yml");

  it("npm audit を high 以上で失敗させる", () => {
    expect(ci).toMatch(/run:\s*npm audit --audit-level=high/);
  });

  it("SBOM（SPDX）を作り、成果物として残す", () => {
    expect(ci).toMatch(/run:\s*npm sbom --sbom-format=spdx/);
    expect(ci).toMatch(/name:\s*sbom-spdx/);
  });

  it("アクションはタグではなくコミットの SHA（40桁）で固定する", () => {
    const uses = [...ci.matchAll(/uses:\s*([^\s#]+)/g)].map((m) => m[1] ?? "");
    expect(uses.length).toBeGreaterThan(0);
    for (const ref of uses) expect(ref).toMatch(/@[0-9a-f]{40}$/);
  });
});

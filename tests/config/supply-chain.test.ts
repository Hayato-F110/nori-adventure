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

  it("TypeScript の major 更新は見送る（typescript-eslint が TypeScript 6.1 未満しか受け付けない）", () => {
    expect(read(file)).toMatch(
      /dependency-name:\s*"typescript"\s*\n\s*update-types:\s*\["version-update:semver-major"\]/,
    );
  });

  it("@types/node は見送らない（Node 本体と一緒に上げる。下の一致テストで版のずれを見張る）", () => {
    expect(read(file)).not.toMatch(/dependency-name:\s*"@types\/node"/);
  });

  it("コミットの文の先頭に課題キー（NORI-36）が付く", () => {
    expect(read(file).match(/prefix:\s*"NORI-36"/g)?.length).toBe(2);
  });
});

describe("Node の版の一致（CI・engines・@types/node）", () => {
  // 型（@types/node）の版が実行する Node より新しいと、実行時にない API を型検査が通してしまう。
  // C で言えば、ターゲットのライブラリより新しいヘッダでビルドするのと同じ
  const ci = read(".github/workflows/ci.yml");
  const pkg = JSON.parse(read("package.json")) as {
    engines: { node: string };
    devDependencies: Record<string, string>;
  };
  const ciMajors = [...ci.matchAll(/node-version:\s*(\d+)/g)].map((m) => Number(m[1]));

  it("CI のすべてのジョブが同じ Node の major（26 = 2026-10-28 からの Active LTS）を使う", () => {
    expect(ciMajors.length).toBeGreaterThanOrEqual(2);
    expect(new Set(ciMajors)).toEqual(new Set([26]));
  });

  it("engines の下限の major が CI と同じ", () => {
    expect(pkg.engines.node).toMatch(/^>=(\d+)\./);
    expect(Number(/^>=(\d+)\./.exec(pkg.engines.node)?.[1])).toBe(ciMajors[0]);
  });

  it("@types/node の major が CI の Node と同じ", () => {
    const types = pkg.devDependencies["@types/node"] ?? "";
    expect(Number(types.split(".")[0])).toBe(ciMajors[0]);
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

describe("minimatch の固定（GHSA-g3hv-75wg-m249、脅威分析 S-02）", () => {
  // eslint 10 は minimatch 10 系を指定するが、直った版は 11.0.1 から。overrides で 11 系にそろえる。
  // eslint が自分で 11 系を使うようになったら、overrides とこのテストを外す。
  const [fixedMajor, fixedMinor, fixedPatch] = [11, 0, 1];
  const atLeastFixed = (v: string): boolean => {
    const [a = 0, b = 0, c = 0] = v.split(".").map(Number);
    return a !== fixedMajor ? a > fixedMajor : b !== fixedMinor ? b > fixedMinor : c >= fixedPatch;
  };

  it("package.json の overrides で、直った版以上を正確な版で指定している", () => {
    const pkg = JSON.parse(read("package.json")) as { overrides?: Record<string, string> };
    const v = pkg.overrides?.minimatch ?? "";
    expect(v).toMatch(/^\d+\.\d+\.\d+$/);
    expect(atLeastFixed(v)).toBe(true);
  });

  it("lockfile の minimatch がすべて直った版以上", () => {
    const lock = JSON.parse(read("package-lock.json")) as {
      packages: Record<string, { version?: string }>;
    };
    const versions = Object.entries(lock.packages)
      .filter(([name]) => name.endsWith("node_modules/minimatch"))
      .map(([, p]) => p.version ?? "");
    expect(versions.length).toBeGreaterThan(0);
    expect(versions.filter((v) => !atLeastFixed(v))).toEqual([]);
  });
});

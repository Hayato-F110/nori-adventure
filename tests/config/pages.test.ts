import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { productionCsp } from "../../tools/build/csp.ts";

// NORI-16：GitHub Pages への自動デプロイと CSP。脅威分析 S-04（Pages の権限は deploy の job だけ）。
const root = path.resolve(import.meta.dirname, "../..");
const read = (file: string): string => readFileSync(path.join(root, file), "utf8");
const file = ".github/workflows/pages.yml";

// 「jobs:」の下の、各 job の部分を取り出す（YAML のパーサーを入れずに、インデントで区切る）
const jobBlock = (text: string, job: string): string => {
  const start = text.indexOf(`\n  ${job}:\n`);
  if (start < 0) return "";
  const rest = text.slice(start + 1);
  const next = rest.slice(1).search(/\n {2}[a-z][\w-]*:\n/);
  return next < 0 ? rest : rest.slice(0, next + 1);
};

describe("Pages のワークフロー（.github/workflows/pages.yml）", () => {
  const text = existsSync(path.join(root, file)) ? read(file) : "";

  it("ある", () => {
    expect(text).not.toBe("");
  });

  it("main への push（と手動）だけで動く。PR では動かない", () => {
    expect(text).toMatch(/on:\s*\n\s+push:\s*\n\s+branches:\s*\[main\]/);
    expect(text).not.toMatch(/^\s+pull_request/m);
  });

  it("ワークフロー全体の権限は空。job ごとに必要なものだけ付ける", () => {
    expect(text).toMatch(/^permissions:\s*\{\}\s*$/m);
  });

  it("build の job は読むだけ（pages・id-token を持たない）", () => {
    const build = jobBlock(text, "build");
    expect(build).toMatch(/contents:\s*read/);
    expect(build).not.toMatch(/pages:\s*write|id-token:\s*write/);
  });

  it("deploy の job だけが pages: write と id-token: write を持ち、github-pages の環境に出す", () => {
    const deploy = jobBlock(text, "deploy");
    expect(deploy).toMatch(/pages:\s*write/);
    expect(deploy).toMatch(/id-token:\s*write/);
    expect(deploy).toMatch(/environment:\s*\n\s+name:\s*github-pages/);
    expect(deploy).toMatch(/needs:\s*build/);
  });

  it("アクションはコミットの SHA で固定する", () => {
    const uses = [...text.matchAll(/uses:\s*([^\s#]+)/g)].map((m) => m[1] ?? "");
    expect(uses.length).toBeGreaterThanOrEqual(4);
    for (const ref of uses) expect(ref).toMatch(/@[0-9a-f]{40}$/);
  });

  it("checkout は認証情報を残さない。公開するのは dist/ だけ", () => {
    expect(text).toMatch(/persist-credentials:\s*false/);
    expect(text).toMatch(/path:\s*dist/);
  });
});

describe("CSP（本番は style-src の 'unsafe-inline' を外す）", () => {
  const devHtml = read("index.html");

  it("開発用の index.html は 'unsafe-inline' を持つ（Vite の開発サーバーが <style> で CSS を入れるため）", () => {
    expect(devHtml).toMatch(/style-src 'self' 'unsafe-inline'/);
  });

  it("productionCsp は style-src から 'unsafe-inline' を外し、ほかは変えない", () => {
    const out = productionCsp(devHtml);
    expect(out).toMatch(/style-src 'self';/);
    expect(out).not.toContain("'unsafe-inline'");
    expect(out.replace("style-src 'self';", "")).toBe(
      devHtml.replace("style-src 'self' 'unsafe-inline';", ""),
    );
  });

  it("CSP が見つからなければ例外（黙って緩いまま出さない）", () => {
    expect(() => productionCsp("<html></html>")).toThrow();
  });

  it("vite.config.ts が本番のビルドで productionCsp を使う", () => {
    const config = read("vite.config.ts");
    expect(config).toMatch(/productionCsp/);
    expect(config).toMatch(/apply:\s*"build"/);
  });
});

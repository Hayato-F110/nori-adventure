import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { precacheList, precacheVersion } from "../../tools/build/pwa";

// NORI-38 一覧 3・4（docs/test-plans/NORI-38.md）。ルール：「通信なしで持つもの」「キャッシュの上限」「新しい版にするとき」

/** 仮のビルドのフォルダ（.map・sw.js・入れ子のフォルダを含む）を作る */
const fakeDist = (): string => {
  const dir = mkdtempSync(path.join(tmpdir(), "nori-pwa-"));
  mkdirSync(path.join(dir, "assets"));
  mkdirSync(path.join(dir, "models", "sea"), { recursive: true });
  writeFileSync(path.join(dir, "index.html"), "1234567890"); // 10 B
  writeFileSync(path.join(dir, "sw.js"), "x".repeat(1000)); // 除く
  writeFileSync(path.join(dir, "assets", "index-abc.js"), "12345"); // 5 B
  writeFileSync(path.join(dir, "assets", "index-abc.js.map"), "x".repeat(1000)); // 除く
  writeFileSync(path.join(dir, "models", "sea", "ray.glb"), "123"); // 3 B
  return dir;
};

describe("NORI-38 一覧 3：キャッシュの一覧", () => {
  it("フォルダのファイル全部から .map と sw.js を除いたものと、同じ集まり（base からの相対の URL）", () => {
    const { urls } = precacheList(fakeDist(), 1_000_000);
    expect([...urls].sort()).toEqual(["assets/index-abc.js", "index.html", "models/sea/ray.glb"]);
  });

  it("合計の大きさは、除いたものを数えない", () => {
    expect(precacheList(fakeDist(), 1_000_000).totalBytes).toBe(18);
  });

  it("上限ちょうどは通る", () => {
    expect(() => precacheList(fakeDist(), 18)).not.toThrow();
  });

  it("1 バイト超えると止める。エラーの文に合計と上限がある", () => {
    expect(() => precacheList(fakeDist(), 17)).toThrow(/18.*17|17.*18/);
  });
});

describe("NORI-38 一覧 4：版は中身のハッシュ", () => {
  const html = { url: "index.html", content: Buffer.from("<html>") };
  const js = { url: "assets/a.js", content: Buffer.from("console.info(1)") };
  const files = [html, js];

  it("同じ中身なら同じ版。読む順が違っても同じ", () => {
    expect(precacheVersion(files)).toBe(precacheVersion([...files].reverse()));
  });

  it("1 バイト変えると版が変わる", () => {
    const changed = [html, { url: "assets/a.js", content: Buffer.from("console.info(2)") }];
    expect(precacheVersion(changed)).not.toBe(precacheVersion(files));
  });

  it("ファイルの名前だけ変えても版が変わる", () => {
    const renamed = [html, { url: "assets/b.js", content: js.content }];
    expect(precacheVersion(renamed)).not.toBe(precacheVersion(files));
  });

  it("版は 16 進の文字だけ（キャッシュの名前に使う）", () => {
    expect(precacheVersion(files)).toMatch(/^[0-9a-f]{16}$/);
  });
});

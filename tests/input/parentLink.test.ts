import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { PARENT } from "../../src/config/index.ts";
import { holdProgress } from "../../src/input/parentLink.ts";

// docs/game-rules.md「保護者の方への入口（プライバシーポリシー。NORI-54）」
// テストの一覧：
//  1. 押し続けた時間 → 輪の進み（0〜1）。holdSeconds でちょうど 1（開く）
//  2. 子どものタップ（0.3 秒）では開かない
//  3. 印は文字を出さず、読み上げの名前だけ。大きさは PARENT.buttonSize（44 px 以上）
//  4. ポリシーのページ：日本語と英語、CSP、外のサイトから読み込まない、集めない・送らないことと GitHub の記録を書く
const root = path.resolve(import.meta.dirname, "../..");
const html = readFileSync(path.join(root, "index.html"), "utf8");
const css = readFileSync(path.join(root, "src/style.css"), "utf8");
const privacy = readFileSync(path.join(root, "public/privacy.html"), "utf8");
const linkHtml = /<a\s+id="parent"[\s\S]*?<\/a>/.exec(html)?.[0] ?? "";
const textBetweenTags = (fragment: string) =>
  [...fragment.matchAll(/>([^<]*)</g)].map((m) => (m[1] ?? "").trim()).filter((s) => s !== "");

describe("保護者の方への入口", () => {
  it("1. 押し続けた時間 → 輪の進み。holdSeconds でちょうど 1", () => {
    const ms = PARENT.holdSeconds * 1000;
    expect(holdProgress(0)).toBe(0);
    expect(holdProgress(ms / 2)).toBeCloseTo(0.5, 9);
    expect(holdProgress(ms)).toBe(1);
    expect(holdProgress(ms * 2)).toBe(1);
    expect(holdProgress(-5)).toBe(0);
  });

  it("2. 子どものタップ（0.3 秒）では開かない（1 に届かない）", () => {
    expect(holdProgress(300)).toBeLessThan(1);
    expect(PARENT.holdSeconds).toBeGreaterThanOrEqual(1);
  });

  it("3. 印は文字を出さず、読み上げの名前だけ。大きさは PARENT.buttonSize（44 px 以上）", () => {
    expect(linkHtml).not.toBe("");
    expect(textBetweenTags(linkHtml)).toEqual([]);
    expect(linkHtml).toMatch(/aria-label="[^"]+"/);
    expect(linkHtml).toMatch(/href="\.\/privacy\.html"/);
    expect(linkHtml).toMatch(/rel="noopener noreferrer"/);
    expect(Number(/--parent-button:\s*(\d+)px/.exec(css)?.[1])).toBe(PARENT.buttonSize);
    expect(PARENT.buttonSize).toBeGreaterThanOrEqual(44);
  });

  it("4. ポリシーのページ：日本語と英語、CSP、外から読み込まない、書くべきこと", () => {
    expect(privacy).toMatch(/<html lang="ja">/);
    expect(privacy).toMatch(/lang="en"/);
    expect(privacy).toMatch(/http-equiv="Content-Security-Policy"/);
    expect(privacy).toMatch(/default-src 'none'/);
    // 読み込むもの（src・stylesheet）は同じサイトだけ。外へのリンク（a href）は読み込みではないのでよい
    expect(privacy).not.toMatch(/\ssrc="https?:/);
    expect(privacy).not.toMatch(/<link[^>]+href="https?:/);
    expect(privacy).not.toMatch(/\sstyle="/);
    for (const word of ["集めません", "送りません", "広告", "nori-adventure.quality", "IP アドレス"]) {
      expect(privacy).toContain(word);
    }
    for (const word of ["does not collect", "IP address", "nori-adventure.quality"]) {
      expect(privacy).toContain(word);
    }
    expect(privacy).toContain(
      "https://docs.github.com/en/pages/getting-started-with-github-pages/about-github-pages",
    );
  });
});

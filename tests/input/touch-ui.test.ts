import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { INPUT } from "../../src/config/index.ts";

// タッチの操作の見た目（index.html・src/style.css）が、決まり（INPUT・子ども向け UI）に合っているか。
const root = path.resolve(import.meta.dirname, "../..");
const css = readFileSync(path.join(root, "src/style.css"), "utf8");
const html = readFileSync(path.join(root, "index.html"), "utf8");
const touchHtml = /<div id="touch"[\s\S]*?\n {4}<\/div>\n/.exec(html)?.[0] ?? "";

const cssPx = (name: string) => Number(new RegExp(String.raw`${name}:\s*(\d+)px`).exec(css)?.[1]);

describe("タッチの操作の見た目", () => {
  it("ボタンの大きさとハンドルの距離が INPUT と同じ。ボタンは 64 px 以上", () => {
    expect(cssPx("--touch-button")).toBe(INPUT.touchButtonSize);
    expect(cssPx("--touch-go-button")).toBe(INPUT.touchGoButtonSize);
    expect(INPUT.touchGoButtonSize).toBeGreaterThan(INPUT.touchButtonSize);
    expect(cssPx("--touch-steer-range")).toBe(INPUT.touchSteerRange);
    expect(INPUT.touchButtonSize).toBeGreaterThanOrEqual(64);
  });

  it("画面に出る文字がない（読み上げ用の aria-label だけ）", () => {
    expect(touchHtml).not.toBe("");
    const visibleText = touchHtml
      .replace(/<[^>]+>/g, "")
      .replace(/\s+/g, "")
      .trim();
    expect(visibleText).toBe("");
    expect(touchHtml).toMatch(/aria-label="すすむ"/);
    expect(touchHtml).toMatch(/aria-label="さがる"/);
  });

  it("長押しのメニュー・虫めがねを出さない（-webkit-touch-callout: none）", () => {
    expect(css).toMatch(/-webkit-touch-callout:\s*none/);
  });

  it("style 属性を使わない（CSP の style-src に 'unsafe-inline' を入れないため）", () => {
    expect(html).not.toMatch(/\sstyle="/);
  });
});

describe("スマホの縦向き（「横にする」絵）", () => {
  it("絵は文字なしで、縦向き・幅 700 px 以下・タッチのときだけ出す", () => {
    const rotate = /<div id="rotate"[\s\S]*?<\/div>/.exec(html)?.[0] ?? "";
    expect(rotate).not.toBe("");
    expect(rotate.replace(/<[^>]+>/g, "").trim()).toBe("");
    expect(css).toMatch(
      /@media \(orientation: portrait\) and \(max-width: 700px\) and \(any-pointer: coarse\)/,
    );
  });
});

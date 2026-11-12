import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { INPUT } from "../../src/config/index.ts";
import { touchLayoutFor, UP_DOWN_BUTTONS } from "../../src/input/touch.ts";

// タッチの操作の見た目（index.html・src/style.css）が、決まり（INPUT・子ども向け UI）に合っているか。
const root = path.resolve(import.meta.dirname, "../..");
const css = readFileSync(path.join(root, "src/style.css"), "utf8");
const html = readFileSync(path.join(root, "index.html"), "utf8");
const touchHtml = /<div id="touch"[\s\S]*?\n {4}<\/div>\n/.exec(html)?.[0] ?? "";

// タグとタグの間にある文字（画面に出る文字）を集める。タグを取り除く書き方はしない
// （CodeQL の js/incomplete-multi-character-sanitization に当たるため）
const textBetweenTags = (fragment: string) =>
  [...fragment.matchAll(/>([^<]*)</g)].map((m) => (m[1] ?? "").trim()).filter((s) => s !== "");

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
    expect(textBetweenTags(touchHtml)).toEqual([]);
    expect(touchHtml).toMatch(/aria-label="すすむ"/);
    expect(touchHtml).toMatch(/aria-label="さがる"/);
  });

  // docs/game-rules.md「入力」の「上下のボタン（ステージ3・4）」（NORI-62）
  it("上下のボタンは、ステージ3・4だけ。ステージ1・2・5は ▶ ◀ のまま", () => {
    expect([1, 2, 3, 4, 5].map(touchLayoutFor)).toEqual(["drive", "drive", "updown", "updown", "drive"]);
  });

  it("上下のボタンの読み上げは「うえ」「した」。絵は上向き・下向きの三角", () => {
    expect(UP_DOWN_BUTTONS.up.label).toBe("うえ");
    expect(UP_DOWN_BUTTONS.down.label).toBe("した");
    // 三角の頂点（y がいちばん小さい点・大きい点）が真ん中（x=50）にある → 上向き・下向き
    const tip = (d: string, pick: (a: number, b: number) => number) => {
      const pts = [...d.matchAll(/(\d+) (\d+)/g)].map((m) => ({ x: Number(m[1]), y: Number(m[2]) }));
      return pts.reduce((a, b) => (pick(a.y, b.y) === a.y ? a : b));
    };
    expect(tip(UP_DOWN_BUTTONS.up.path, Math.min).x).toBe(50);
    expect(tip(UP_DOWN_BUTTONS.down.path, Math.max).x).toBe(50);
  });

  it("上下のボタンは2つとも --touch-button（96 px）で、右にそろえる", () => {
    const block =
      /\.touch-updown \.touch-go,\s*\.touch-updown \.touch-back\s*\{([^}]*)\}/.exec(css)?.[1] ?? "";
    expect(block).toMatch(/width:\s*var\(--touch-button\)/);
    expect(block).toMatch(/height:\s*var\(--touch-button\)/);
    expect(block).toMatch(/right:/);
    // ▲ は ▼ の上に、ほかのボタンと同じすき間（--touch-gap）をあける
    expect(css).toMatch(
      /\.touch-updown \.touch-go\s*\{[^}]*bottom:\s*calc\(var\(--touch-gap\) \* 2 \+ var\(--touch-button\)/,
    );
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
    expect(textBetweenTags(rotate)).toEqual([]);
    expect(css).toMatch(
      /@media \(orientation: portrait\) and \(max-width: 700px\) and \(any-pointer: coarse\)/,
    );
  });
});

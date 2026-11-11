import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { LOOK } from "../../src/config/index.ts";

// 画質のボタンの見た目（index.html・src/style.css）が、docs/game-rules.md「画質を選ぶ」（NORI-58）に合っているか
const root = path.resolve(import.meta.dirname, "../..");
const css = readFileSync(path.join(root, "src/style.css"), "utf8");
const html = readFileSync(path.join(root, "index.html"), "utf8");
const buttonHtml = /<button\s+id="quality"[\s\S]*?<\/button>/.exec(html)?.[0] ?? "";
const textBetweenTags = (fragment: string) =>
  [...fragment.matchAll(/>([^<]*)</g)].map((m) => (m[1] ?? "").trim()).filter((s) => s !== "");

describe("画質のボタン", () => {
  it("大きさが LOOK.qualityButtonSize と同じで、64 px 以上", () => {
    expect(Number(/--quality-button:\s*(\d+)px/.exec(css)?.[1])).toBe(LOOK.qualityButtonSize);
    expect(LOOK.qualityButtonSize).toBeGreaterThanOrEqual(64);
  });

  it("画面に出る文字がない（絵と、読み上げ用の aria-label だけ）。高・低の絵と、自動の印がある", () => {
    expect(buttonHtml).not.toBe("");
    expect(textBetweenTags(buttonHtml)).toEqual([]);
    expect(buttonHtml).toMatch(/aria-label="/);
    expect(buttonHtml).toMatch(/class="quality-high"/);
    expect(buttonHtml).toMatch(/class="quality-low"/);
    expect(buttonHtml).toMatch(/class="quality-auto"/); // 自動の印（回る矢印）
  });
});

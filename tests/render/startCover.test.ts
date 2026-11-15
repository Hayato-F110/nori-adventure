import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { START } from "../../src/config";

// NORI-76 一覧 6（docs/test-plans/NORI-76.md）：覆いの絵・丸の直径・間・1 周・動きを減らす設定・消え方（docs/game-rules.md）
const root = path.resolve(import.meta.dirname, "../..");
const html = readFileSync(path.join(root, "index.html"), "utf8");
const css = readFileSync(path.join(root, "src/style.css"), "utf8");

/** CSS から、セレクタがちょうどそれの規則の中身（{ } の間）を返す。@media の中は inMedia で選ぶ */
const block = (selector: string, source = css): string => {
  const re = new RegExp(`(?:^|\\n)\\s*${selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\{([^}]*)\\}`);
  const m = source.match(re);
  if (m === null) throw new Error(`src/style.css に「${selector}」の規則がない`);
  return m[1] ?? "";
};
const prop = (body: string, name: string): string => {
  const m = body.match(new RegExp(`(?:^|;|\\s)${name}\\s*:\\s*([^;]+);`));
  if (m === null) throw new Error(`「${name}」がない：${body}`);
  return (m[1] ?? "").trim();
};
const seconds = (v: string): number => {
  const m = v.match(/([\d.]+)(ms|s)\b/);
  if (m === null) throw new Error(`秒が読めない：${v}`);
  return Number(m[1]) / (m[2] === "ms" ? 1000 : 1);
};
/** prefers-reduced-motion: reduce の @media の中身を、すべてつないで返す（CSS に何か所かある） */
const reducedMotion = (): string => {
  const parts: string[] = [];
  const mark = "@media (prefers-reduced-motion: reduce)";
  for (let start = css.indexOf(mark); start >= 0; start = css.indexOf(mark, start + 1)) {
    let depth = 0;
    for (let i = css.indexOf("{", start); i < css.length; i++) {
      if (css[i] === "{") depth++;
      if (css[i] === "}" && --depth === 0) {
        parts.push(css.slice(css.indexOf("{", start) + 1, i));
        break;
      }
    }
  }
  if (parts.length === 0) throw new Error("prefers-reduced-motion の指定がない");
  return parts.join("\n");
};

describe("NORI-76 一覧 6：覆いの部品と見た目の値", () => {
  it("index.html に #start-cover（role=img、読み上げ「よみこみちゅう」、丸 3 つ、文字なし）", () => {
    const m = html.match(/<div[^>]*id="start-cover"[^>]*>([\s\S]*?)<\/div>\s*<!-- \/start-cover -->/);
    expect(m, "#start-cover と、終わりの印 <!-- /start-cover --> が要る").not.toBeNull();
    const open = html.match(/<div[^>]*id="start-cover"[^>]*>/)?.[0] ?? "";
    expect(open).toContain('role="img"');
    expect(open).toContain('aria-label="よみこみちゅう"');
    const inner = m?.[1] ?? "";
    expect(inner.match(/class="start-cover-dot"/g)).toHaveLength(3);
    expect(inner.replace(/<[^>]+>/g, "").trim()).toBe("");
  });

  it("丸の直径・間が START と同じ", () => {
    const dot = block(".start-cover-dot");
    expect(prop(dot, "width")).toBe(`${START.dotSize}px`);
    expect(prop(dot, "height")).toBe(`${START.dotSize}px`);
    expect(prop(block(".start-cover"), "gap")).toBe(`${START.dotGap}px`);
  });

  it("1 周の秒が START.dotCycleSeconds。3 つの丸の遅れが 0・1/3・2/3 周", () => {
    expect(seconds(prop(block(".start-cover-dot"), "animation"))).toBeCloseTo(START.dotCycleSeconds, 9);
    const delay = (n: number) => {
      try {
        return seconds(prop(block(`.start-cover-dot:nth-child(${n})`), "animation-delay"));
      } catch {
        return 0;
      }
    };
    expect(delay(1)).toBeCloseTo(0, 9);
    expect(delay(2)).toBeCloseTo(START.dotCycleSeconds / 3, 9);
    expect(delay(3)).toBeCloseTo((START.dotCycleSeconds * 2) / 3, 9);
  });

  it("薄くなる秒が START.fadeSeconds", () => {
    expect(seconds(prop(block(".start-cover"), "transition"))).toBeCloseTo(START.fadeSeconds, 9);
  });

  it("背景のグラデーションの指定が .title と同じ", () => {
    expect(prop(block(".start-cover"), "background")).toBe(prop(block(".title"), "background"));
  });

  it("動きを減らす設定では、丸の動きと薄くなる動きを止める", () => {
    const rm = reducedMotion();
    expect(prop(block(".start-cover-dot", rm), "animation")).toBe("none");
    expect(prop(block(".start-cover", rm), "transition")).toBe("none");
  });
});

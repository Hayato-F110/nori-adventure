// NORI-73（一覧 5・6）：e2e/sound.spec.ts の書き方の検査。実際の時間に頼る待ち方に戻ったら落とす。
// tests/e2e/common.test.ts と同じく、ファイルの文字を読む。切り出しに失敗して何も見ないまま通らないよう、
// ファイル全体を見る（R6-73-7）。コメントの中の言葉でだまされないよう、コメントを除いてから見る（/code-review の指摘）
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/** 行のコメント（// …）と囲みのコメント（/* … *\/）を除く。文字列の中の // は、この検査では使っていない */
export const stripComments = (s: string): string =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

const src = stripComments(readFileSync(new URL("../../e2e/sound.spec.ts", import.meta.url), "utf8"));

describe("sound.spec.ts は実際の時間に頼らない（CLAUDE.md「E2E は2種類に分ける」）", () => {
  it("決め打ちの待ちを使わない（waitForTimeout・setTimeout・キーの delay。消音は下がりしだい進む。一覧 6）", () => {
    expect(src).not.toContain("waitForTimeout");
    // test.setTimeout（テスト全体の上限）は待ちではないので除き、そのままの setTimeout( だけを見る
    expect(src).not.toMatch(/(^|[^.\w])setTimeout\(/m);
    expect(src).not.toMatch(/delay\s*:/);
  });

  it("キーを押し続けて走らない（keyboard.down を使わない。一覧 5）", () => {
    expect(src).not.toContain("keyboard.down");
  });

  it("運転役の呼び出しに早送りを渡し、早送りは 1 コマ 2 刻み以上", () => {
    expect(src).toMatch(/installCarDriver\(page, \{[^}]*stepsPerFrame: FAST[^}]*\}\)/);
    const fast = /const FAST = (\d+);/.exec(src);
    expect(fast).not.toBeNull();
    expect(Number(fast?.[1])).toBeGreaterThanOrEqual(2);
  });
});

describe("stripComments（この検査の部品）", () => {
  it("コメントの中の言葉は残さず、コードは残す", () => {
    const s = stripComments('a(); // keyboard.down を使わない\n/* waitForTimeout */ b("https://x");');
    expect(s).not.toContain("keyboard.down");
    expect(s).not.toContain("waitForTimeout");
    expect(s).toContain("a();");
    expect(s).toContain('b("https://x");');
  });

  it("待ちの setTimeout( は見つけ、test.setTimeout( は見つけない", () => {
    const wait = /(^|[^.\w])setTimeout\(/m;
    expect("await new Promise((r) => setTimeout(r, 500));").toMatch(wait);
    expect("test.setTimeout(240_000);").not.toMatch(wait);
  });
});

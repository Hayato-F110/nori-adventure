// NORI-73（一覧 5・6）：e2e/sound.spec.ts の書き方の検査。実際の時間に頼る待ち方に戻ったら落とす。
// tests/e2e/common.test.ts と同じく、ファイルの文字を読む。切り出しに失敗して何も見ないまま通らないよう、
// ファイル全体を見る（R6-73-7）
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const src = readFileSync(new URL("../../e2e/sound.spec.ts", import.meta.url), "utf8");

describe("sound.spec.ts は実際の時間に頼らない（CLAUDE.md「E2E は2種類に分ける」）", () => {
  it("決め打ちの待ち waitForTimeout を使わない（消音は下がりしだい進む。一覧 6）", () => {
    expect(src).not.toContain("waitForTimeout");
  });

  it("キーを押し続けて走らない（keyboard.down を使わない。一覧 5）", () => {
    expect(src).not.toContain("keyboard.down");
  });

  it("運転役（installCarDriver）と早送り（stepsPerFrame）で進める", () => {
    expect(src).toContain("installCarDriver(");
    expect(src).toContain("stepsPerFrame");
  });
});

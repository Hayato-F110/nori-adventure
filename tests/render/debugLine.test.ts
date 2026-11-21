// NORI-34（docs/test-plans/NORI-34.md の一覧 1・2）：上の表示（debug）の最小の FPS と文
import { describe, expect, it } from "vitest";
import { PERF } from "../../src/config";
import { debugFpsLine, fpsMinAfterSkip } from "../../src/render/debugLine";

const skip = PERF.skipSeconds;
/** 始めの skip 個（除く値）。どれも、あとの値より小さい */
const warmup = Array.from({ length: skip }, () => 5);

describe("1. 最小の FPS（始めの PERF.skipSeconds 個を除く）", () => {
  it("0 個・ちょうど skipSeconds 個では null", () => {
    expect(fpsMinAfterSkip([])).toBeNull();
    expect(fpsMinAfterSkip(warmup)).toBeNull();
  });

  it("skipSeconds + 1 個なら、その 1 個が最小（除く始めの値がもっと小さくても数えない）", () => {
    expect(fpsMinAfterSkip([...warmup, 47.3])).toBe(47.3);
  });

  it("除いたあとの値の中で、最小が最初・途中・最後のどこにあっても見つける", () => {
    expect(fpsMinAfterSkip([...warmup, 31.2, 45, 50])).toBe(31.2);
    expect(fpsMinAfterSkip([...warmup, 45, 31.2, 50])).toBe(31.2);
    expect(fpsMinAfterSkip([...warmup, 45, 50, 31.2])).toBe(31.2);
  });

  it("値がとても多くても（1 秒に 1 個で約 140 時間分の 50 万個）、例外を出さずに最小を返す（/code-review の指摘）", () => {
    const many = Array.from({ length: 500_000 }, (_, i) => 40 + (i % 7));
    many[123_456] = 33.3;
    expect(fpsMinAfterSkip([...warmup, ...many])).toBe(33.3);
  });
});

describe("2. 上の表示の文", () => {
  it("「今の FPS fps · 最小 N · 画質」の順。画質は高なら「高」、低なら「低」", () => {
    expect(debugFpsLine(45, [...warmup, 32], "low")).toBe("45 fps · 最小 32 · 低");
    expect(debugFpsLine(58, [...warmup, 55], "high")).toBe("58 fps · 最小 55 · 高");
  });

  it("最小がないときは「—」", () => {
    expect(debugFpsLine(40, warmup, "high")).toBe("40 fps · 最小 — · 高");
    expect(debugFpsLine(40, [], "low")).toBe("40 fps · 最小 — · 低");
  });

  it("今の FPS は四捨五入（44.6 →「45」、44.4 →「44」）", () => {
    expect(debugFpsLine(44.6, [], "high")).toMatch(/^45 fps · /);
    expect(debugFpsLine(44.4, [], "high")).toMatch(/^44 fps · /);
  });

  it("最小は切り捨て（29.9 →「29」、30.0 →「30」）。届かない値が「30」に見えない（R1-34-A）", () => {
    expect(debugFpsLine(40, [...warmup, 29.9], "high")).toBe("40 fps · 最小 29 · 高");
    expect(debugFpsLine(40, [...warmup, 30], "high")).toBe("40 fps · 最小 30 · 高");
  });
});

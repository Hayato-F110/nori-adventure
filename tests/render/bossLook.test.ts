import { describe, expect, it } from "vitest";
import { BOSS, SIM } from "../../src/config";
import { bossColor, bossMouth, bossPuff } from "../../src/render/bossLook";

// docs/game-rules.md「ボスの見た目とエンディング」（NORI-29）。テストの一覧の 21
describe("ボスの見た目", () => {
  it("色は回数 0 で怒っている色、5 で落ち着いた色", () => {
    expect(bossColor(0).toLowerCase()).toBe(BOSS.angryColor.toLowerCase());
    expect(bossColor(BOSS.calmPoints).toLowerCase()).toBe(BOSS.calmColor.toLowerCase());
  });

  it("その間は 5 段で混ぜる（回数が増えるほど、落ち着いた色に近づく）", () => {
    const blue = (c: string) => Number.parseInt(c.slice(5, 7), 16);
    const steps = Array.from({ length: BOSS.calmPoints + 1 }, (_, i) => blue(bossColor(i)));
    for (let i = 1; i < steps.length; i++) expect(steps[i]).toBeGreaterThan(steps[i - 1] ?? 0);
    expect(new Set(steps.map(String)).size).toBe(BOSS.calmPoints + 1);
  });

  // NORI-70（初見レビュー 29-47・R2-29-41）：間の色の値そのもの。ルールの値（#E8604C → #7FD1FF を 5 段、sRGB の値で四捨五入）から手で計算した
  // 例：1 段目の赤 232 + (127 − 232) × 0.2 = 211 → d3
  it.each([
    [1, "#d37770"],
    [2, "#be8d94"],
    [3, "#a9a4b7"],
    [4, "#94badb"],
  ])("回数 %d の色は %s", (calm, color) => {
    expect(bossColor(calm).toLowerCase()).toBe(color);
  });

  it("口は 0〜2 がへの字、3〜4 がまっすぐ、5 が笑顔", () => {
    expect([0, 1, 2, 3, 4, 5].map(bossMouth)).toEqual(["frown", "frown", "frown", "flat", "flat", "smile"]);
  });

  it("岩を転がす 1 秒前からふくらみ、転がした刻みで戻る", () => {
    const interval = Math.round(BOSS.rockInterval / SIM.fixedDt);
    const warn = Math.round(BOSS.rockWarnSeconds / SIM.fixedDt);
    expect(bossPuff(interval - warn - 1, SIM.fixedDt)).toBe(0);
    expect(bossPuff(interval - warn / 2, SIM.fixedDt)).toBeCloseTo(0.5, 9);
    expect(bossPuff(interval - 1, SIM.fixedDt)).toBeGreaterThan(0.9);
    expect(bossPuff(interval, SIM.fixedDt)).toBe(0);
  });

  // NORI-70（初見レビュー R2-29-35）：2回目以降も同じ前ぶれ。落ち着いたあとは、ふくらまない
  it.each([2, 3])("%d 回目の岩の前も、1 秒前からふくらみ、転がした刻みで戻る", (k) => {
    const interval = Math.round(BOSS.rockInterval / SIM.fixedDt);
    const warn = Math.round(BOSS.rockWarnSeconds / SIM.fixedDt);
    const launch = k * interval;
    expect(bossPuff(launch - warn - 1, SIM.fixedDt)).toBe(0);
    expect(bossPuff(launch - warn / 2, SIM.fixedDt)).toBeCloseTo(0.5, 9);
    expect(bossPuff(launch, SIM.fixedDt)).toBe(0);
  });

  it("落ち着いたあとは、岩を転がす時刻の前でもふくらまない", () => {
    const interval = Math.round(BOSS.rockInterval / SIM.fixedDt);
    const warn = Math.round(BOSS.rockWarnSeconds / SIM.fixedDt);
    expect(bossPuff(2 * interval - warn / 2, SIM.fixedDt, false)).toBeGreaterThan(0);
    expect(bossPuff(2 * interval - warn / 2, SIM.fixedDt, true)).toBe(0);
  });
});

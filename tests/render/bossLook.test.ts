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
});

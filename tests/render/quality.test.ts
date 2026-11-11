import { describe, expect, it } from "vitest";
import { LOOK } from "../../src/config";
import { createQualityGovernor } from "../../src/render/quality";

// docs/game-rules.md「見た目」：低画質に下げる FPS・時間、上げ直さない（NORI-56）
describe("画質の自動切り替え", () => {
  it(`${LOOK.lowFps} fps 未満が ${LOOK.lowFpsSeconds} 秒続いたら低画質`, () => {
    const g = createQualityGovernor(LOOK);
    for (let i = 0; i < LOOK.lowFpsSeconds - 1; i++) expect(g.push(LOOK.lowFps - 1)).toBe("high");
    expect(g.push(LOOK.lowFps - 1)).toBe("low");
  });

  it("途中で一度でも戻れば数え直す（読み込み直後の一瞬の落ち込みでは下げない）", () => {
    const g = createQualityGovernor(LOOK);
    for (let i = 0; i < LOOK.lowFpsSeconds - 1; i++) g.push(10);
    g.push(LOOK.lowFps);
    for (let i = 0; i < LOOK.lowFpsSeconds - 1; i++) expect(g.push(10)).toBe("high");
  });

  it("一度下げたら、速くなっても上げ直さない（ちらつかない）", () => {
    const g = createQualityGovernor(LOOK);
    for (let i = 0; i < LOOK.lowFpsSeconds; i++) g.push(5);
    for (let i = 0; i < 10; i++) expect(g.push(120)).toBe("low");
    expect(g.quality).toBe("low");
  });
});

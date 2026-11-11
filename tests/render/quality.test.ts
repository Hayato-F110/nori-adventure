import { describe, expect, it } from "vitest";
import { LOOK } from "../../src/config";
import {
  createQualityGovernor,
  loadQualityChoice,
  QUALITY_STORAGE_KEY,
  saveQualityChoice,
} from "../../src/render/quality";

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

// docs/game-rules.md「画質を選ぶ」（NORI-58）
describe("画質を選ぶ", () => {
  const slow = (g: ReturnType<typeof createQualityGovernor>) => {
    for (let i = 0; i < LOOK.lowFpsSeconds + 2; i++) g.push(LOOK.lowFps - 1);
  };

  it("最初は高（自動）", () => {
    const g = createQualityGovernor(LOOK);
    expect(g.quality).toBe("high");
    expect(g.choice).toBe("auto");
  });

  it("ボタンで「高」を選んだら、遅くても自動では下げない", () => {
    const g = createQualityGovernor(LOOK);
    expect(g.select("high")).toBe("high");
    slow(g);
    expect(g.quality).toBe("high");
  });

  it("ボタンで「低」を選んだら低。そのあと「高」を選べば高へ戻る", () => {
    const g = createQualityGovernor(LOOK);
    expect(g.select("low")).toBe("low");
    expect(g.select("high")).toBe("high");
    expect(g.choice).toBe("high");
  });

  it("自動で低になったあとでも、ボタンで「高」を選べば高へ戻り、もう自動では下げない", () => {
    const g = createQualityGovernor(LOOK);
    slow(g);
    expect(g.quality).toBe("low");
    g.select("high");
    slow(g);
    expect(g.quality).toBe("high");
  });

  it("前に選んだ画質から始められる", () => {
    expect(createQualityGovernor(LOOK, "low").quality).toBe("low");
    const g = createQualityGovernor(LOOK, "high");
    slow(g);
    expect(g.quality).toBe("high");
  });
});

describe("選んだ画質を覚える（端末の中だけ）", () => {
  const memory = () => {
    const data = new Map<string, string>();
    return {
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => void data.set(k, v),
    };
  };

  it("覚えた画質を読み出せる", () => {
    const s = memory();
    saveQualityChoice(s, "low");
    expect(loadQualityChoice(s)).toBe("low");
    saveQualityChoice(s, "high");
    expect(loadQualityChoice(s)).toBe("high");
  });

  it("何も覚えていない・知らない値なら自動", () => {
    const s = memory();
    expect(loadQualityChoice(s)).toBe("auto");
    s.setItem(QUALITY_STORAGE_KEY, "ultra");
    expect(loadQualityChoice(s)).toBe("auto");
  });

  it("覚えられない（使えない・例外を投げる）ときは自動で、止まらない", () => {
    const broken = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    };
    expect(loadQualityChoice(broken)).toBe("auto");
    expect(() => saveQualityChoice(broken, "low")).not.toThrow();
    expect(loadQualityChoice(null)).toBe("auto");
    expect(() => saveQualityChoice(null, "low")).not.toThrow();
  });
});

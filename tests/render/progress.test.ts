import { describe, expect, it } from "vitest";
import { CLEARED_STORAGE_KEY, loadCleared, saveCleared } from "../../src/render/progress.ts";

// docs/game-rules.md「タイトル画面・ステージ選び・クリアの演出」の「クリアの印」（NORI-30）。テストの一覧の 3
const memory = (initial?: string) => {
  const data = new Map<string, string>();
  if (initial !== undefined) data.set(CLEARED_STORAGE_KEY, initial);
  return {
    data,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
  };
};

describe("クリアしたステージを覚える", () => {
  it("名前は nori-adventure.cleared（画質と同じ形）", () => {
    expect(CLEARED_STORAGE_KEY).toBe("nori-adventure.cleared");
  });

  it("何もない・壊れた値・知らない番号は「なし」として読む", () => {
    expect(loadCleared(memory())).toEqual([]);
    expect(loadCleared(memory("{oops"))).toEqual([]);
    expect(loadCleared(memory('"3"'))).toEqual([]);
    expect(loadCleared(memory('[0, 5, 9, 2.5, "1", 3]'))).toEqual([3]);
    expect(loadCleared(null)).toEqual([]);
  });

  it("足すと番号の小さい順に並び、同じ番号は2回入らない", () => {
    const s = memory();
    saveCleared(s, 3);
    saveCleared(s, 1);
    saveCleared(s, 3);
    expect(s.data.get(CLEARED_STORAGE_KEY)).toBe("[1,3]");
    expect(loadCleared(s)).toEqual([1, 3]);
  });

  it("保存場所が使えない（プライベートブラウズなど）ときも止まらない", () => {
    const broken = {
      getItem: () => {
        throw new Error("denied");
      },
      setItem: () => {
        throw new Error("denied");
      },
    };
    expect(loadCleared(broken)).toEqual([]);
    expect(() => saveCleared(broken, 2)).not.toThrow();
    expect(() => saveCleared(null, 2)).not.toThrow();
  });
});

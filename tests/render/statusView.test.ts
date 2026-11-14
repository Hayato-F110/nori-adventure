// 上の表示（ステージ5では、旗の代わりに、なかよしのメーター 5 つの丸。docs/game-rules.md のステージ5「上の表示」）。
// NORI-70（初見レビュー R1-70-11）：E2E は回数 0 と 5 だけを見るので、届けた回数 0〜5 で、色の付く丸の数が1つずつ増えることを
// ここで確かめる。単体テストには画面の部品（DOM）がないので、使う所（textContent・classList・hidden）だけの作り物を渡す
import { describe, expect, it } from "vitest";
import { BOSS, SIM } from "../../src/config";
import { createStatusView, type StatusElements } from "../../src/render/statusView";

const fakeFlag = () => {
  const classes = new Set<string>();
  return {
    classes,
    classList: { toggle: (name: string, on: boolean) => (on ? classes.add(name) : classes.delete(name)) },
  };
};

describe("なかよしのメーター（上の表示）", () => {
  it.each([0, 1, 2, 3, 4, 5])("届けた回数 %i なら、色の付いた丸は左からその数だけ", (calm) => {
    const flags = Array.from({ length: BOSS.calmPoints }, fakeFlag);
    const el = { textContent: "" };
    const view = createStatusView(
      {
        starCount: { ...el },
        time: { ...el },
        goal: { hidden: true },
        flags,
      } as unknown as StatusElements,
      SIM.fixedDt,
    );
    view.update(600, { stars: [true, false], nextCheckpoint: calm, finishTick: null });
    expect(flags.map((f) => f.classes.has("passed"))).toEqual(
      Array.from({ length: BOSS.calmPoints }, (_, i) => i < calm),
    );
  });
});

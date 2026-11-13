import { describe, expect, it } from "vitest";
import { BOSS, CLEAR, TITLE } from "../../src/config/index.ts";
import { confettiLayout, createClearFlow, isEnding } from "../../src/render/clearFlow.ts";

// docs/game-rules.md「タイトル画面・ステージ選び・クリアの演出」（NORI-30）。テストの一覧の 6・7
describe("紙ふぶきの並び", () => {
  const pieces = confettiLayout(CLEAR.confettiPieces);

  it("枚数は CLEAR.confettiPieces", () => {
    expect(pieces).toHaveLength(CLEAR.confettiPieces);
  });

  it("横の位置は画面の幅を等分した真ん中（0〜100 % の中）。遅れは紙ふぶきの時間の中", () => {
    pieces.forEach((p, i) => {
      expect(p.leftPercent).toBeCloseTo(((i + 0.5) / CLEAR.confettiPieces) * 100, 9);
      expect(p.leftPercent).toBeGreaterThan(0);
      expect(p.leftPercent).toBeLessThan(100);
      expect(p.delaySeconds).toBeGreaterThanOrEqual(0);
      expect(p.delaySeconds + p.fallSeconds).toBeLessThanOrEqual(CLEAR.confettiSeconds + 1e-9);
      expect(p.fallSeconds).toBeGreaterThan(0);
    });
  });

  it("乱数を使わない：毎回同じ並び", () => {
    expect(confettiLayout(CLEAR.confettiPieces)).toEqual(pieces);
  });
});

const setup = (reducedMotion = false) => {
  const log: string[] = [];
  const flow = createClearFlow({
    stage: 2,
    reducedMotion: () => reducedMotion,
    record: (stage) => log.push(`record:${stage}`),
    showConfetti: () => log.push("confetti"),
    showButtons: () => log.push("buttons"),
  });
  return { log, flow };
};

describe("クリアの流れ", () => {
  it("ゴールの前は何もしない", () => {
    const { log, flow } = setup();
    flow.update(false, 0);
    flow.update(false, 100);
    expect(log).toEqual([]);
  });

  it("最初のゴールで1回だけ記録し、紙ふぶきを出す。ボタンは 3 秒たってから", () => {
    const { log, flow } = setup();
    flow.update(true, 10);
    flow.update(true, 10 + CLEAR.buttonsDelaySeconds - 0.01);
    expect(log).toEqual(["record:2", "confetti"]);
    flow.update(true, 10 + CLEAR.buttonsDelaySeconds);
    flow.update(true, 20);
    expect(log).toEqual(["record:2", "confetti", "buttons"]);
    expect(flow.buttonsShown).toBe(true);
  });

  it("動きを減らす設定では紙ふぶきを出さない。ボタンが出るまでの時間は同じ", () => {
    const { log, flow } = setup(true);
    flow.update(true, 0);
    flow.update(true, CLEAR.buttonsDelaySeconds - 0.01);
    expect(log).toEqual(["record:2"]);
    flow.update(true, CLEAR.buttonsDelaySeconds);
    expect(log).toEqual(["record:2", "buttons"]);
  });
});

// NORI-29：最後のステージ（5）のクリアはエンディング。docs/game-rules.md「ボスの見た目とエンディング」
describe("エンディング", () => {
  it("エンディングは選べる最後のステージ（5）だけ", () => {
    expect(TITLE.stages.map(isEnding)).toEqual([false, false, false, false, true]);
  });

  it("エンディングの絵が出るまで（ボスが笑ってはねる間）は、ボタンが出るまでと同じ 3 秒", () => {
    expect(BOSS.endingDelaySeconds).toBe(CLEAR.buttonsDelaySeconds);
  });
});

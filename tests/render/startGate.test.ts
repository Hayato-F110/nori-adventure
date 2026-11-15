import { afterEach, describe, expect, it, vi } from "vitest";
import { START } from "../../src/config";
import { createStartGate } from "../../src/render/startGate";

// NORI-76 一覧 1（docs/test-plans/NORI-76.md）：ステージの覆い・覆いの上限・覆いの消え方（docs/game-rules.md）。
// 時計は外から渡す（ミリ秒。performance.now と同じく、ページを開いた時が 0）
const clock = (start = 0) => {
  let t = start;
  return {
    now: () => t,
    at(ms: number) {
      t = ms;
    },
  };
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("NORI-76 一覧 1：覆いの決まり", () => {
  it("素材が決まるまで（loading の間）は覆い、ゲームを進めない", () => {
    const c = clock();
    const gate = createStartGate({ now: c.now });
    for (const ms of [0, 5000, 9990]) {
      c.at(ms);
      const r = gate.update("loading");
      expect(r.state).toBe("covered");
      expect(r.canStep).toBe(false);
    }
  });

  it.each(["textured", "plain"] as const)("%s になった時刻に外し始め、その呼び出しから進めてよい", (look) => {
    const c = clock();
    const gate = createStartGate({ now: c.now });
    c.at(1000);
    expect(gate.update("loading").canStep).toBe(false);
    c.at(3000);
    const r = gate.update(look);
    expect(r).toMatchObject({ state: "fading", canStep: true, startedNow: true });
    c.at(3100);
    expect(gate.update(look)).toMatchObject({ state: "fading", canStep: true, startedNow: false });
  });

  it("loading のまま、上限 10 秒ちょうどで外し始める（9.99 秒では覆う）", () => {
    const c = clock();
    const gate = createStartGate({ now: c.now });
    c.at(9990);
    expect(gate.update("loading").state).toBe("covered");
    c.at(10_000);
    expect(gate.update("loading")).toMatchObject({ state: "fading", canStep: true, startedNow: true });
  });

  it("数え始めはページを開いた時（時計の 0）。3 秒の時刻に作っても 10 秒で外す（13 秒ではない）", () => {
    const c = clock(3000);
    const gate = createStartGate({ now: c.now });
    c.at(9999);
    expect(gate.update("loading").state).toBe("covered");
    c.at(10_000);
    expect(gate.update("loading").state).toBe("fading");
  });

  it("外し始めたあとに loading に戻っても（ボタンで低 → 高）覆わない", () => {
    const c = clock();
    const gate = createStartGate({ now: c.now });
    c.at(2000);
    gate.update("plain");
    c.at(2500);
    expect(gate.update("loading")).toMatchObject({ canStep: true });
    expect(gate.state).not.toBe("covered");
  });

  it("外し始めてから 0.3 秒（START.fadeSeconds）で gone", () => {
    const c = clock();
    const gate = createStartGate({ now: c.now });
    c.at(1000);
    gate.update("textured");
    c.at(1000 + START.fadeSeconds * 1000 - 1);
    expect(gate.update("textured").state).toBe("fading");
    c.at(1000 + START.fadeSeconds * 1000);
    expect(gate.update("textured").state).toBe("gone");
  });

  it("動きを減らす設定では、外すとすぐ gone", () => {
    const c = clock();
    const gate = createStartGate({ now: c.now, reducedMotion: true });
    c.at(1000);
    expect(gate.update("textured")).toMatchObject({ state: "gone", canStep: true, startedNow: true });
  });

  it("時計を渡さないときは performance.now を使う", () => {
    const spy = vi.spyOn(performance, "now").mockReturnValue(0);
    const gate = createStartGate({});
    gate.update("loading");
    expect(spy).toHaveBeenCalled();
  });

  it("上限を渡さないときは START.maxWaitSeconds（10）を使う", () => {
    const gate = createStartGate({ now: () => 0 });
    expect(gate.maxWaitSeconds).toBe(START.maxWaitSeconds);
    expect(START.maxWaitSeconds).toBe(10);
  });
});

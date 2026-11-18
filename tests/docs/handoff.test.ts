// 2026-11-18 スプリント3のふりかえり I3：引き継ぎ（docs/handoff.md）は今の状態だけにする。
// 前の状態の節を残すと、古い状態を今のものと取り違えて伝える（11/18 に「ホーム画面に追加はまだ」と書いた）。前の状態は Git の履歴にある。
// これまでの古い節の見出しは「## 前の状態（…）」「## 0. 11/13 19:50 の状態」「## 1. いまの状態」などいろいろだったので、
// 言い方ではなく「状態」を含む見出しの数で見る（今の状態の見出しは 1 つだけ）。
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const handoff = readFileSync("docs/handoff.md", "utf8");

describe("引き継ぎ（docs/handoff.md）", () => {
  it("「状態」を含む見出しは 1 つだけ（今の状態だけ。前の状態の節を残さない）", () => {
    const states = handoff.split("\n").filter((line) => /^#{1,6}\s.*状態/.test(line));
    expect(states).toHaveLength(1);
  });
});

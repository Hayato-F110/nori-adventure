// 2026-11-18 スプリント3のふりかえり I3：引き継ぎ（docs/handoff.md）は今の状態だけにする。
// 前の状態の節を残すと、古い状態を今のものと取り違えて伝える（11/18 に「ホーム画面に追加はまだ」と書いた）。前の状態は Git の履歴にある。
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const handoff = readFileSync("docs/handoff.md", "utf8");

describe("引き継ぎ（docs/handoff.md）", () => {
  it("「前の状態」の見出しがない（今の状態だけ）", () => {
    const old = handoff.split("\n").filter((line) => /^#{1,6}\s*前の状態/.test(line));
    expect(old).toEqual([]);
  });
});

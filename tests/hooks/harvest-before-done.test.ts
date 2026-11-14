import { execFileSync } from "node:child_process";
import path from "node:path";
import { describe, expect, it } from "vitest";
// @ts-expect-error -- Hook は素の JavaScript（.mjs）で、型定義を持たない
import { findUnharvested, isDoneTransition, isFilled } from "../../.claude/hooks/harvest-before-done.mjs";

const root = path.resolve(import.meta.dirname, "../..");
const hook = path.join(root, ".claude/hooks/harvest-before-done.mjs");

const plan = (rows: string) =>
  `# 一覧\n\n## 刈り取り（どの課題の完了条件で閉じるか）\n\n| 項目 | 課題 | その課題の完了条件に書いたこと | 結果 |\n| - | - | - | - |\n${rows}\n## 範囲の外\n`;

describe("Hook：完了に移す前に、刈り取りの表の結果が埋まっていなければ止める（2026-11-14 オーナーの決定）", () => {
  it("その課題の行の結果がすべて埋まっていれば通す", () => {
    const text = plan("| 1 | NORI-74 | 一覧 1 | PR #70 で CI 緑 |\n| 2 | NORI-74 | 一覧 2 | PR #70 |\n");
    expect(findUnharvested([{ path: "a.md", text }], "NORI-74")).toEqual([]);
  });

  it("「まだ」・空・「—」の行が1つでもあれば止め、場所と項目を出す", () => {
    const text = plan(
      "| 1 | NORI-74 | 一覧 1 | PR #70 |\n| 2 | NORI-74 | 一覧 2 | （まだ） |\n| 3 | NORI-74 | 一覧 3 |  |\n| 4 | NORI-74 | 一覧 4 | — |\n",
    );
    const reasons = findUnharvested([{ path: "a.md", text }], "NORI-74");
    expect(reasons).toHaveLength(3);
    expect(reasons[0]).toContain("a.md:");
    expect(reasons[0]).toContain("「2」");
  });

  it("ほかの課題の行、「課題なし（…NORI-74…）」の理由の中に出てくるだけの行は見ない", () => {
    const text = plan(
      "| 1 | NORI-73 | x | （まだ） |\n| 2 | 課題なし（NORI-74 の総点検で決めた） | — | （まだ） |\n| 3 | NORI-740 | x | （まだ） |\n",
    );
    expect(findUnharvested([{ path: "a.md", text }], "NORI-74")).toEqual([]);
  });

  it("複数の一覧を見る（ほかの一覧の行で NORI-74 に回したものも止める）", () => {
    const a = plan("| 1 | NORI-74 | x | 済み |\n");
    const b = plan("| E2E の確かめない範囲：y | NORI-74 | y | （まだ） |\n");
    expect(
      findUnharvested(
        [
          { path: "a.md", text: a },
          { path: "b.md", text: b },
        ],
        "NORI-74",
      ),
    ).toHaveLength(1);
  });

  it("結果の列がない表は、結果が空として止める（列を足し忘れても通さない）", () => {
    const text = "## 刈り取り\n\n| 項目 | 課題 |\n| - | - |\n| 1 | NORI-74 |\n";
    expect(findUnharvested([{ path: "a.md", text }], "NORI-74")).toHaveLength(1);
  });

  it("その課題の行が1つもなければ通す（テストの一覧を持たない課題）", () => {
    expect(
      findUnharvested([{ path: "a.md", text: plan("| 1 | NORI-71 | x | 済み |\n") }], "NORI-72"),
    ).toEqual([]);
  });

  it("「完了」に移す操作だけを見る（名前「完了」か ID 31）", () => {
    expect(isDoneTransition({ transitionName: "完了" })).toBe(true);
    expect(isDoneTransition({ transitionId: "31" })).toBe(true);
    expect(isDoneTransition({ transitionName: "進行中" })).toBe(false);
    expect(isDoneTransition({ transitionId: "21" })).toBe(false);
  });

  it("結果の埋まり方", () => {
    expect(isFilled("PR #70 で CI 緑")).toBe(true);
    expect(isFilled("（承認で閉じる）")).toBe(true);
    expect(isFilled("（まだ。NORI-73 で埋める）")).toBe(false);
    expect(isFilled("")).toBe(false);
  });

  it("Hook として動かすと、完了以外の操作は何も言わずに通す（終了コード 0）", () => {
    const input = JSON.stringify({
      tool_name: "mcp__claude_ai_Atlassian_MCP__transitionJiraIssue",
      tool_input: { issueIdOrKey: "NORI-74", transitionName: "進行中" },
    });
    expect(execFileSync("node", [hook], { input, encoding: "utf8" })).toBe("");
  });
});

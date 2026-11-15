import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
// @ts-expect-error -- Hook は素の JavaScript（.mjs）で、型定義を持たない（整形で行が分かれないよう、まとめて読む）
import * as hook_ from "../../.claude/hooks/approval-jira.mjs";

const { issuesInHarvestTables, jiraChecksOfThisTurn, missingJira } = hook_ as {
  issuesInHarvestTables: (text: string) => string[];
  jiraChecksOfThisTurn: (jsonl: string) => Map<string, boolean>;
  missingJira: (texts: string[], jsonl: string) => string[];
};

const root = path.resolve(import.meta.dirname, "../..");
const hook = path.join(root, ".claude/hooks/approval-jira.mjs");

const request = [
  "## NORI-57（リプレイ）テストの一覧の承認のお願い",
  "",
  "| 項目 | 課題 | 完了条件 |",
  "| --- | --- | --- |",
  "| 一覧 1 | [NORI-57](https://example.atlassian.net/browse/NORI-57) | テストが緑 |",
  "| 範囲の外：自動録画 | [NORI-42](https://example.atlassian.net/browse/NORI-42) | NORI-42 の一覧で見る |",
  "| 範囲の外：360 px | 課題なし（NORI-38 の横向き） | 承認で閉じる |",
].join("\n");

const said = (text: string) => ({
  type: "assistant",
  message: { role: "assistant", content: [{ type: "text", text }] },
});
const call = (id: string, name: string, key: string) => ({
  type: "assistant",
  message: { role: "assistant", content: [{ type: "tool_use", id, name, input: { issueIdOrKey: key } }] },
});
const result = (id: string, text: string) => ({
  type: "user",
  message: {
    role: "user",
    content: [{ type: "tool_result", tool_use_id: id, content: [{ type: "text", text }] }],
  },
});
const jsonlOf = (entries: object[]) => entries.map((e) => JSON.stringify(e)).join("\n");

const POINTS = "完了条件：NORI-57 の一覧の刈り取りの表で、NORI-57 の行の結果がすべて埋まっていること";
const OLD = "完了条件：ゴールのあと、ボタン1つで再生する";

describe("Hook：承認のお願いの刈り取りの表に出てくる課題は、同じ回で Jira の完了条件を確かめる（2026-11-15）", () => {
  it("「課題」の列から課題キーを集める。「課題なし」の行は、中に NORI-xx があっても数えない", () => {
    expect(issuesInHarvestTables(request)).toEqual(["NORI-57", "NORI-42"]);
  });

  it("「承認のお願い」がない返答や、「課題」の列のない表では集めない", () => {
    expect(issuesInHarvestTables(request.replace("承認のお願い", "報告"))).toEqual([]);
    expect(
      issuesInHarvestTables("承認のお願い\n\n| 項目 | 結果 |\n| --- | --- |\n| NORI-57 | 済み |"),
    ).toEqual([]);
  });

  it("同じ回の getJiraIssue・editJiraIssue の結果に「刈り取りの表」があれば、確かめたとみなす", () => {
    const jsonl = jsonlOf([
      { type: "system", subtype: "stop_hook_summary" },
      call("a", "mcp__claude_ai_Atlassian_MCP__getJiraIssue", "NORI-57"),
      result("a", POINTS),
      call("b", "mcp__claude_ai_Atlassian_MCP__editJiraIssue", "NORI-42"),
      result("b", OLD),
    ]);
    const checks = jiraChecksOfThisTurn(jsonl);
    expect(checks.get("NORI-57")).toBe(true);
    expect(checks.get("NORI-42")).toBe(false);
  });

  it("前の回（stop_hook_summary より前）の確かめは数えない", () => {
    const jsonl = jsonlOf([
      call("a", "mcp__claude_ai_Atlassian_MCP__getJiraIssue", "NORI-57"),
      result("a", POINTS),
      { type: "system", subtype: "stop_hook_summary" },
      said(request),
    ]);
    expect(missingJira([request], jsonl)).toEqual(["NORI-57", "NORI-42"]);
  });

  it("どちらも同じ回で「刈り取りの表」を指していれば、足りないものはない", () => {
    const jsonl = jsonlOf([
      { type: "system", subtype: "stop_hook_summary" },
      call("a", "mcp__claude_ai_Atlassian_MCP__editJiraIssue", "NORI-57"),
      result("a", POINTS),
      call("b", "mcp__claude_ai_Atlassian_MCP__getJiraIssue", "NORI-42"),
      result("b", "NORI-57 の一覧の刈り取りの表で、課題が NORI-42 の行の結果"),
      said(request),
    ]);
    expect(missingJira([request], jsonl)).toEqual([]);
  });

  it("本物の Hook：足りない課題があれば止め（終了コード 2）、課題キーを知らせる。足りていれば通す", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "approval-jira-"));
    const run = (entries: object[]) => {
      const transcript = path.join(dir, `t${entries.length}.jsonl`);
      writeFileSync(transcript, jsonlOf(entries));
      try {
        execFileSync("node", [hook], {
          input: JSON.stringify({ transcript_path: transcript, last_assistant_message: request }),
          stdio: ["pipe", "pipe", "pipe"],
        });
        return { code: 0, stderr: "" };
      } catch (e) {
        const err = e as { status: number; stderr: Buffer };
        return { code: err.status, stderr: err.stderr.toString("utf8") };
      }
    };
    const blocked = run([{ type: "system", subtype: "stop_hook_summary" }, said(request)]);
    expect(blocked.code).toBe(2);
    expect(blocked.stderr).toContain("NORI-57");
    expect(blocked.stderr).toContain("NORI-42");

    const ok = run([
      { type: "system", subtype: "stop_hook_summary" },
      call("a", "mcp__claude_ai_Atlassian_MCP__getJiraIssue", "NORI-57"),
      result("a", POINTS),
      call("b", "mcp__claude_ai_Atlassian_MCP__getJiraIssue", "NORI-42"),
      result("b", "刈り取りの表で、課題が NORI-42 の行"),
      said(request),
    ]);
    expect(ok.code).toBe(0);
  });

  it("2回目（stop_hook_active）では止めない（止め続けないため）", () => {
    const out = execFileSync("node", [hook], { input: JSON.stringify({ stop_hook_active: true }) });
    expect(out.toString()).toBe("");
  });
});

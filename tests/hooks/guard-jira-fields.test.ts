import { execFileSync } from "node:child_process";
import path from "node:path";
import { describe, expect, it } from "vitest";
// @ts-expect-error -- Hook は素の JavaScript（.mjs）で、型定義を持たない
import { findMissingJiraFields } from "../../.claude/hooks/guard-jira-fields.mjs";

const root = path.resolve(import.meta.dirname, "../..");
const hook = path.join(root, ".claude/hooks/guard-jira-fields.mjs");

const full = {
  customfield_10034: 3,
  duedate: "2026-11-17",
  customfield_10015: "2026-11-14",
};
const issue = (fields: Record<string, unknown>, issueType = "タスク") => ({
  cloudId: "x",
  projectKey: "NORI",
  summary: "テスト",
  issueType,
  additional_fields: fields,
});

describe("Hook：Jira の課題のポイント・期限・開始日がなければ止める（スプリント2のふりかえりの改善③）", () => {
  it("3つそろっていれば通す", () => {
    expect(findMissingJiraFields(issue(full))).toEqual([]);
  });

  it.each([
    ["customfield_10015", "開始日"],
    ["customfield_10034", "ポイント"],
    ["duedate", "期限"],
  ])("%s がなければ止める", (key, label) => {
    const fields = Object.fromEntries(Object.entries(full).filter(([k]) => k !== key));
    expect(findMissingJiraFields(issue(fields)).join()).toContain(label);
  });

  it("空の文字列も、ないものとして止める", () => {
    expect(findMissingJiraFields(issue({ ...full, customfield_10015: "" }))).toHaveLength(1);
  });

  it("取り違えやすい customfield_10016 を使ったら止める", () => {
    expect(findMissingJiraFields(issue({ ...full, customfield_10016: 3 })).join()).toContain("10016");
  });

  it("エピックと、NORI 以外のプロジェクトは調べない", () => {
    expect(findMissingJiraFields(issue({}, "Epic"))).toEqual([]);
    expect(findMissingJiraFields({ ...issue({}), projectKey: "OTHER" })).toEqual([]);
  });

  it("Hook として動かすと、止めるときは終了コード 2・通すときは 0", () => {
    const run = (toolInput: unknown) => {
      const input = JSON.stringify({
        tool_name: "mcp__claude_ai_Atlassian_MCP__createJiraIssue",
        tool_input: toolInput,
      });
      try {
        execFileSync("node", [hook], { input, stdio: ["pipe", "pipe", "pipe"] });
        return 0;
      } catch (error) {
        return (error as { status: number }).status;
      }
    };
    expect(run(issue({}))).toBe(2);
    expect(run(issue(full))).toBe(0);
  });
});

import { execFileSync } from "node:child_process";
import path from "node:path";
import { describe, expect, it } from "vitest";
// @ts-expect-error -- Hook は素の JavaScript（.mjs）で、型定義を持たない
import { findMissingJiraFields, findSprintAssignment } from "../../.claude/hooks/guard-jira-fields.mjs";

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

// NORI-90（スプリント3のふりかえり I1）：途中で見つけた課題は今のスプリントに入れずバックログへ。入れるのはオーナーが決めたとき
describe("Hook：Jira の課題を作るときにスプリントを指定したら止める（NORI-90）", () => {
  it("スプリントを指定しない作成は通す", () => {
    expect(findSprintAssignment(issue(full))).toEqual([]);
  });

  it.each([["active"], ["7"], ["NORI Sprint 4"]])("assignToSprint（%s）を指定したら止める", (sprint) => {
    expect(findSprintAssignment({ ...issue(full), assignToSprint: sprint }).join()).toContain("スプリント");
  });

  it.each([["customfield_10020"], ["Sprint"], ["sprint"], ["スプリント"]])(
    "additional_fields の %s を指定したら止める",
    (key) => {
      expect(findSprintAssignment(issue({ ...full, [key]: 7 })).join()).toContain("スプリント");
    },
  );

  it("空の値（空の文字列・null）の指定は、指定しないものとして通す", () => {
    expect(findSprintAssignment({ ...issue(full), assignToSprint: "" })).toEqual([]);
    expect(findSprintAssignment(issue({ ...full, customfield_10020: null }))).toEqual([]);
  });

  it("エピックでも止め、NORI 以外のプロジェクトは調べない", () => {
    expect(findSprintAssignment({ ...issue({}, "Epic"), assignToSprint: "active" })).toHaveLength(1);
    expect(findSprintAssignment({ ...issue(full), projectKey: "OTHER", assignToSprint: "active" })).toEqual([]);
  });

  it("Hook として動かすと、スプリントを指定したら終了コード 2 で、止めた文が「オーナーに聞く」ことを伝える", () => {
    const input = JSON.stringify({
      tool_name: "mcp__claude_ai_Atlassian_MCP__createJiraIssue",
      tool_input: { ...issue(full), assignToSprint: "active" },
    });
    let status = 0;
    let stderr = "";
    try {
      execFileSync("node", [hook], { input, stdio: ["pipe", "pipe", "pipe"] });
    } catch (error) {
      status = (error as { status: number }).status;
      stderr = String((error as { stderr: Buffer }).stderr);
    }
    expect(status).toBe(2);
    expect(stderr).toContain("オーナーに聞");
    expect(stderr).toContain("バックログ");
  });
});

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
// @ts-expect-error -- Hook は素の JavaScript（.mjs）で、型定義を持たない
import {
  findMissingJiraFields,
  findSprintAssignment,
  findSprintMove,
} from "../../.claude/hooks/guard-jira-fields.mjs";

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

  it("スプリントを外す書き方（空の配列・false・空白だけの文字列）も、指定しないものとして通す", () => {
    expect(findSprintAssignment(issue({ ...full, customfield_10020: [] }))).toEqual([]);
    expect(findSprintAssignment({ ...issue(full), assignToSprint: false })).toEqual([]);
    expect(findSprintAssignment({ ...issue(full), assignToSprint: "  " })).toEqual([]);
  });

  it("スプリントの指定と欄の抜けが重なったら、両方を 1 つの文で伝える", () => {
    const input = JSON.stringify({
      tool_name: "mcp__claude_ai_Atlassian_MCP__createJiraIssue",
      tool_input: { ...issue({}), assignToSprint: "active" },
    });
    let stderr = "";
    try {
      execFileSync("node", [hook], { input, stdio: ["pipe", "pipe", "pipe"] });
    } catch (error) {
      stderr = String((error as { stderr: Buffer }).stderr);
    }
    expect(stderr).toContain("スプリントを指定");
    expect(stderr).toContain("期限");
  });

  it("エピックでも止め、NORI 以外のプロジェクトは調べない", () => {
    expect(findSprintAssignment({ ...issue({}, "Epic"), assignToSprint: "active" })).toHaveLength(1);
    expect(findSprintAssignment({ ...issue(full), projectKey: "OTHER", assignToSprint: "active" })).toEqual(
      [],
    );
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

// NORI-90（2026-11-19 にオーナーが範囲を広げた）：作ったあとの編集・遷移・汎用の書き込みでスプリントに入れる道も止める
describe("Hook：作ったあとにスプリントへ入れる操作も止める（NORI-90）", () => {
  const edit = "mcp__claude_ai_Atlassian_MCP__editJiraIssue";
  const transition = "mcp__claude_ai_Atlassian_MCP__transitionJiraIssue";
  const write = "mcp__claude_ai_Atlassian_MCP__executeWrite";

  it.each([["fields"], ["additional_fields"]])(
    "editJiraIssue の %s にスプリントの欄があれば止める",
    (key) => {
      expect(findSprintMove(edit, { issueIdOrKey: "NORI-1", [key]: { customfield_10020: 7 } })).toHaveLength(
        1,
      );
      expect(
        findSprintMove(edit, { issueIdOrKey: "NORI-1", [key]: { Sprint: "NORI Sprint 4" } }),
      ).toHaveLength(1);
    },
  );

  it("editJiraIssue でスプリントに触れない編集と、スプリントから外す編集（null）は通す", () => {
    expect(findSprintMove(edit, { issueIdOrKey: "NORI-1", fields: { summary: "x" } })).toEqual([]);
    expect(findSprintMove(edit, { issueIdOrKey: "NORI-1", fields: { customfield_10020: null } })).toEqual([]);
  });

  it("transitionJiraIssue の sprintId は止め、バックログへ戻す・状態だけ移すのは通す", () => {
    expect(findSprintMove(transition, { issueIdOrKey: "NORI-1", sprintId: 7 })).toHaveLength(1);
    expect(findSprintMove(transition, { issueIdOrKey: "NORI-1", assignToBacklog: true })).toEqual([]);
    expect(findSprintMove(transition, { issueIdOrKey: "NORI-1", transitionName: "進行中" })).toEqual([]);
  });

  it("executeWrite は、操作の名前にスプリントがあるか、inputs にスプリントの指定があれば止める", () => {
    expect(
      findSprintMove(write, { name: "moveIssuesToSprint", inputs: { issues: ["NORI-1"] } }),
    ).toHaveLength(1);
    expect(
      findSprintMove(write, { name: "editIssue", inputs: { fields: { customfield_10020: 7 } } }),
    ).toHaveLength(1);
    expect(findSprintMove(write, { name: "addComment", inputs: { body: "x" } })).toEqual([]);
  });

  it("NORI 以外の課題の編集・遷移は調べない", () => {
    expect(findSprintMove(transition, { issueIdOrKey: "OTHER-1", sprintId: 7 })).toEqual([]);
  });

  it("Hook として動かすと、遷移で sprintId を指定したら終了コード 2", () => {
    const input = JSON.stringify({
      tool_name: transition,
      tool_input: { issueIdOrKey: "NORI-1", sprintId: 7 },
    });
    let status = 0;
    try {
      execFileSync("node", [hook], { input, stdio: ["pipe", "pipe", "pipe"] });
    } catch (error) {
      status = (error as { status: number }).status;
    }
    expect(status).toBe(2);
  });
});

/** 設定のファイルで、その道具のときに guard-jira-fields が動く登録があるか */
const registersSprintGuard = (
  settings: { hooks: { PreToolUse: { matcher: string; hooks: { args?: string[] }[] }[] } },
  tool: string,
) =>
  settings.hooks.PreToolUse.some(
    (e) =>
      // "*" と空は、すべての道具に当たる（Claude Code の matcher の決まり）
      (e.matcher === "*" || e.matcher === "" || new RegExp(`^(${e.matcher})$`).test(tool)) &&
      e.hooks.some((h) => (h.args ?? []).join(" ").includes("guard-jira-fields.mjs")),
  );

describe("設定：スプリントに入れる 4 つの道具で guard-jira-fields が動く（NORI-90）", () => {
  const settings = JSON.parse(readFileSync(path.join(root, ".claude/settings.json"), "utf8"));
  it.each([["createJiraIssue"], ["editJiraIssue"], ["transitionJiraIssue"], ["executeWrite"]])(
    "%s",
    (tool) => {
      expect(registersSprintGuard(settings, `mcp__claude_ai_Atlassian_MCP__${tool}`)).toBe(true);
    },
  );
});

// NORI-90 の 2 回目の /code-review（指摘 1〜3）
describe("Hook：作ったあとの抜け道をふさぐ（NORI-90、2 回目のレビュー）", () => {
  const edit = "mcp__claude_ai_Atlassian_MCP__editJiraIssue";
  const transition = "mcp__claude_ai_Atlassian_MCP__transitionJiraIssue";
  const write = "mcp__claude_ai_Atlassian_MCP__executeWrite";

  it("遷移の fields・update でスプリントの欄を入れたら止める", () => {
    expect(
      findSprintMove(transition, { issueIdOrKey: "NORI-1", fields: { customfield_10020: 7 } }),
    ).toHaveLength(1);
    expect(
      findSprintMove(transition, { issueIdOrKey: "NORI-1", update: { Sprint: [{ set: 7 }] } }),
    ).toHaveLength(1);
  });

  it("課題を番号の ID で指定しても調べる（よそのプロジェクトのキーだけ通す）", () => {
    expect(findSprintMove(transition, { issueIdOrKey: "10234", sprintId: 7 })).toHaveLength(1);
    expect(findSprintMove(edit, { issueIdOrKey: "10234", fields: { customfield_10020: 7 } })).toHaveLength(1);
    expect(findSprintMove(edit, { issueIdOrKey: "OTHER-1", fields: { customfield_10020: 7 } })).toEqual([]);
  });

  it("executeWrite でスプリントから外す操作は通す", () => {
    expect(findSprintMove(write, { name: "removeIssuesFromSprint", inputs: { issues: ["NORI-3"] } })).toEqual(
      [],
    );
  });
});

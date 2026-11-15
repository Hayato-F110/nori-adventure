import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
// @ts-expect-error -- Hook は素の JavaScript（.mjs）で、型定義を持たない（整形で行が分かれないよう、まとめて読む）
import * as hook_ from "../../.claude/hooks/save-agent-report.mjs";
// @ts-expect-error -- 道具は素の JavaScript（.mjs）で、型定義を持たない
import * as list_ from "../../tools/dev/agent-reports.mjs";

type Input = Record<string, unknown>;
const { reportOf, fileNameOf } = hook_ as {
  reportOf: (input: Input) => string | null;
  fileNameOf: (input: Input, now: Date) => string;
};
const { recentReports } = list_ as {
  recentReports: (
    dir: string,
    hours: number,
    now: Date,
  ) => { file: string; agentType: string; firstLine: string }[];
};

const root = path.resolve(import.meta.dirname, "../..");
const hook = path.join(root, ".claude/hooks/save-agent-report.mjs");

const handback = {
  hook_event_name: "PostToolUse",
  tool_name: "SubagentHandback",
  tool_input: { message: "NORI-57 一覧の初見レビュー（1回目）の結果です。\n\n| ID | 指摘 |" },
  agent_id: "a803a75c",
  agent_type: "test-plan-reviewer",
};
const stop = {
  hook_event_name: "SubagentStop",
  last_assistant_message: "調べ終わりました。",
  agent_id: "b123",
  agent_type: "Explore",
};

describe("Hook：サブエージェントの報告を、自動でファイルに保存する（2026-11-15）", () => {
  it("SubagentHandback の報告は tool_input.message から取る（last_assistant_message には入らない：公式の文書）", () => {
    expect(reportOf(handback)).toBe(handback.tool_input.message);
  });

  it("SubagentHandback を使わずに終わったものは、SubagentStop の last_assistant_message から取る", () => {
    expect(reportOf(stop)).toBe("調べ終わりました。");
  });

  it("ほかの道具・空の報告は保存しない", () => {
    expect(reportOf({ ...handback, tool_name: "Bash" })).toBeNull();
    expect(reportOf({ ...stop, last_assistant_message: "  " })).toBeNull();
    expect(reportOf({})).toBeNull();
  });

  it("ファイルの名前は、日時・種類・サブエージェントの id（記号は - に置きかえる）", () => {
    const now = new Date(2026, 10, 15, 11, 5, 9);
    expect(fileNameOf(handback, now)).toBe("2026-11-15-1105-test-plan-reviewer-a803a75c.md");
    expect(fileNameOf({ ...stop, agent_type: "my:reviewer/x" }, now)).toBe(
      "2026-11-15-1105-my-reviewer-x-b123.md",
    );
    expect(fileNameOf({}, now)).toBe("2026-11-15-1105-agent-unknown.md");
  });

  it("本物の Hook：報告を書き、同じサブエージェントの SubagentStop では上書きしない。いつも終了コード 0（止めない）", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "agent-reports-"));
    const run = (input: Input) =>
      execFileSync("node", [hook], {
        input: JSON.stringify(input),
        env: { ...process.env, NORI_AGENT_REPORTS_DIR: dir },
      });
    run(handback);
    run({ ...stop, agent_id: "a803a75c", last_assistant_message: "あとの短い文" });
    const files = readdirSync(dir);
    expect(files).toHaveLength(1);
    const body = readFileSync(path.join(dir, files[0] ?? ""), "utf8");
    expect(body).toContain("test-plan-reviewer");
    expect(body).toContain("NORI-57 一覧の初見レビュー");
    expect(body).not.toContain("あとの短い文");
    // 読めない入力でも止めない
    expect(() =>
      execFileSync("node", [hook], { input: "{", env: { ...process.env, NORI_AGENT_REPORTS_DIR: dir } }),
    ).not.toThrow();
  });
});

describe("道具 agent-reports：/start-day で、新しい報告を一覧にする", () => {
  it("指定した時間の中に書いた報告だけを、新しい順に、種類と1行目つきで返す", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "agent-reports-list-"));
    const now = new Date(2026, 10, 15, 12, 0, 0);
    const write = (name: string, type: string, hoursAgo: number) => {
      const file = path.join(dir, name);
      writeFileSync(file, `- 種類：${type}\n\n---\n\n${name} の報告\n`);
      const t = new Date(now.getTime() - hoursAgo * 3600_000);
      utimesSync(file, t, t);
    };
    write("old.md", "Explore", 60);
    write("a.md", "test-plan-reviewer", 20);
    write("b.md", "web-fetch", 1);
    const list = recentReports(dir, 48, now);
    expect(list.map((r) => r.file)).toEqual(["b.md", "a.md"]);
    expect(list[1]).toMatchObject({ agentType: "test-plan-reviewer", firstLine: "a.md の報告" });
  });

  it("フォルダがなければ空", () => {
    expect(recentReports(path.join(tmpdir(), "no-such-dir-nori"), 48, new Date())).toEqual([]);
  });
});

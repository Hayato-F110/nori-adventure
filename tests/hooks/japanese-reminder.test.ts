// NORI-82：道具の結果のたびに「返答は日本語」を差し込む Hook と、効き目を数える道具（docs/test-plans/NORI-82.md）
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(import.meta.dirname, "../..");
const hook = path.join(root, ".claude/hooks/japanese-reminder.mjs");
const counter = path.join(root, "tools/dev/count-japanese-blocks.mjs");

const run = (input: string) => spawnSync("node", [hook], { input, encoding: "utf8" });

// 数える目印（japanese-reply が止めたときの文）。差し込む文に入ると、数えすぎる（R1-82-7）
const MARKS = ["道具を呼ぶ前に止めました", "止めました：この回の文章に"];

describe("一覧 1：道具の結果のたびに、日本語の決まりの一言を差し込む", () => {
  it.each(["PostToolUse", "PostToolUseFailure"])("%s：JSON で一言を返し、止めない", (event) => {
    const r = run(JSON.stringify({ hook_event_name: event, tool_name: "Bash" }));
    expect(r.status).toBe(0);
    expect(r.stderr).toBe("");
    const out = JSON.parse(r.stdout) as {
      hookSpecificOutput: { hookEventName: string; additionalContext: string };
    };
    expect(out.hookSpecificOutput.hookEventName).toBe(event);
    const text = out.hookSpecificOutput.additionalContext;
    expect(text).toContain("日本語");
    expect(text).toContain("道具を呼ぶ前の 1 行も");
    expect(text.length).toBeLessThanOrEqual(200);
    for (const m of MARKS) expect(text).not.toContain(m);
  });

  it.each([
    ["空", ""],
    ["壊れた JSON", "{"],
    ["事象の名前がない", JSON.stringify({ tool_name: "Bash" })],
    ["ほかの事象", JSON.stringify({ hook_event_name: "PreToolUse" })],
  ])("%s の入力：何も出さず、止めない", (_, input) => {
    const r = run(input);
    expect(r.status).toBe(0);
    expect(r.stdout).toBe("");
    expect(r.stderr).toBe("");
  });
});

describe("一覧 2：すべての道具の結果で動くように登録してある", () => {
  type Entry = { matcher?: string; hooks: { command: string; args?: string[]; timeout?: number }[] };
  const settings = JSON.parse(readFileSync(path.join(root, ".claude/settings.json"), "utf8")) as {
    hooks: Record<string, Entry[]>;
  };
  const usesReminder = (e: Entry) =>
    e.hooks.some((h) => (h.args ?? []).some((a) => a.includes("japanese-reminder.mjs")));

  it.each(["PostToolUse", "PostToolUseFailure"])("%s に matcher なしで登録し、timeout は 10 秒", (event) => {
    const found = (settings.hooks[event] ?? []).filter(usesReminder);
    expect(found).toHaveLength(1);
    const [entry] = found;
    expect(entry?.matcher === undefined || entry.matcher === "" || entry.matcher === "*").toBe(true);
    expect(
      entry?.hooks.find((h) => (h.args ?? []).some((a) => a.includes("japanese-reminder.mjs")))?.timeout,
    ).toBe(10);
  });

  it("ほかの事象には登録していない", () => {
    const events = Object.entries(settings.hooks)
      .filter(([, entries]) => entries.some(usesReminder))
      .map(([event]) => event)
      .sort();
    expect(events).toEqual(["PostToolUse", "PostToolUseFailure"]);
  });

  it("PostToolUse の今ある 2 つ（format-and-lint・save-agent-report）の matcher と args は変えない", () => {
    const post = settings.hooks["PostToolUse"] ?? [];
    const pick = (name: string) =>
      post.find((e) => e.hooks.some((h) => (h.args ?? []).some((a) => a.includes(name))));
    expect(pick("format-and-lint.mjs")?.matcher).toBe("Edit|Write|MultiEdit");
    expect(pick("format-and-lint.mjs")?.hooks[0]?.args).toEqual([
      "${CLAUDE_PROJECT_DIR}/.claude/hooks/format-and-lint.mjs",
    ]);
    expect(pick("save-agent-report.mjs")?.matcher).toBe("SubagentHandback");
    expect(pick("save-agent-report.mjs")?.hooks[0]?.args).toEqual([
      "${CLAUDE_PROJECT_DIR}/.claude/hooks/save-agent-report.mjs",
    ]);
  });
});

describe("一覧 3：効き目を数える道具", () => {
  // 実際の記録（2026-11-16）の行の形を写したもの（前提 3）
  const preBlock = (tool: string) => ({
    type: "tool_result",
    is_error: true,
    content: `PreToolUse:${tool} hook error: [node \${CLAUDE_PROJECT_DIR}/.claude/hooks/japanese-reply.mjs]: 道具を呼ぶ前に止めました：直前の文が英語だけです（返答はすべて日本語の決まり）。\n- I'll fix this now.`,
  });
  const otherPreBlock = {
    type: "tool_result",
    is_error: true,
    content:
      "PreToolUse:Bash hook error: [node ${CLAUDE_PROJECT_DIR}/.claude/hooks/guard-delete.mjs]: 消す操作です",
  };
  const ok = { type: "tool_result", content: "The file was updated successfully." };
  const user = (content: unknown, extra: object = {}) => ({
    type: "user",
    message: { role: "user", content },
    ...extra,
  });
  const assistant = (n: number) => ({
    type: "assistant",
    message: { content: Array.from({ length: n }, () => ({ type: "tool_use", name: "Bash", input: {} })) },
  });
  const stopFeedback = (hook: string, text: string) =>
    user(`Stop hook feedback:\n[node \${CLAUDE_PROJECT_DIR}/.claude/hooks/${hook}]: ${text}`);
  const lines = [
    assistant(3),
    // 道具の前で止めた 1 回目（toolUseResult の写しつき）
    user([preBlock("Edit")], {
      toolUseResult: "Error: PreToolUse:Edit hook error: …道具を呼ぶ前に止めました…",
    }),
    // 写しの記録（数えない）
    { type: "api-request-blob", message: { role: "user", content: [preBlock("Edit")] } },
    assistant(2),
    // 1 つの行に、成功 1 つと止め 1 つ（止めだけ 1 回と数える）
    user([ok, preBlock("Bash")]),
    // ほかの Hook が道具の前で止めた（数えない）
    user([otherPreBlock]),
    // Hook のソースを読んだ結果（同じ文が入っていても数えない）
    user([{ type: "tool_result", content: 'export const BEFORE_TOOL_MARK = "道具を呼ぶ前に止めました";' }]),
    { type: "system", subtype: "stop_hook_summary" },
    // 応答の終わりで止めた 1 回（system の hookErrors の写しは数えない）
    stopFeedback("japanese-reply.mjs", "止めました：この回の文章に、英語だけの行があります"),
    {
      type: "system",
      hookErrors: ["[node …japanese-reply.mjs]: 止めました：この回の文章に、英語だけの行があります"],
    },
    { type: "system", subtype: "stop_hook_summary" },
    // ほかの Hook の応答の終わりの止め（数えない）
    stopFeedback("approval-jira.mjs", "止めました：テストの一覧の承認のお願いに、刈り取りの表がありません"),
    { type: "system", subtype: "stop_hook_summary" },
  ];
  const jsonl = lines.map((l) => JSON.stringify(l)).join("\n");

  it("japanese-reply の止めだけを、道具の前と応答の終わりに分けて数え、割合も出す", async () => {
    const { countBlocks } = (await import(counter)) as {
      countBlocks: (jsonl: string) => {
        beforeTool: number;
        atStop: number;
        toolCalls: number;
        stops: number;
        beforeToolRate: number;
        atStopRate: number;
      };
    };
    const c = countBlocks(jsonl);
    expect(c).toMatchObject({ beforeTool: 2, atStop: 1, toolCalls: 5, stops: 3 });
    expect(c.beforeToolRate).toBeCloseTo(2 / 5);
    expect(c.atStopRate).toBeCloseTo(1 / 3);
  });

  it("記録のファイルを渡すと、数を JSON で出す", () => {
    const r = spawnSync("node", [counter, "-"], { input: jsonl, encoding: "utf8" });
    expect(r.status).toBe(0);
    expect(JSON.parse(r.stdout)).toMatchObject({ beforeTool: 2, atStop: 1, toolCalls: 5, stops: 3 });
  });
});

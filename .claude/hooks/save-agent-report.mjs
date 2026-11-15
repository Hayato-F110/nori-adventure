// PostToolUse（matcher SubagentHandback）と SubagentStop の Hook：サブエージェントの報告の全文を、
// Git の対象外のフォルダ .claude/agent-reports/ に自動で保存する。止めない（いつも終了コード 0）。
// 理由：2026-11-14、セッションが切れて NORI-38・57 の初見レビューの報告を受け取れず、11/15 に
// 「残っていない」と判断して回し直しを始めた（前のセッションの記録には残っていた）。書き写すのを忘れても残す。
// 報告の本文の場所（公式の文書 https://code.claude.com/docs/en/hooks ）：
// - SubagentHandback で返すときは、その道具の tool_input.message（last_assistant_message には入らない）
// - それ以外は SubagentStop の last_assistant_message
// 同じサブエージェントの報告がもうあれば、SubagentStop では上書きしない（SubagentHandback の本文を残す）。

import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";

/** 入力から報告の本文を取り出す。保存しないときは null */
export const reportOf = (input) => {
  let text = null;
  if (input?.hook_event_name === "PostToolUse" && input?.tool_name === "SubagentHandback") {
    text = input?.tool_input?.message;
  } else if (input?.hook_event_name === "SubagentStop") {
    text = input?.last_assistant_message;
  }
  return typeof text === "string" && text.trim() !== "" ? text : null;
};

const safe = (s, fallback) =>
  String(s ?? "")
    .replace(/[^A-Za-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "") || fallback;
const pad = (n) => String(n).padStart(2, "0");

/** ファイルの名前：日時（その端末の時刻）・種類・サブエージェントの id */
export const fileNameOf = (input, now) => {
  const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`;
  return `${stamp}-${safe(input?.agent_type, "agent")}-${safe(input?.agent_id, "unknown")}.md`;
};

const reportsDir = () =>
  process.env.NORI_AGENT_REPORTS_DIR ??
  path.join(process.env.CLAUDE_PROJECT_DIR ?? process.cwd(), ".claude", "agent-reports");

const readStdin = async () => {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
};

const main = async () => {
  let input;
  try {
    input = JSON.parse((await readStdin()) || "{}");
  } catch {
    return;
  }
  const text = reportOf(input);
  if (text === null) return;
  const dir = reportsDir();
  mkdirSync(dir, { recursive: true });
  const id = safe(input.agent_id, "unknown");
  const already = existsSync(dir) && readdirSync(dir).some((f) => f.endsWith(`-${id}.md`));
  if (already && input.hook_event_name === "SubagentStop") return;
  const header = [
    `- 種類：${input.agent_type ?? "（不明）"}`,
    `- id：${input.agent_id ?? "（不明）"}`,
    `- 受け取り方：${input.hook_event_name}${input.tool_name ? `（${input.tool_name}）` : ""}`,
    `- 保存した時刻：${new Date().toISOString()}`,
  ].join("\n");
  writeFileSync(path.join(dir, fileNameOf(input, new Date())), `${header}\n\n---\n\n${text}\n`);
};

// テストから import したときは動かさない（ほかの Hook と同じ書き方）
if (process.argv[1] && process.argv[1].replace(/\\/g, "/").endsWith("save-agent-report.mjs")) {
  main().catch((error) => {
    // 保存できなくても作業は止めない
    console.error(`save-agent-report を実行できませんでした（通します）：${error.message}`);
  });
}

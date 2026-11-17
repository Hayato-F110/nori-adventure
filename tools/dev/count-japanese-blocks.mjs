// NORI-82：会話の記録（JSONL）から、Hook japanese-reply が止めた回数を数える（効き目の確かめ。docs/test-plans/NORI-82.md の一覧 3）
// 使い方：node tools/dev/count-japanese-blocks.mjs <記録.jsonl>... [--until <ISO の時刻>]（"-" は標準入力）
// 数えるもの：
//   道具の前で止めた：type が user の行の tool_result（is_error: true）で、文が PreToolUse: で始まり、
//     japanese-reply.mjs]: 道具を呼ぶ前に止めました を含むもの（1 つで 1 回）
//   応答の終わりで止めた：type が user の行のメッセージが Stop hook feedback: で始まり、japanese-reply.mjs]: 止めました：この回の文章に を含むもの
// 数えないもの：toolUseResult・api-request-blob・system の hookErrors の写し、Hook のソースを読んだ結果、ほかの Hook の止め
// 割合の分母：道具の前は道具の呼び出しの数（assistant の tool_use）、応答の終わりは応答の終わりの数（system の stop_hook_summary）
// --until：その時刻より後の行が 1 つでも出たら、そのファイルはそこで読むのをやめる（時刻のない行も、そこから先は数えない）
import { readFileSync } from "node:fs";
import { BEFORE_TOOL_MARK, STOP_MARK } from "../../.claude/hooks/japanese-reply.mjs";

// 目印は japanese-reply.mjs から読む（文を変えても、数える側がずれない。/code-review の指摘）
export const PRE = `japanese-reply.mjs]: ${BEFORE_TOOL_MARK}`;
export const STOP = `japanese-reply.mjs]: ${STOP_MARK}`;

const textOf = (content) =>
  typeof content === "string"
    ? content
    : Array.isArray(content)
      ? content
          .filter((c) => c?.type === "text" && typeof c.text === "string")
          .map((c) => c.text)
          .join("\n")
      : "";

/** 1 つの記録の文字列を数える。until（ミリ秒）を渡すと、その時刻より後の行が出たところで読むのをやめる */
export const countBlocks = (jsonl, until = Number.POSITIVE_INFINITY) => {
  let beforeTool = 0;
  let atStop = 0;
  let toolCalls = 0;
  let stops = 0;
  for (const line of jsonl.split("\n")) {
    let e;
    try {
      e = JSON.parse(line);
    } catch {
      continue;
    }
    if (typeof e?.timestamp === "string" && Date.parse(e.timestamp) > until) break;
    const content = e?.message?.content;
    if (e?.type === "assistant" && Array.isArray(content)) {
      toolCalls += content.filter((c) => c?.type === "tool_use").length;
    } else if (e?.type === "system" && e?.subtype === "stop_hook_summary") {
      stops += 1;
    } else if (e?.type === "user") {
      if (Array.isArray(content)) {
        for (const c of content) {
          if (c?.type !== "tool_result" || c.is_error !== true) continue;
          const t = textOf(c.content);
          if (t.startsWith("PreToolUse:") && t.includes(PRE)) beforeTool += 1;
        }
      }
      const text = textOf(content);
      if (text.startsWith("Stop hook feedback:") && text.includes(STOP)) atStop += 1;
    }
  }
  return { beforeTool, atStop, toolCalls, stops };
};

/** いくつかの記録の数を足し、割合を出す */
export const summarize = (counts) => {
  const s = counts.reduce(
    (a, c) => ({
      beforeTool: a.beforeTool + c.beforeTool,
      atStop: a.atStop + c.atStop,
      toolCalls: a.toolCalls + c.toolCalls,
      stops: a.stops + c.stops,
    }),
    { beforeTool: 0, atStop: 0, toolCalls: 0, stops: 0 },
  );
  return {
    ...s,
    beforeToolRate: s.toolCalls === 0 ? 0 : s.beforeTool / s.toolCalls,
    atStopRate: s.stops === 0 ? 0 : s.atStop / s.stops,
  };
};

const main = () => {
  const args = process.argv.slice(2);
  const u = args.indexOf("--until");
  let until = Number.POSITIVE_INFINITY;
  if (u >= 0) {
    until = Date.parse(args[u + 1] ?? "");
    if (Number.isNaN(until)) {
      // 読めない時刻で「切らない」に落とすと、入れる前の数に後の行が混ざる（/code-review の指摘）
      process.stderr.write(`--until の時刻が読めません：${args[u + 1] ?? "（なし）"}\n`);
      process.exit(1);
    }
  }
  const files = u >= 0 ? args.filter((_, i) => i !== u && i !== u + 1) : args;
  const counts = files.map((f) => countBlocks(readFileSync(f === "-" ? 0 : f, "utf8"), until));
  process.stdout.write(`${JSON.stringify(summarize(counts))}\n`);
};

if (process.argv[1] && process.argv[1].replace(/\\/g, "/").endsWith("count-japanese-blocks.mjs")) main();

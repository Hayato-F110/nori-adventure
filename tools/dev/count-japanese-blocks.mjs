// NORI-82：会話の記録（JSONL）から、Hook japanese-reply が止めた回数を数える（効き目の確かめ。docs/test-plans/NORI-82.md の一覧 3）
// 使い方：node tools/dev/count-japanese-blocks.mjs <記録.jsonl>... [--until <ISO の時刻>]（"-" は標準入力）
// 数えるもの：
//   道具の前で止めた：type が user の行の tool_result（is_error: true）で、文に japanese-reply.mjs]: 道具を呼ぶ前に止めました を含むもの（1 つで 1 回）
//   応答の終わりで止めた：type が user の行のメッセージが Stop hook feedback: で始まり、japanese-reply.mjs]: 止めました：この回の文章に を含むもの
// 数えないもの：toolUseResult・api-request-blob・system の hookErrors の写し、Hook のソースを読んだ結果、ほかの Hook の止め
// 割合の分母：道具の前は道具の呼び出しの数（assistant の tool_use）、応答の終わりは応答の終わりの数（system の stop_hook_summary）
import { readFileSync } from "node:fs";

const PRE = "japanese-reply.mjs]: 道具を呼ぶ前に止めました";
const STOP = "japanese-reply.mjs]: 止めました：この回の文章に";

const textOf = (content) =>
  typeof content === "string"
    ? content
    : Array.isArray(content)
      ? content
          .filter((c) => c?.type === "text" && typeof c.text === "string")
          .map((c) => c.text)
          .join("\n")
      : "";

/** 記録の文字列を数える。until（ミリ秒）を渡すと、その時刻より後の行は数えない */
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
    if (typeof e?.timestamp === "string" && Date.parse(e.timestamp) > until) continue;
    const content = e?.message?.content;
    if (e?.type === "assistant" && Array.isArray(content)) {
      toolCalls += content.filter((c) => c?.type === "tool_use").length;
    } else if (e?.type === "system" && e?.subtype === "stop_hook_summary") {
      stops += 1;
    } else if (e?.type === "user") {
      if (Array.isArray(content)) {
        for (const c of content) {
          if (
            c?.type === "tool_result" &&
            c.is_error === true &&
            typeof c.content === "string" &&
            c.content.includes(PRE)
          )
            beforeTool += 1;
        }
      }
      const text = textOf(content);
      if (text.startsWith("Stop hook feedback:") && text.includes(STOP)) atStop += 1;
    }
  }
  return {
    beforeTool,
    atStop,
    toolCalls,
    stops,
    beforeToolRate: toolCalls === 0 ? 0 : beforeTool / toolCalls,
    atStopRate: stops === 0 ? 0 : atStop / stops,
  };
};

const main = () => {
  const args = process.argv.slice(2);
  const u = args.indexOf("--until");
  const until = u >= 0 ? Date.parse(args[u + 1] ?? "") : Number.POSITIVE_INFINITY;
  const files = u >= 0 ? args.filter((_, i) => i !== u && i !== u + 1) : args;
  const text = files.map((f) => readFileSync(f === "-" ? 0 : f, "utf8")).join("\n");
  process.stdout.write(
    `${JSON.stringify(countBlocks(text, Number.isNaN(until) ? Number.POSITIVE_INFINITY : until))}\n`,
  );
};

if (process.argv[1] && process.argv[1].replace(/\\/g, "/").endsWith("count-japanese-blocks.mjs")) main();

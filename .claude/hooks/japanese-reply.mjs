// Stop の Hook：応答を終える前に、この回（最後のオーナーのメッセージのあと）に書いた文章を調べ、
// 英語だけの行があれば止めて、日本語で書き直すよう Claude に伝える（終了コード 2）。
// 理由：返答はすべて日本語の決まり（メモリー always-japanese）なのに、作業の途中の1行の報告が英語になった（2026-11-12）。
// 調べないもの：コードブロック・インラインのコード・URL・パス・コマンド。日本語の文字が1つでもある行は通す。
// 同じ止め方を続けないよう、止めたあとの再実行（stop_hook_active）では止めない。

import { readFileSync } from "node:fs";

const BLOCK = 2;
const JAPANESE = /[぀-ヿ㐀-鿿！-｠]/;

/** 英語だけの行（英単語が4つ以上あり、日本語の文字がない行）を返す */
export const findEnglishLines = (text) => {
  if (typeof text !== "string") return [];
  const withoutCode = text
    .replace(/```[\s\S]*?```/g, "") // コードブロック
    .replace(/`[^`\n]*`/g, "") // インラインのコード
    .replace(/\]\([^)]*\)/g, "]") // リンクの行き先
    .replace(/https?:\/\/\S+/g, ""); // URL
  return withoutCode
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "" && !JAPANESE.test(line))
    .filter((line) => !/^[|:\-\s]+$/.test(line)) // 表の区切り
    .filter((line) => (line.match(/[A-Za-z]{2,}/g) ?? []).length >= 4);
};

/** transcript（JSONL）から、最後のオーナーのメッセージのあとに書いた文章を集める */
export const textsOfThisTurn = (jsonl) => {
  const texts = [];
  for (const line of jsonl.split("\n").reverse()) {
    let entry;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }
    const message = entry?.message;
    if (!message) continue;
    const content = message.content;
    if (message.role === "user") {
      // 道具の結果は会話の途中なので、その先も見る。文字のメッセージがオーナーの番の始まり
      const isToolResult = Array.isArray(content) && content.every((c) => c?.type === "tool_result");
      if (!isToolResult) break;
      continue;
    }
    if (message.role === "assistant" && Array.isArray(content)) {
      for (const c of content) if (c?.type === "text" && typeof c.text === "string") texts.push(c.text);
    }
  }
  return texts.reverse();
};

const readStdin = async () => {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
};

const main = async () => {
  const input = JSON.parse((await readStdin()) || "{}");
  if (input.stop_hook_active) return;
  let texts = [];
  if (typeof input.transcript_path === "string") {
    try {
      texts = textsOfThisTurn(readFileSync(input.transcript_path, "utf8"));
    } catch {
      texts = [];
    }
  }
  if (typeof input.last_assistant_message === "string") texts.push(input.last_assistant_message);
  const found = [...new Set(texts.flatMap(findEnglishLines))];
  if (found.length === 0) return;
  process.stderr.write(
    "止めました：この回の文章に、英語だけの行があります（返答はすべて日本語の決まり）。\n" +
      found
        .slice(0, 5)
        .map((l) => `- ${l.slice(0, 120)}`)
        .join("\n") +
      "\n最後の報告を日本語で書き直して、もう一度送ってください（途中の行は直せないので、報告の中で日本語で言い直す）。\n",
  );
  process.exit(BLOCK);
};

// テストから import したときは動かさない（ほかの Hook と同じ書き方）
if (process.argv[1] && process.argv[1].replace(/\\/g, "/").endsWith("japanese-reply.mjs")) {
  main().catch((error) => {
    // 読めないときは通す（応答を止め続けないため）
    console.error(`japanese-reply を実行できませんでした（通します）：${error.message}`);
  });
}

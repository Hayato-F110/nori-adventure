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

/**
 * transcript（JSONL）から、前回この Hook が動いたあと（記録の stop_hook_summary のあと）に書いた文章を集める。
 * 作業の途中に届いたオーナーのメッセージや、裏の作業の知らせでは区切らない（11/12、それで英語の行を見落とした）
 */
export const textsOfThisTurn = (jsonl) => {
  const texts = [];
  for (const line of jsonl.split("\n").reverse()) {
    let entry;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }
    if (entry?.type === "system" && entry?.subtype === "stop_hook_summary") break;
    // 同じ文章が、記録用の写し（api-request-blob）にも入るので、assistant の本体だけを見る
    if (entry?.type !== "assistant") continue;
    const content = entry?.message?.content;
    if (!Array.isArray(content)) continue;
    for (const c of content) if (c?.type === "text" && typeof c.text === "string") texts.push(c.text);
  }
  return texts.reverse();
};

/**
 * 道具を呼ぶ直前（PreToolUse）用：記録の終わりから、最後の user の記録（道具の結果・メッセージ）までに書いた文章を集める。
 * つまり、今の道具の呼び出しの前に書いた1行（「次に〜します」の報告）だけを見る
 */
export const textsBeforeThisTool = (jsonl) => {
  const texts = [];
  for (const line of jsonl.split("\n").reverse()) {
    let entry;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }
    if (entry?.type === "user") break;
    if (entry?.type !== "assistant") continue;
    const content = entry?.message?.content;
    if (!Array.isArray(content)) continue;
    for (const c of content) if (c?.type === "text" && typeof c.text === "string") texts.push(c.text);
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
  const beforeTool = input.hook_event_name === "PreToolUse";
  let texts = [];
  if (typeof input.transcript_path === "string") {
    try {
      const jsonl = readFileSync(input.transcript_path, "utf8");
      texts = beforeTool ? textsBeforeThisTool(jsonl) : textsOfThisTurn(jsonl);
    } catch {
      texts = [];
    }
  }
  if (!beforeTool && typeof input.last_assistant_message === "string")
    texts.push(input.last_assistant_message);
  const found = [...new Set(texts.flatMap(findEnglishLines))];
  if (found.length === 0) return;
  const list = found
    .slice(0, 5)
    .map((l) => `- ${l.slice(0, 120)}`)
    .join("\n");
  process.stderr.write(
    beforeTool
      ? "道具を呼ぶ前に止めました：直前の文が英語だけです（返答はすべて日本語の決まり）。\n" +
          list +
          "\n同じ内容を日本語で書き直してから、もう一度この道具を呼んでください。\n"
      : "止めました：この回の文章に、英語だけの行があります（返答はすべて日本語の決まり）。\n" +
          list +
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

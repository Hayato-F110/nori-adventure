// PostToolUse・PostToolUseFailure の Hook（NORI-82）：道具の結果のたびに、返答は日本語の決まりを一言だけ差し込む。
// 理由：道具を呼ぶ前の 1 行が英語になり、japanese-reply は書いたあとに止めるだけで、書く前には防げなかった（11/16 だけで 14 回以上）。
// 崩れやすいのは、英語の道具の結果を読んだ直後なので、その結果の横に置く。
// 公式の資料（https://code.claude.com/docs/en/hooks）：終了コード 0 で hookSpecificOutput.additionalContext を出すと、
// 道具の結果の横に入り、Claude が次に読む。オーナーの画面には出ない。命令でなく事実の形で書く。
// 読めない入力・ほかの事象では何も出さない（道具の結果を止めない）。

const EVENTS = new Set(["PostToolUse", "PostToolUseFailure"]);

/** 差し込む文（事実の形。200 文字以下。japanese-reply の止めた知らせの目印の文字列を入れない） */
export const REMINDER =
  "このプロジェクトの返答は、道具を呼ぶ前の 1 行も日本語で書く決まり（CLAUDE.md・メモリー always-japanese）。英語の道具の結果を読んだ直後に崩れやすい。";

/** 入力の JSON の文字列から、標準出力に出す文字列を返す（出さないときは空） */
export const reminderFor = (raw) => {
  let input;
  try {
    input = JSON.parse(raw || "null");
  } catch {
    return "";
  }
  const event = input?.hook_event_name;
  if (!EVENTS.has(event)) return "";
  return JSON.stringify({ hookSpecificOutput: { hookEventName: event, additionalContext: REMINDER } });
};

const readStdin = async () => {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
};

const main = async () => {
  const out = reminderFor(await readStdin());
  if (out !== "") process.stdout.write(out);
};

// テストから import したときは動かさない（ほかの Hook と同じ書き方）
if (process.argv[1] && process.argv[1].replace(/\\/g, "/").endsWith("japanese-reminder.mjs")) {
  main().catch(() => {
    // 失敗しても道具の結果を止めない
  });
}

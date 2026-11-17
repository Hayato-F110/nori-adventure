// Stop の Hook：応答の最後の文章で、裏の作業（CI・レビュー・長い処理）を待つと書いたのに、
// 「待つ間に進める課題：」の行がなければ止める（終了コード 2）。
// 理由：CLAUDE.md「CI・マージを待たない」「応答を遅くしない」は、待つ間に進める課題を伝えて進めることを求める。
//       2026-11-15 に、待つとだけ書いて止まった（再発）。オーナーがこの Hook を承認した。
// 進める課題が本当にないときは「待つ間に進める課題：なし（理由）」と書けば通す。理由のない「なし」は止める。
// 同じ止め方を続けないよう、止めたあとの再実行（stop_hook_active）では止めない。

const BLOCK = 2;

// 裏の作業を待つ言葉
const WAITING = /裏で|見張|待ちます|待っています|待っている|届いたら|終わったら|緑なら|待ち（|の待ち/;
// 待つ間に進める課題の行（「なし」なら、すぐあとに理由のかっこが要る）
const NEXT = /待つ間に進める課題[：:]\s*(.+)/;

/** 止める理由（文字列）か、止めないなら null */
export const findWaitWithoutNext = (text) => {
  if (typeof text !== "string" || text === "") return null;
  const plain = text.replace(/```[\s\S]*?```/g, "").replace(/`[^`\n]*`/g, "");
  if (!WAITING.test(plain)) return null;
  const m = plain.match(NEXT);
  if (m === null) return "待つと書いたのに、「待つ間に進める課題：」の行がない";
  const next = m[1].trim();
  if (/^なし\s*$/.test(next) || /^なし[^（(]/.test(next))
    return "「待つ間に進める課題：なし」に理由（かっこ）がない";
  return null;
};

const readStdin = async () => {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
};

const main = async () => {
  const input = JSON.parse((await readStdin()) || "{}");
  if (input.stop_hook_active) return;
  const reason = findWaitWithoutNext(input.last_assistant_message);
  if (reason === null) return;
  process.stderr.write(
    `止めました：${reason}（CLAUDE.md「CI・マージを待たない」「応答を遅くしない」）。` +
      "「待つ間に進める課題：〜」を1行書き、その課題をすぐ進めてください。" +
      "本当にないときは「待つ間に進める課題：なし（理由）」と書いてください。\n",
  );
  process.exit(BLOCK);
};

// テストから import したときは動かさない（ほかの Hook と同じ書き方）
if (process.argv[1] && process.argv[1].replace(/\\/g, "/").endsWith("wait-needs-next.mjs")) {
  main().catch((error) => {
    // 読めないときは通す（応答を止め続けないため）
    console.error(`wait-needs-next を実行できませんでした（通します）：${error.message}`);
  });
}

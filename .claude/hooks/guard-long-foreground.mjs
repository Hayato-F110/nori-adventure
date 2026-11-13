// PreToolUse の Hook：長い処理（E2E・npm run check・CI の見張り）を、裏で動かす指定（run_in_background）なしに
// 呼ぼうとしたら、実行の前に止める（スプリント2のふりかえりの改善②。2026-11-13 にオーナーが承認）。
// 理由：表で流すと、終わるまで（数分〜20 分）オーナーのメッセージに答えられない。
//       「まだ?」「今は何の作業中?」と聞かれた（スプリント2で 12 / 19 件の指摘が、状況が見えない・待っていた）。
//       CLAUDE.md の「応答を遅くしない」に書くだけでは止まらなかったので、仕組みで止める。
// 止めたら、標準エラーの文が Claude に渡る（終了コード 2）。

const BLOCK = 2;

// コマンドの先頭（行頭・; && || | ( のあと）にある呼び出しだけを見る。コミットの文などの説明の中の言葉では止めない
const AT_COMMAND = String.raw`(?:^|[;&|(]\s*|\n\s*)`;
// 前に付く環境変数（CI=1 など）・cd は飛ばす
const PREFIX = String.raw`(?:[A-Za-z_][A-Za-z0-9_]*=\S*\s+)*`;

const LONG_COMMANDS = [
  [new RegExp(AT_COMMAND + PREFIX + String.raw`npm\s+run\s+(?:check|e2e)\b`), "npm run check / e2e"],
  [new RegExp(AT_COMMAND + PREFIX + String.raw`npx\s+playwright\s+test\b`), "playwright test"],
  [
    new RegExp(AT_COMMAND + PREFIX + String.raw`gh\s+(?:pr\s+checks\b[^\n;&|]*--watch|run\s+watch)\b`),
    "CI の見張り",
  ],
];

/** 止める理由（文字列）か、止めないなら null */
export const findLongForeground = (command, background) => {
  if (background === true || typeof command !== "string") return null;
  // heredoc（<<'EOF' 〜 EOF）の中身はコミットの文などの文章なので、見る前に取り除く
  const code = command.replace(/<<-?\s*['"]?(\w+)['"]?[^\n]*\n[\s\S]*?\n\s*\1(?=\n|$)/g, "<<heredoc");
  for (const [pattern, label] of LONG_COMMANDS) {
    if (pattern.test(code)) return label;
  }
  return null;
};

const readStdin = async () => {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
};

const main = async () => {
  const input = JSON.parse((await readStdin()) || "{}");
  if (!["Bash", "PowerShell"].includes(input.tool_name)) return;
  const reason = findLongForeground(input.tool_input?.command, input.tool_input?.run_in_background);
  if (reason === null) return;
  process.stderr.write(
    `止めました：${reason} は長い処理です。run_in_background: true で裏で動かし、記録はファイルに残してください。` +
      "待つ間に、オーナーへ「何を・いつまでに」を1行で伝え、ほかの作業を進めます（CLAUDE.md「応答を遅くしない」）。" +
      "コミットの前の確かめは、型の検査と関係するテストだけ（npm run typecheck・npm test -- <ファイル>）で表でよい。\n",
  );
  process.exit(BLOCK);
};

// テストから import したときは動かさない（guard-inline-backslash.mjs と同じ書き方）
if (process.argv[1] && process.argv[1].replace(/\\/g, "/").endsWith("guard-long-foreground.mjs")) {
  main().catch((error) => {
    // 入力を読めないときは通す（この Hook は進め方の決まりで、秘密を守るものではないため）
    console.error(`guard-long-foreground を実行できませんでした（通します）：${error.message}`);
  });
}

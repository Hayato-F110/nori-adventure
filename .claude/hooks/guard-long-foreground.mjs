// PreToolUse の Hook：長い処理（E2E・npm run check・CI の見張り）を、裏で動かす指定（run_in_background）なしに
// 呼ぼうとしたら、実行の前に止める（スプリント2のふりかえりの改善②。2026-11-13 にオーナーが承認）。
// 理由：表で流すと、終わるまで（数分〜20 分）オーナーのメッセージに答えられない。
//       「まだ?」「今は何の作業中?」と聞かれた（スプリント2で 12 / 19 件の指摘が、状況が見えない・待っていた）。
//       CLAUDE.md の「応答を遅くしない」に書くだけでは止まらなかったので、仕組みで止める。
// 止めたら、標準エラーの文が Claude に渡る（終了コード 2）。

const BLOCK = 2;

// コマンドの先頭（行頭・; && || | ( { のあと）にある呼び出しだけを見る。コミットの文などの説明の中の言葉では止めない
const AT_COMMAND = String.raw`(?:^|[;&|({]\s*|\n\s*)`;
// 前に付く環境変数（CI=1 など）と、命令を包むだけの time・env・command は飛ばす（NORI-92 の /code-review の指摘 2）
const PREFIX = String.raw`(?:(?:[A-Za-z_][A-Za-z0-9_]*=\S*|time|env|command)\s+)*`;

const LONG_COMMANDS = [
  [new RegExp(AT_COMMAND + PREFIX + String.raw`npm\s+run\s+(?:check|e2e)\b`), "npm run check / e2e"],
  [new RegExp(AT_COMMAND + PREFIX + String.raw`npx\s+playwright\s+test\b`), "playwright test"],
  [
    new RegExp(AT_COMMAND + PREFIX + String.raw`gh\s+(?:pr\s+checks\b[^\n;&|]*--watch|run\s+watch)\b`),
    "CI の見張り",
  ],
];

// 見る前に整える：
// - heredoc（<<'EOF' 〜 EOF）の中身はコミットの文などの文章なので取り除く。ただし bash・sh・pwsh などのシェルに渡す
//   heredoc は中身が命令なので残す（NORI-92 の /code-review の指摘 3）
// - 行の終わりの \ による行の続きは 1 行につなぐ（指摘 2）
const SHELL_BEFORE_HEREDOC = /\b(?:ba|z)?sh(?:\.exe)?\b[^\n]*$|\b(?:pwsh|powershell)(?:\.exe)?\b[^\n]*$/i;
const normalize = (command) =>
  command
    .replace(/<<-?\s*['"]?(\w+)['"]?[^\n]*\n[\s\S]*?\n\s*\1(?=\n|$)/g, (match, _tag, offset) => {
      const before = command.slice(command.lastIndexOf("\n", offset - 1) + 1, offset);
      return SHELL_BEFORE_HEREDOC.test(before) ? match : "<<heredoc";
    })
    .replace(/\\\r?\n\s*/g, " ");

// NORI-92：npm run check の出力をパイプ（| 。|| は除く）で別の命令につなぐもの。同じ命令の中（; && || 改行の前）だけを見る。
// 2>&1・&> の & は区切りではないので、命令の続きとして読む
const REDIRECT_OR_ARG = String.raw`(?:[^\n;&|]|[0-9]?>&[0-9]?|&>)*`;
const CHECK_PIPES = [
  new RegExp(AT_COMMAND + PREFIX + String.raw`npm\s+run\s+check\b` + REDIRECT_OR_ARG + String.raw`\|(?!\|)`),
  // { npm run check; } 2>&1 | tail ・ ( npm run check ) | tail のように、まとめた命令の出力をつなぐもの（指摘 2）
  new RegExp(
    String.raw`[({](?:[^(){}]*[;&\n])?\s*` +
      PREFIX +
      String.raw`npm\s+run\s+check\b[^(){}]*[)}]` +
      REDIRECT_OR_ARG +
      String.raw`\|(?!\|)`,
  ),
];
// 命令としての set で pipefail を入れたもの（set -o pipefail・set -euo pipefail・set -o errexit -o pipefail。
// set +o pipefail は外すので数えない）。パイプより前にあるときだけ通す（指摘 1・4）
const PIPEFAIL = new RegExp(AT_COMMAND + String.raw`set\s+((?:[^\n;&|])*?)\bpipefail\b`, "g");
// 限界：bash -c "npm run check | tail" のように引用の中で別のシェルに渡すものは見ない（引用の中は文章と区別できないため）

/** npm run check をパイプにつないでいれば止める理由（文字列）、なければ null。裏で動かすかどうかによらない */
export const findCheckPipe = (command) => {
  if (typeof command !== "string") return null;
  const code = normalize(command);
  const at = Math.min(...CHECK_PIPES.map((p) => code.search(p)).filter((i) => i >= 0));
  if (!Number.isFinite(at)) return null;
  for (const m of code.matchAll(PIPEFAIL)) {
    if (m.index < at && !/\+o\s*$/.test(m[1])) return null;
  }
  return "npm run check をパイプ（|）につないでいる";
};

/** 止める理由（文字列）か、止めないなら null */
export const findLongForeground = (command, background) => {
  if (background === true || typeof command !== "string") return null;
  const code = normalize(command);
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
  const pipe = findCheckPipe(input.tool_input?.command);
  if (pipe !== null) {
    process.stderr.write(
      `止めました：${pipe}。終了コードがパイプの最後の命令（tail など）のものになり、検査が落ちても 0（緑）に見えます（NORI-92）。` +
        '出力はファイルに書き、終了コードを見てから、ファイルを読んでください。Bash：npm run check > "$TEMP/check.txt" 2>&1; echo "exit=$?"。' +
        'PowerShell：npm run check *> "$env:TEMP\\check.txt"; "exit=$LASTEXITCODE"。npm run check は長い処理なので、run_in_background: true で裏で動かします。\n',
    );
    process.exit(BLOCK);
  }
  const reason = findLongForeground(input.tool_input?.command, input.tool_input?.run_in_background);
  if (reason === null) return;
  process.stderr.write(
    `止めました：${reason} は長い処理です。run_in_background: true で裏で動かし、記録はファイルに残してください。` +
      "待つ間に、オーナーへ「何を・いつまでに」と「待つ間に進める課題」を1行で伝え、その課題を進めます（CLAUDE.md「応答を遅くしない」）。" +
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

// PreToolUse の Hook：git の確認の仕組みを飛ばす指定（--no-verify・commit の -n・--no-gpg-sign・
// -c commit.gpgsign=false）を見つけたら、実行の前に止める。
// 理由：2026-11-15 にコミットへ --no-verify を付けた（決まりは「確認の仕組みを飛ばさない。オーナーが頼んだときだけ」）。
//       オーナーがこの Hook を承認した。飛ばしたいときは、オーナーに頼まれてから、オーナーが自分で実行する。
// 止めたら、標準エラーの文が Claude に渡る（終了コード 2）。

const BLOCK = 2;

/** ヒアドキュメントの中身と、引用符の中の文を消す（コミットの文の中の言葉では止めない） */
const stripText = (command) => {
  const lines = command.split("\n");
  const kept = [];
  let end = null;
  for (const line of lines) {
    if (end !== null) {
      if (line.trim() === end) end = null;
      continue;
    }
    kept.push(line);
    const m = line.match(/<<-?\s*['"]?(\w+)['"]?/);
    if (m) end = m[1];
  }
  return kept
    .join("\n")
    .replace(/"(?:[^"\\]|\\.)*"/g, '""')
    .replace(/'[^']*'/g, "''");
};

/** 止める理由（文字列）か、止めないなら null */
export const findSkippedCheck = (command) => {
  if (typeof command !== "string") return null;
  const segments = stripText(command).split(/;|&&|\|\||\||\n/);
  for (const segment of segments) {
    const tokens = segment.trim().split(/\s+/).filter(Boolean);
    const at = tokens.findIndex((t) => /^git(?:\.exe)?$/i.test(t));
    if (at === -1) continue;
    // git の前の指定（-C 場所・-c 名前=値）と、サブコマンド
    let i = at + 1;
    while (i < tokens.length && tokens[i].startsWith("-")) {
      const opt = tokens[i];
      if (opt === "-c" && /^commit\.gpgsign=(false|no|off|0)$/i.test(tokens[i + 1] ?? "")) {
        return "-c commit.gpgsign=false（署名を飛ばす）";
      }
      i += opt === "-C" || opt === "-c" ? 2 : 1;
    }
    const sub = tokens[i];
    const rest = tokens.slice(i + 1);
    if (rest.includes("--no-verify")) return "--no-verify（コミット前・push 前の確認を飛ばす）";
    if (rest.includes("--no-gpg-sign")) return "--no-gpg-sign（署名を飛ばす）";
    if (sub === "commit" && rest.some((t) => /^-[A-Za-z]*n[A-Za-z]*$/.test(t))) {
      return "commit の -n（--no-verify と同じ）";
    }
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
  const reason = findSkippedCheck(input.tool_input?.command);
  if (reason === null) return;
  process.stderr.write(
    `止めました：${reason} があります。確認の仕組みは飛ばさない決まりです（CLAUDE.md・Git の決まり）。` +
      "指定を外して実行してください。確認が落ちたら、飛ばさずに原因を直してください。\n",
  );
  process.exit(BLOCK);
};

// テストから import したときは動かさない（ほかの Hook と同じ書き方）
if (process.argv[1] && process.argv[1].replace(/\\/g, "/").endsWith("guard-no-verify.mjs")) {
  main().catch((error) => {
    process.stderr.write(`guard-no-verify の Hook でエラー：${error}\n`);
    process.exit(1);
  });
}

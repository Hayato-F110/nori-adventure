// PreToolUse の Hook：ファイル・ブランチを消す操作、履歴を書き換える操作を見つけたら、オーナーに確認を出す
// （permissionDecision: "ask"。auto モードでも確認の画面が出る。2026-11-15 にオーナーが承認）。
// 理由：11/15 に `rm -f` で1つのファイルを承認なしで消した（settings.json の ask は rm -rf・rm -r だけだった）。
//       CLAUDE.md「必ず止まってオーナーの承認をもらう」の1を、書くだけでなく仕組みで止める。
// 通すもの（CLAUDE.md の例外）：git branch -d、git push origin --delete、cmd /c rmdir（/s なし。ジャンクションを外す）、
//       git worktree remove（--force なし）。
// 公式：https://code.claude.com/docs/en/hooks （PreToolUse の hookSpecificOutput.permissionDecision）

// コマンドの先頭：行頭・; & | ( ` のあと・シェルに渡す文字列（-c '…'、-Command "…"）の始め・find -exec・xargs のあと
const AT_COMMAND = String.raw`(?:^|[;&|(\x60\n]\s*|\s(?:-c|-Command)\s+["']\s*|\s-exec\s+|\bxargs(?:\s+-\S+)*\s+)`;
// 前に付く環境変数（X=1 など）と、別のコマンドを動かすだけのもの（sudo など）は飛ばす
const PREFIX = String.raw`(?:[A-Za-z_][A-Za-z0-9_]*=\S*\s+)*(?:(?:sudo|env|command|exec|nohup|time)\s+)*`;
// 1つのコマンドの中（次の区切りまで）
const ARGS = String.raw`[^\n;&|]*`;
const CMD_C = String.raw`(?:cmd(?:\.exe)?\s+/[cC]\s+)?`;

const at = (body, flags = "") => new RegExp(AT_COMMAND + PREFIX + body, flags);

// Bash と PowerShell の両方で見るもの（git と cmd）
const COMMON = [
  [at(CMD_C + String.raw`(?:rmdir|rd)\b${ARGS}\s/[sS]\b`, "i"), "rmdir /s"],
  [at(String.raw`cmd(?:\.exe)?\s+/[cC]\s+(?:del|erase)\b`, "i"), "del"],
  [at(String.raw`git\s+rm\b(?!${ARGS}\s--cached\b)`), "git rm"],
  [
    at(
      String.raw`git\s+branch\b(?=${ARGS}\s(?:-[a-zA-Z]*D\b|--force\b|-f\b))(?=${ARGS}\s(?:-[a-zA-Z]*[dD]\b|--delete\b))`,
    ),
    "git branch -D",
  ],
  [at(String.raw`git\s+push\b${ARGS}\s(?:--force(?:-with-lease)?\b|-[a-zA-Z]*f\b|\+\S)`), "git push --force"],
  [at(String.raw`git\s+reset\b${ARGS}\s--hard\b`), "git reset --hard"],
  [at(String.raw`git\s+clean\b(?!${ARGS}\s(?:-[a-zA-Z]*n\b|--dry-run\b))`), "git clean"],
  [at(String.raw`git\s+worktree\s+remove\b${ARGS}\s(?:--force\b|-f\b)`), "git worktree remove --force"],
];

const BASH = [
  [at(String.raw`rm\b`), "rm"],
  [at(String.raw`unlink\b`), "unlink"],
  [at(String.raw`find\b${ARGS}\s-delete\b`), "find -delete"],
];

// PowerShell では rm・del・rd・rmdir・ri・erase はどれも Remove-Item の別名（中身ごと消せる）
const POWERSHELL = [[at(String.raw`(?:Remove-Item|rm|del|ri|rd|rmdir|erase)\b`, "i"), "Remove-Item"]];

const SHELL = /(?:^|[\s;&|(])(?:bash|sh|zsh|pwsh|powershell)(?:\.exe)?\b/;

// heredoc（<<'EOF' 〜 EOF）は、コミットの文など文章なら取り除く。シェルに渡すもの（bash <<EOF）は実行されるので残す
const stripHeredocs = (command) =>
  command.replace(
    /([^\n]*?)<<-?\s*['"]?(\w+)['"]?([^\n]*)\n([\s\S]*?)\n\s*\2(?=\n|$)/g,
    (_all, before, _tag, rest, body) =>
      SHELL.test(before) ? `${before}${rest}\n${body}` : `${before}<<heredoc${rest}`,
  );

// PowerShell の here-string（@' 〜 '@）は文章なので取り除く
const stripHereStrings = (command) => command.replace(/@(['"])\r?\n[\s\S]*?\r?\n\1@/g, "@''@");

/** 見つけた操作の名前（文字列）か、なければ null */
export const findDestructive = (command, toolName) => {
  if (typeof command !== "string") return null;
  let patterns;
  let code;
  if (toolName === "Bash") {
    patterns = [...COMMON, ...BASH];
    code = stripHeredocs(command);
  } else if (toolName === "PowerShell") {
    // 別名（del など）は Remove-Item として知らせるので、先に見る
    patterns = [...POWERSHELL, ...COMMON];
    code = stripHereStrings(command);
  } else {
    return null;
  }
  for (const [pattern, label] of patterns) {
    if (pattern.test(code)) return label;
  }
  return null;
};

const ask = (reason) => {
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "ask",
        permissionDecisionReason: reason,
      },
    }),
  );
};

const readStdin = async () => {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
};

const main = async () => {
  const input = JSON.parse((await readStdin()) || "{}");
  const found = findDestructive(input.tool_input?.command, input.tool_name);
  if (found === null) return;
  ask(
    `${found} は、ファイル・ブランチを消すか履歴を書き換える操作です（CLAUDE.md「必ず止まってオーナーの承認をもらう」の1）。` +
      "オーナーが確かめてから実行します。",
  );
};

// テストから import したときは動かさない（guard-long-foreground.mjs と同じ書き方）
if (process.argv[1] && process.argv[1].replace(/\\/g, "/").endsWith("guard-delete.mjs")) {
  main().catch((error) => {
    // 入力を読めないときは、通さずに確認を出す（消す操作を守る Hook なので、安全な側に倒す）
    ask(`guard-delete が入力を読めませんでした（${error.message}）。念のため確認します。`);
  });
}

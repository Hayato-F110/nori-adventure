// PreToolUse の Hook：秘密情報へのアクセスと、秘密情報の書き込みを、ツールの実行前に止める。
// 1) パス：.env・鍵・~/.ssh・~/.aws・secrets/ を読む・書く・コマンドで触る操作を止める
// 2) 内容：Write/Edit で書き込む文字列に、APIキーやトークンらしい文字列があれば止める
// 文字列での判定は完全ではない（変数で組み立てたパスは見抜けない）。permissions の deny と併用する。
// kids-play（2026年10月）の Hook をもとにしている。
import { homedir } from "node:os";
import path from "node:path";

// 終了コード2で終わると、Claude Code はツールの実行を止め、標準エラーの文を Claude に渡す
const BLOCK = 2;

const toSlash = (text) => text.replace(/\\/g, "/");

const readStdin = async () => {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
};

// 守る対象のパスなら理由を返し、そうでなければ null を返す
export const findPathReason = (pathLike, cwd, root) => {
  const expanded = toSlash(pathLike).replace(/^~(?=\/|$)/, toSlash(homedir()));
  // Windows はファイル名の大文字と小文字を区別しないので、小文字にそろえて比べる
  const absolute = toSlash(path.resolve(cwd, expanded)).toLowerCase();
  const segments = absolute.split("/");
  const base = segments.at(-1) ?? "";

  // env.example（先頭ドットなし）は設定の見本なので通す
  if (base === ".env" || base.startsWith(".env.")) return "環境変数のファイル（.env）";
  if (/\.(pem|key|p12|pfx)$/.test(base)) return "鍵のファイル";
  if (/^id_(rsa|ed25519)/.test(base)) return "SSHの鍵";
  if (segments.includes(".ssh") || segments.includes(".aws")) return "SSH・AWSの認証情報";

  const relative = toSlash(path.relative(root, path.resolve(cwd, expanded))).toLowerCase();
  if (/^secrets(\/|$)/.test(relative)) return "秘密情報のフォルダ";
  return null;
};

// 書き込む内容に含まれる、秘密情報らしい文字列のパターン
const SECRET_PATTERNS = [
  [/AKIA[0-9A-Z]{16}/, "AWS のアクセスキー"],
  [/\bgh[pousr]_[A-Za-z0-9]{36,}\b/, "GitHub のトークン"],
  [/\bgithub_pat_[A-Za-z0-9_]{40,}\b/, "GitHub のトークン"],
  [/\bsk-ant-[A-Za-z0-9_-]{20,}/, "Anthropic の APIキー"],
  [/\bsk-[A-Za-z0-9]{32,}\b/, "APIキー"],
  [/\bAIza[0-9A-Za-z_-]{35}\b/, "Google の APIキー"],
  [/\bxox[baprs]-[A-Za-z0-9-]{10,}/, "Slack のトークン"],
  [/\bATATT[A-Za-z0-9_=-]{20,}/, "Atlassian の APIトークン"],
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, "秘密鍵"],
];

export const findSecretInText = (text) => {
  for (const [pattern, label] of SECRET_PATTERNS) {
    if (pattern.test(text)) return label;
  }
  return null;
};

// ツールごとに、パスとして調べる文字列を取り出す
const collectPathCandidates = (toolName, toolInput) => {
  if (toolName === "Bash" || toolName === "PowerShell") {
    // 引用符や区切り記号で分け、1語ずつパスとして調べる
    return String(toolInput.command ?? "").split(/[\s"'`;|&()<>=,]+/);
  }
  // Grep の pattern は探す文字列なので調べない（「.env」という語を文書から探すのは問題ない）
  const keys = toolName === "Grep" ? ["path", "glob"] : ["file_path", "path", "pattern"];
  return keys.map((key) => toolInput[key]).filter((value) => typeof value === "string");
};

const collectWrittenText = (toolName, toolInput) => {
  if (toolName === "Write") return [toolInput.content];
  if (toolName === "Edit") return [toolInput.new_string];
  if (toolName === "MultiEdit") return (toolInput.edits ?? []).map((edit) => edit.new_string);
  if (toolName === "Bash" || toolName === "PowerShell") return [toolInput.command];
  return [];
};

const main = async () => {
  const input = JSON.parse(await readStdin());
  const cwd = input.cwd ?? process.cwd();
  const root = process.env.CLAUDE_PROJECT_DIR ?? cwd;
  const toolName = input.tool_name;
  const toolInput = input.tool_input ?? {};

  for (const candidate of collectPathCandidates(toolName, toolInput)) {
    if (candidate === "") continue;
    const reason = findPathReason(candidate, cwd, root);
    if (reason !== null) {
      console.error(
        `ブロックしました：${reason}には、Claudeからアクセスしない決まりです（対象：${candidate}）`,
      );
      process.exit(BLOCK);
    }
  }

  for (const text of collectWrittenText(toolName, toolInput)) {
    if (typeof text !== "string") continue;
    const label = findSecretInText(text);
    if (label !== null) {
      console.error(
        `ブロックしました：${label}らしい文字列が含まれています。秘密情報はファイルやコマンドに書かない決まりです。` +
          "本物なら、すぐに作り直す（ローテーション）ようオーナーに知らせてください。",
      );
      process.exit(BLOCK);
    }
  }
};

// テストから import されたときは実行しない
if (process.argv[1] && toSlash(process.argv[1]).endsWith("protect-secrets.mjs")) {
  main().catch((error) => {
    // 入力を読めないときは、安全側に倒して止める（fail-safe）
    console.error(`protect-secrets の実行に失敗したため、止めました：${error.message}`);
    process.exit(BLOCK);
  });
}

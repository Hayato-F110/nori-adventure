// PreToolUse の Hook：シェルから渡すインラインのコード（python -c・python - <<EOF・node -e など）に、
// Windows のパス（C:\...）や正規表現（\s \d \w）のバックスラッシュがあれば、実行の前に止める。
// 理由：シェルとインタプリタの2段で解釈され、バックスラッシュが消えたり（11/7 に4回）、
//       Python の文字列で "\N" がエラーになったりする（11/10 に2回）。こうした書き換えは Edit の道具で行う。
// 止めたら、標準エラーの文が Claude に渡る（終了コード 2）。

const BLOCK = 2;

// インタプリタにコードを直接渡す書き方（ファイルを実行する書き方は対象外）
// コマンドの先頭（行頭・; && || | ( のあと）にある呼び出しだけを見る。コミットの文などの説明の中の言葉では止めない
const AT_COMMAND = String.raw`(?:^|[;&|(]\s*|\n\s*)`;
const INLINE_CODE = [
  new RegExp(AT_COMMAND + String.raw`python[0-9.]*(?:\.exe)?(?:\s+-[A-Za-z]+(?:\s+\w+)?)*\s+-c\s+["']`, "i"), // python -c "..."
  new RegExp(
    AT_COMMAND + String.raw`python[0-9.]*(?:\.exe)?(?:\s+-[A-Za-z]+(?:\s+\w+)?)*\s+-?\s*<<-?\s*['"]?\w+`,
    "i",
  ), // python - <<EOF
  new RegExp(AT_COMMAND + String.raw`node(?:\.exe)?\s+(?:-e|-p|--eval|--print)\s+["']`, "i"), // node -e "..."
];

// 危ないバックスラッシュ：ドライブのパス（C:\）、大文字が続くもの（\N \U など。Python ではエラーや別の意味）、
// 正規表現の \s \d \w \b（シェルを通ると消えることがある）
const RISKY_BACKSLASH = [
  [/[A-Za-z]:\\/, "Windows のパス（C:\\...）"],
  [/\\[A-Z]/, "大文字が続くバックスラッシュ（\\N・\\U など）"],
  [/\\[sdwb](?![a-z])/, "正規表現のバックスラッシュ（\\s・\\d・\\w・\\b）"],
];

/** 止める理由（文字列）か、止めないなら null */
export const findInlineBackslashRisk = (command) => {
  if (typeof command !== "string") return null;
  if (!INLINE_CODE.some((pattern) => pattern.test(command))) return null;
  for (const [pattern, label] of RISKY_BACKSLASH) {
    if (pattern.test(command)) return label;
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
  const reason = findInlineBackslashRisk(input.tool_input?.command);
  if (reason === null) return;
  process.stderr.write(
    `止めました：インラインのコード（python -c・python - <<・node -e）に ${reason} があります。` +
      "シェルとインタプリタの2段で解釈されて壊れます。ファイルの書き換えは Edit の道具で、" +
      "コードを動かすならスクリプトをファイル（tmp/ など）に書いてから実行してください。\n",
  );
  process.exit(BLOCK);
};

// テストから import したときは動かさない（protect-secrets.mjs と同じ書き方）
if (process.argv[1] && process.argv[1].replace(/\\/g, "/").endsWith("guard-inline-backslash.mjs")) {
  main().catch((error) => {
    // 入力を読めないときは通す（この Hook は事故の防止で、秘密を守るものではないため）
    console.error(`guard-inline-backslash を実行できませんでした（通します）：${error.message}`);
  });
}

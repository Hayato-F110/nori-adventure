// PreToolUse の Hook（Bash・PowerShell）：コードを変える PR を出す前に、Claude が自分で /code-review を呼んだかを確かめる。
// 決まり：CLAUDE.md「進め方」の「コードを変える PR は、出す前に Claude が自分で /code-review を呼ぶ」（2026-11-16）。
// gh pr create のとき、PR のブランチと origin/main の差分に src/・e2e/・tests/・tools/・.claude/hooks/ のファイルがあれば、
// 会話の記録（ファイル全体）で、その場所の最後のコミットのあとに、その場所で成功した code-review の呼び出しがあるかを見る。
// なければ止める（終了コード 2）。記録にその場所のコミットがなければ、その場所のレビューが 1 つあれば通す。
// 差分が取れないとき（origin/main がないなど）は止めずに通し、通したことを Claude に知らせる（Hook の故障で PR を止めない）。
// テストの一覧：docs/test-plans/NORI-78.md の 4〜7。
// 見ないもの：指摘を仕分けて PR の説明に書いたか（人が見る）、merge・pull で足したコミット（レビュー済みのほかの PR）。

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";

const BLOCK = 2;
const CODE_DIRS = ["src/", "e2e/", "tests/", "tools/", ".claude/hooks/"];
// コマンドの位置（行の頭か ; & | ( のあと）。前に付けた環境の指定（GH_PROMPT_DISABLED=1 など）も許す
const AT_COMMAND = String.raw`(?:^|[;&|\n(]\s*)(?:[A-Za-z_]\w*=\S*\s+)*`;
const PATH_ARG = String.raw`("([^"]+)"|'([^']+)'|(\S+?))`;
// git と commit の間の指定（-C 場所、-c 設定、--no-pager など）
const GIT_OPTS = String.raw`((?:\s+(?:-C\s+(?:"[^"]+"|'[^']+'|\S+)|-c\s+\S+|--[\w-]+(?:=\S+)?))*)`;

export const isCodeFile = (file) => CODE_DIRS.some((d) => String(file).replace(/\\/g, "/").startsWith(d));

/** heredoc（<<'EOF' … EOF）と PowerShell のヒアストリング（@' … '@）の中身を取り除く（中の語をコマンドとみなさない） */
export const stripQuoted = (command) =>
  String(command ?? "")
    .replace(/<<-?\s*(['"]?)(\w+)\1[^\n]*\n[\s\S]*?\n\s*\2[ \t]*(?=\n|$)/g, "")
    .replace(/@(['"])\r?\n[\s\S]*?\r?\n\1@/g, "");

/**
 * 場所を「c:/a/b」の形にそろえる（小文字・/ 区切り）。Git Bash の「/c/a」も「c:/a」とみなす。
 * Node の path.resolve は OS で結果が変わる（CI は Linux）ので使わず、Windows の書き方として扱う
 */
const slash = (p) =>
  String(p ?? ".")
    .replace(/\\/g, "/")
    .replace(/^\/([a-zA-Z])(?=\/|$)/, "$1:");
const isAbs = (p) => /^[a-zA-Z]:(\/|$)/.test(p) || p.startsWith("/");
const resolveIn = (base, p) => {
  const s = slash(p);
  const full = isAbs(s) ? s : `${slash(base)}/${s}`;
  return path.posix.normalize(full).replace(/(.)\/$/, "$1");
};
const norm = (p) => resolveIn(".", p).toLowerCase();
const unquote = (m) => m?.[2] ?? m?.[3] ?? m?.[4] ?? m?.[1] ?? null;

/** コマンドの先頭の cd X && ／ cd X; ／ Set-Location X; ／ Push-Location X; の場所（なければ null） */
const leadingDir = (command) => {
  const m = String(command ?? "").match(
    new RegExp(String.raw`^\s*(?:cd|Set-Location|Push-Location|sl|pushd)\s+${PATH_ARG}\s*(?:&&|;)`, "i"),
  );
  return m ? unquote(m) : null;
};

export const isPrCreate = (command) =>
  new RegExp(`${AT_COMMAND}gh\\s+pr\\s+create\\b`, "m").test(stripQuoted(command));

/** PR のブランチの場所（先頭の cd などか、入力の cwd）と、--head で指したブランチ */
export const prPlace = (command, cwd) => {
  const s = stripQuoted(command);
  const dir = leadingDir(s);
  const m = s.match(/(?:--head[=\s]+|\s-H\s+)("([^"]+)"|'([^']+)'|(\S+))/);
  // owner:branch の形は、: のあとをブランチとする
  const head = m ? unquote(m).replace(/^[^:]*:/, "") : null;
  return { dir: norm(resolveIn(cwd ?? ".", dir ?? ".")), head };
};

/** コマンドがコミットなら、その場所（git -C、先頭の cd など、入力の cwd の順）。コミットでなければ null */
export const commitPlace = (command, cwd) => {
  const s = stripQuoted(command);
  const m = s.match(new RegExp(String.raw`${AT_COMMAND}git${GIT_OPTS}\s+commit\b`, "m"));
  if (m === null) return null;
  const base = resolveIn(cwd ?? ".", leadingDir(s) ?? ".");
  const c = unquote(String(m[1] ?? "").match(new RegExp(String.raw`-C\s+${PATH_ARG}(?=\s|$)`)));
  return norm(c === null ? base : resolveIn(base, c));
};

const isReview = (input) => {
  const name = String(input?.skill ?? "");
  return name === "code-review" || name.endsWith(":code-review");
};

/** 止めるか通すか。diffFiles が null なら差分が取れなかった（通して知らせる） */
export const reviewDecision = ({ command, cwd, entries, diffFiles }) => {
  if (!isPrCreate(command)) return { block: false, reason: "" };
  const place = prPlace(command, cwd).dir;
  if (diffFiles === null) {
    return {
      block: false,
      reason:
        "review-before-pr：PR の差分が取れなかったので、/code-review を呼んだかを確かめずに通しました。" +
        "コードを変える PR なら、出す前に /code-review を呼んだか確かめてください（CLAUDE.md「進め方」）。",
    };
  }
  const code = diffFiles.filter(isCodeFile);
  if (code.length === 0) return { block: false, reason: "" };

  const results = new Map(); // tool_use の id → エラーだったか
  for (const e of entries) {
    for (const c of Array.isArray(e?.message?.content) ? e.message.content : []) {
      if (c?.type === "tool_result") results.set(c.tool_use_id, c.is_error === true);
    }
  }
  let lastCwd = cwd;
  let lastCommit = -1;
  const reviews = [];
  entries.forEach((e, i) => {
    if (typeof e?.cwd === "string") lastCwd = e.cwd;
    const here = typeof e?.cwd === "string" ? e.cwd : lastCwd;
    for (const c of Array.isArray(e?.message?.content) ? e.message.content : []) {
      if (c?.type !== "tool_use") continue;
      if ((c.name === "Bash" || c.name === "PowerShell") && commitPlace(c.input?.command, here) === place)
        lastCommit = i;
      if (
        c.name === "Skill" &&
        isReview(c.input) &&
        results.get(c.id) === false &&
        norm(here ?? ".") === place
      ) {
        reviews.push(i);
      }
    }
  });
  const ok = lastCommit >= 0 ? reviews.some((i) => i > lastCommit) : reviews.length > 0;
  if (ok) return { block: false, reason: "" };
  return {
    block: true,
    reason:
      "止めました：コードを変える PR です（例：" +
      code.slice(0, 3).join("、") +
      "）。この場所の最後のコミットのあとに /code-review を呼んでいません（CLAUDE.md「進め方」：" +
      "コードを変える PR は、出す前に Claude が自分で /code-review を呼ぶ）。\n" +
      "PR のブランチの場所（worktree）に移ってから、Skill の道具で code-review を呼び" +
      "（ほかの場所で呼んだレビューは数えません）、指摘を「直す／直さない（理由）」に仕分けて PR の説明に書いてから、" +
      "もう一度 gh pr create を流してください。\n",
  };
};

const readStdin = async () => {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
};

const main = async () => {
  const input = JSON.parse((await readStdin()) || "{}");
  if (input.tool_name !== "Bash" && input.tool_name !== "PowerShell") return;
  const command = String(input.tool_input?.command ?? "");
  if (!isPrCreate(command)) return;
  const cwd = typeof input.cwd === "string" ? input.cwd : process.cwd();
  const { dir, head } = prPlace(command, cwd);
  let diffFiles = null;
  try {
    diffFiles = execFileSync("git", ["-C", dir, "diff", "--name-only", `origin/main...${head ?? "HEAD"}`], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    })
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
  } catch {
    diffFiles = null;
  }
  let entries = [];
  if (typeof input.transcript_path === "string") {
    try {
      entries = readFileSync(input.transcript_path, "utf8")
        .split("\n")
        .flatMap((l) => {
          try {
            return [JSON.parse(l)];
          } catch {
            return [];
          }
        });
    } catch {
      entries = [];
    }
  }
  const d = reviewDecision({ command, cwd, entries, diffFiles });
  if (d.block) {
    process.stderr.write(d.reason);
    process.exit(BLOCK);
  }
  if (d.reason) {
    process.stdout.write(
      JSON.stringify({ hookSpecificOutput: { hookEventName: "PreToolUse", additionalContext: d.reason } }),
    );
  }
};

// テストから import したときは動かさない（ほかの Hook と同じ書き方）
if (process.argv[1] && process.argv[1].replace(/\\/g, "/").endsWith("review-before-pr.mjs")) {
  main().catch((error) => {
    // 読めないときは通す（PR の作成を Hook の故障で止めない）
    console.error(`review-before-pr を実行できませんでした（通します）：${error.message}`);
  });
}

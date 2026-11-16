import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
// @ts-expect-error -- Hook は素の JavaScript（.mjs）で、型定義を持たない（整形で行が分かれないよう、まとめて読む）
import * as hook_ from "../../.claude/hooks/review-before-pr.mjs";

// NORI-78 一覧 4〜7（docs/test-plans/NORI-78.md）：コードを変える PR は、出す前に Claude が自分で /code-review を呼ぶ
// （CLAUDE.md「進め方」）。最後のコミットのあとに、その場所で呼んでいなければ gh pr create を止める
type Entry = Record<string, unknown>;
type Decision = { block: boolean; reason: string };
const { isPrCreate, prPlace, commitPlace, reviewDecision } = hook_ as {
  isPrCreate: (command: string) => boolean;
  prPlace: (command: string, cwd: string) => { dir: string; head: string | null };
  commitPlace: (command: string, cwd: string) => string | null;
  reviewDecision: (o: {
    command: string;
    cwd: string;
    entries: Entry[];
    diffFiles: string[] | null;
  }) => Decision;
};

const root = path.resolve(import.meta.dirname, "../..");
const W = "C:\\repo\\.claude\\worktrees\\A"; // PR のブランチの場所
const OTHER = "C:\\repo\\.claude\\worktrees\\B";
const CODE = ["src/render/startGate.ts", "docs/test-plans/NORI-76.md"];
const DOCS = ["docs/devlog/2026-11-16.md", "CLAUDE.md", ".claude/skills/end-day/SKILL.md"];

let n = 0;
const tool = (name: string, input: object, cwd?: string): Entry => ({
  type: "assistant",
  ...(cwd === undefined ? {} : { cwd }),
  message: { role: "assistant", content: [{ type: "tool_use", id: `t${++n}`, name, input }] },
});
const ok = (e: Entry, isError = false): Entry => {
  const id = ((e["message"] as { content: { id: string }[] }).content[0] as { id: string }).id;
  return {
    type: "user",
    message: {
      role: "user",
      content: [
        { type: "tool_result", tool_use_id: id, content: "done", ...(isError ? { is_error: true } : {}) },
      ],
    },
  };
};
const bash = (command: string, cwd = W) => tool("Bash", { command }, cwd);
const ps = (command: string, cwd = W) => tool("PowerShell", { command }, cwd);
const review = (cwd = W, skill = "code-review") => tool("Skill", { skill, args: "medium" }, cwd);
const withResult = (e: Entry, isError = false) => [e, ok(e, isError)];
const decide = (
  entries: Entry[],
  diffFiles: string[] | null = CODE,
  command = "gh pr create --title t --body b",
) => reviewDecision({ command, cwd: W, entries, diffFiles });

describe("一覧 4：コードを変える PR を、最後のコミットのあとに /code-review を呼ばずに出すと止める", () => {
  it("コミットのあとにレビューがない：止め、コードのファイルの例と /code-review を知らせる", () => {
    const d = decide([...withResult(bash('git commit -q -m "x"'))]);
    expect(d.block).toBe(true);
    expect(d.reason).toContain("src/render/startGate.ts");
    expect(d.reason).toContain("/code-review");
  });

  it("レビューのあとにコミットを足した：止める", () => {
    const d = decide([
      ...withResult(bash("git commit -m a")),
      ...withResult(review()),
      ...withResult(bash("git commit -m b")),
    ]);
    expect(d.block).toBe(true);
  });

  it("結果がエラーのレビューは数えない", () => {
    const d = decide([...withResult(bash("git commit -m a")), ...withResult(review(), true)]);
    expect(d.block).toBe(true);
  });

  it("別のブランチの場所で呼んだレビューは数えない（R2-78-4）", () => {
    const d = decide([...withResult(bash("git commit -m a")), ...withResult(review(OTHER))]);
    expect(d.block).toBe(true);
  });

  it.each([
    ["git -C <場所> commit", `git -C "${W}" commit -m a`, OTHER],
    ["cd <場所> && git commit", `cd "${W}" && git commit -m a`, OTHER],
    ["PowerShell の Set-Location", `Set-Location "${W}"; git commit -m a`, OTHER],
  ])("コミットの場所を %s から決める", (_, command, cwd) => {
    expect(commitPlace(command, cwd)?.toLowerCase()).toBe(W.replaceAll("\\", "/").toLowerCase());
  });

  it("PowerShell の道具のコミットも数える（R1-78-1）", () => {
    const d = decide([...withResult(review()), ...withResult(ps("git commit -m a"))]);
    expect(d.block).toBe(true);
  });

  it.each([
    ["git -c 設定 commit", "git -c user.name=x commit -m a"],
    ["git --no-pager commit", "git --no-pager commit -m a"],
    ["git -C <場所> -c 設定 commit", `git -C "${W}" -c core.quotepath=false commit -m a`],
    ["環境の指定つき", "GIT_AUTHOR_DATE=2026-11-16 git commit -m a"],
  ])("%s もコミットとして数える（コードのレビュー 4・5）", (_, command) => {
    expect(commitPlace(command, W)).toBe(W.replaceAll("\\", "/").toLowerCase());
  });

  it("Git Bash の /c/ の書き方の場所も、同じ場所とみなす（コードのレビュー 2）", () => {
    expect(commitPlace('cd "/c/repo/.claude/worktrees/A" && git commit -m a', OTHER)).toBe(
      W.replaceAll("\\", "/").toLowerCase(),
    );
  });

  it("止める文で、その worktree に移ってから /code-review を呼ぶよう案内する（コードのレビュー 1）", () => {
    expect(decide([...withResult(bash("git commit -m a"))]).reason).toContain("worktree");
  });

  it("heredoc・ヒアストリングの中の「git commit」は、コミットとして数えない（R1-78-10）", () => {
    expect(commitPlace("cat > n.md <<'EOF'\ngit commit のやり方\nEOF", W)).toBeNull();
    expect(commitPlace("echo @'\ngit commit\n'@ | Out-File n.md", W)).toBeNull();
  });
});

describe("一覧 5：その場所で、最後のコミットのあとにレビューしていれば通す", () => {
  it("コミット → レビュー：通す", () => {
    expect(decide([...withResult(bash("git commit -m a")), ...withResult(review())]).block).toBe(false);
  });

  it("プラグインの名前付き（xxx:code-review）も数える（R1-78-9）", () => {
    const d = decide([
      ...withResult(bash("git commit -m a")),
      ...withResult(review(W, "plugin:code-review")),
    ]);
    expect(d.block).toBe(false);
  });

  it("記録にその場所のコミットがない：その場所のレビューがあれば通し、なければ止める（R2-78-3）", () => {
    expect(decide([...withResult(review())]).block).toBe(false);
    expect(decide([...withResult(bash("git commit -m a", OTHER))]).block).toBe(true);
    expect(decide([]).block).toBe(true);
  });

  it("cwd のない記録の行は、直前の cwd のある行の場所とみなす", () => {
    const r = review(W);
    delete r["cwd"];
    const d = decide([...withResult(bash("git commit -m a")), ...withResult(r)]);
    expect(d.block).toBe(false);
  });
});

describe("一覧 6：文書だけの PR、gh pr create 以外は止めない", () => {
  it("差分が文書だけなら通す", () => {
    expect(decide([...withResult(bash("git commit -m a"))], DOCS).block).toBe(false);
  });

  it.each([
    ["gh pr view 81"],
    ["gh pr merge 81 --merge"],
    ["git commit -q -F - <<'EOF'\nあとで gh pr create する\nEOF"],
    ["$b = @'\ngh pr create の説明\n'@\ngit commit -m $b"],
  ])("gh pr create ではない：%s", (command) => {
    expect(isPrCreate(command)).toBe(false);
  });

  it.each([
    ["gh pr create --title t --body-file b.md"],
    ['cd "C:/repo/.claude/worktrees/A" && gh pr create --title t --body "x"'],
    ["Set-Location C:/repo; gh pr create --fill"],
    ["GH_PROMPT_DISABLED=1 gh pr create --fill"],
    ["cd /c/repo && GH_PROMPT_DISABLED=1 GH_REPO=a/b gh pr create --fill"],
  ])("gh pr create である：%s", (command) => {
    expect(isPrCreate(command)).toBe(true);
  });

  it("差分が取れない（git diff の失敗）ときは止めず、通したことを知らせる文を返す（R1-78-13）", () => {
    const d = decide([], null);
    expect(d.block).toBe(false);
    expect(d.reason).toContain("差分");
  });
});

describe("一覧 4・前提 6：PR のブランチの場所を決める（R1-78-2・R2-78-5）", () => {
  it.each([
    [`cd "${W}" && gh pr create --fill`, OTHER, W, null],
    [`cd ${W}; gh pr create --fill`, OTHER, W, null],
    [`Push-Location "${W}"; gh pr create --fill`, OTHER, W, null],
    ["gh pr create --fill --head feature/NORI-1-x", W, W, "feature/NORI-1-x"],
    ["gh pr create --fill", W, W, null],
    ['cd "/c/repo/.claude/worktrees/A" && gh pr create --fill', OTHER, W, null],
    ["gh pr create --fill --head owner:feature/NORI-1-x", W, W, "feature/NORI-1-x"],
    ["gh pr create -F - <<'EOF'\n--head は使わない\nEOF", W, W, null],
  ])("%s", (command, cwd, dir, head) => {
    const p = prPlace(command, cwd);
    expect(p.dir.toLowerCase()).toBe(dir.replaceAll("\\", "/").toLowerCase());
    expect(p.head).toBe(head);
  });
});

describe("一覧 7：設定に登録する", () => {
  const settings = JSON.parse(readFileSync(path.join(root, ".claude/settings.json"), "utf8")) as {
    hooks: Record<string, { matcher?: string; hooks: { args?: string[]; command?: string }[] }[]>;
  };
  const uses = (event: string, file: string) =>
    (settings.hooks[event] ?? []).filter((g) =>
      g.hooks.some((h) => [...(h.args ?? []), h.command ?? ""].some((a) => a.includes(file))),
    );

  it("PreToolUse の Bash|PowerShell に review-before-pr.mjs", () => {
    const groups = uses("PreToolUse", "review-before-pr.mjs");
    expect(groups).toHaveLength(1);
    expect(groups[0]?.matcher).toBe("Bash|PowerShell");
  });

  it("approval-jira.mjs は Stop に入ったまま", () => {
    expect(uses("Stop", "approval-jira.mjs")).toHaveLength(1);
  });

  it("本物の Hook：gh pr create 以外は何も出さずに通す（終了コード 0）", () => {
    const out = execFileSync("node", [path.join(root, ".claude/hooks/review-before-pr.mjs")], {
      input: JSON.stringify({ tool_name: "Bash", tool_input: { command: "gh pr view 1" }, cwd: W }),
    });
    expect(out.toString()).toBe("");
  });
});

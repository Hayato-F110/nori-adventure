import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
// @ts-expect-error -- Hook は素の JavaScript（.mjs）で、型定義を持たない
import { findSkippedCheck } from "../../.claude/hooks/guard-no-verify.mjs";

const root = path.resolve(import.meta.dirname, "../..");
const hook = path.join(root, ".claude/hooks/guard-no-verify.mjs");

// 2026-11-15：コミットに --no-verify を付けた（決まりは「確認の仕組みを飛ばさない」。オーナーが Hook を承認）
describe("Hook：git の確認の仕組みを飛ばす指定を止める", () => {
  it.each([
    [`git commit -q --no-verify -m "x"`],
    [`git commit -m "x" --no-verify`],
    [`cd a && git commit --no-verify -F - <<'EOF'\nmsg\nEOF`],
    [`git commit -n -m "x"`],
    [`git commit -qn -m "x"`],
    [`git push --no-verify origin main`],
    [`git -C .claude/worktrees/a commit --no-verify -m x`],
    [`git merge --no-verify feature/x`],
    [`git commit --no-gpg-sign -m x`],
    [`git -c commit.gpgsign=false commit -m x`],
  ])("止める：%s", (command) => {
    expect(findSkippedCheck(command)).not.toBeNull();
  });

  it.each([
    [`git commit -q -m "x"`],
    [`git commit -m "--no-verify を付けない"`], // 文の中の言葉
    [`git commit -q -F - <<'EOF'\n--no-verify と -n を止める Hook\nEOF`], // ヒアドキュメントの中
    [`git log -n 3`], // commit ではない -n
    [`grep -n "no-verify" .claude/hooks/guard-no-verify.mjs`],
    [`npm test -- tests/hooks/guard-no-verify.test.ts`],
    [`git status`],
  ])("通す：%s", (command) => {
    expect(findSkippedCheck(command)).toBeNull();
  });

  it("Hook として動かすと、止めるときは終了コード 2", () => {
    const input = JSON.stringify({ tool_name: "Bash", tool_input: { command: "git commit --no-verify -m x" } });
    let status = 0;
    try {
      execFileSync("node", [hook], { input, stdio: ["pipe", "pipe", "pipe"] });
    } catch (error) {
      status = (error as { status: number }).status;
    }
    expect(status).toBe(2);
  });

  it("Hook として動かすと、通すときは終了コード 0（PowerShell も見る）", () => {
    const input = JSON.stringify({ tool_name: "PowerShell", tool_input: { command: "git status" } });
    expect(() => execFileSync("node", [hook], { input, stdio: ["pipe", "pipe", "pipe"] })).not.toThrow();
  });

  it("settings.json の Bash・PowerShell の前の Hook に入っている", () => {
    const settings = JSON.parse(readFileSync(path.join(root, ".claude/settings.json"), "utf8")) as {
      hooks: { PreToolUse: { matcher: string; hooks: { args?: string[] }[] }[] };
    };
    const entry = settings.hooks.PreToolUse.find((e) => e.matcher === "Bash|PowerShell");
    const args = entry?.hooks.flatMap((h) => h.args ?? []) ?? [];
    expect(args.some((a) => a.endsWith("/.claude/hooks/guard-no-verify.mjs"))).toBe(true);
  });
});

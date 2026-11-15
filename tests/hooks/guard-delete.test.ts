import { execFileSync } from "node:child_process";
import path from "node:path";
import { describe, expect, it } from "vitest";
// @ts-expect-error -- Hook は素の JavaScript（.mjs）で、型定義を持たない
import { findDestructive } from "../../.claude/hooks/guard-delete.mjs";

const root = path.resolve(import.meta.dirname, "../..");
const hook = path.join(root, ".claude/hooks/guard-delete.mjs");

describe("Hook：ファイル・ブランチを消す操作、履歴を書き換える操作は、オーナーの確認を出す（2026-11-15 にオーナーが承認）", () => {
  describe("Bash", () => {
    it.each([
      ["rm -f .claude/agent-reports/a.md", "rm"], // 11/15 に承認なしで消した形
      ["rm a.txt", "rm"],
      ["rm -rf dist", "rm"],
      ["cd x && rm -f y", "rm"], // つないだ2つ目
      ["git status; rm y", "rm"],
      ["ls | xargs rm", "rm"],
      ["find . -name '*.tmp' -delete", "find -delete"],
      ["find . -name '*.tmp' -exec rm {} \\;", "rm"],
      ["X=1 rm y", "rm"], // 前に付く環境変数
      ["sudo rm y", "rm"],
      ["echo $(rm y)", "rm"],
      ["bash -c 'rm -f y'", "rm"],
      ["unlink y", "unlink"],
      ["git rm src/a.ts", "git rm"],
      ["cmd /c rmdir /s /q x", "rmdir /s"],
      ["cmd /c rd /S x", "rmdir /s"],
      ["cmd /c del x.txt", "del"],
      ["git branch -D feature/x", "git branch -D"],
      ["git branch --delete --force feature/x", "git branch -D"],
      ["git push --force origin feature/x", "git push --force"],
      ["git push -f origin feature/x", "git push --force"],
      ["git push --force-with-lease origin feature/x", "git push --force"],
      ["git push origin +feature/x", "git push --force"],
      ["git reset --hard origin/main", "git reset --hard"],
      ["git clean -fd", "git clean"],
      ["git worktree remove --force .claude/worktrees/x", "git worktree remove --force"],
      ["git worktree remove .claude/worktrees/x -f", "git worktree remove --force"],
      // シェルに渡す heredoc の中身は実行されるので見る
      ["bash <<'EOF'\nrm -f y\nEOF", "rm"],
    ])("確認を出す：%s", (command, label) => {
      expect(findDestructive(command, "Bash")).toBe(label);
    });

    it.each([
      ["git branch -d feature/x"], // マージ済みの作業ブランチ（2026-11-04 承認の例外）
      ["git push origin --delete feature/x"], // 同上
      ["cmd /c rmdir .claude\\worktrees\\x\\node_modules"], // ジャンクションだけを外す（/s なし。2026-11-13 承認）
      ["git worktree remove .claude/worktrees/x"], // --force なし
      ["rmdir empty-dir"], // 空のフォルダだけ消える
      ["git clean -n"], // 消すものを表示するだけ
      ["git clean --dry-run -d"],
      ["git rm --cached a.ts"], // 作業中のファイルは消さない
      ["git push origin feature/x"],
      ["git reset --soft HEAD~1"],
      ["npm run format"], // 「rm」を含む別の言葉
      ["git log --format=%h"],
      ["grep -rn 'rm -rf' docs"], // 文字として探しているだけ
      // コミットの文（heredoc）の中の言葉
      ["git commit -q -F - <<'EOF'\nrm -f で消したことを記録\nEOF"],
    ])("通す：%s", (command) => {
      expect(findDestructive(command, "Bash")).toBeNull();
    });
  });

  describe("PowerShell", () => {
    it.each([
      ["Remove-Item -Recurse -Force x", "Remove-Item"],
      ["remove-item x", "Remove-Item"],
      ["rm x", "Remove-Item"],
      ["del x", "Remove-Item"],
      ["ri x", "Remove-Item"],
      ["rd x", "Remove-Item"], // PowerShell の rd・rmdir は Remove-Item（中身ごと消せる）
      ["rmdir x", "Remove-Item"],
      ["erase x", "Remove-Item"],
      ["Get-ChildItem *.tmp | Remove-Item", "Remove-Item"],
      ["git status && git branch -D feature/x", "git branch -D"],
      ["git reset --hard", "git reset --hard"],
    ])("確認を出す：%s", (command, label) => {
      expect(findDestructive(command, "PowerShell")).toBe(label);
    });

    it.each([["git branch -d feature/x"], ["Get-ChildItem x"], ["cmd /c rmdir x\\node_modules"]])(
      "通す：%s",
      (command) => {
        expect(findDestructive(command, "PowerShell")).toBeNull();
      },
    );
  });

  it("Hook として動かすと、確認（ask）を返し、理由に何を見つけたかを書く", () => {
    const input = JSON.stringify({ tool_name: "Bash", tool_input: { command: "rm -f y" } });
    const out = execFileSync("node", [hook], { input, encoding: "utf8" });
    const json = JSON.parse(out);
    expect(json.hookSpecificOutput.hookEventName).toBe("PreToolUse");
    expect(json.hookSpecificOutput.permissionDecision).toBe("ask");
    expect(json.hookSpecificOutput.permissionDecisionReason).toContain("rm");
  });

  it("Hook として動かすと、消さないコマンドには何も返さない", () => {
    const input = JSON.stringify({ tool_name: "Bash", tool_input: { command: "git status" } });
    expect(execFileSync("node", [hook], { input, encoding: "utf8" })).toBe("");
  });

  it("Bash・PowerShell 以外の道具には何もしない", () => {
    expect(findDestructive("rm -f y", "Read")).toBeNull();
  });
});

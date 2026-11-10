import { execFileSync } from "node:child_process";
import path from "node:path";
import { describe, expect, it } from "vitest";
// @ts-expect-error -- Hook は素の JavaScript（.mjs）で、型定義を持たない
import { findInlineBackslashRisk } from "../../.claude/hooks/guard-inline-backslash.mjs";

const root = path.resolve(import.meta.dirname, "../..");
const hook = path.join(root, ".claude/hooks/guard-inline-backslash.mjs");
// バックスラッシュは String.raw で書く（テスト自身が壊れないように）
const drivePath = String.raw`C:\NoriBlender\work`;

describe("Hook：インラインのコードの危ないバックスラッシュを止める（11/10 に2回失敗）", () => {
  it.each([
    [`python -I -X utf8 - <<'EOF'\np = r"${drivePath}"\nEOF`, "Windows のパス"],
    [`python -c "print('${drivePath}')"`, "Windows のパス"],
    [String.raw`python - <<EOF` + "\n" + String.raw`s.replace("\Name", "x")` + "\nEOF", "大文字"],
    [String.raw`node -e "console.log(/a\s+b/.test(x))"`, "正規表現"],
  ])("止める：%s", (command, label) => {
    expect(findInlineBackslashRisk(command)).toContain(label);
  });

  it.each([
    [`cp ${drivePath}/a.png tmp/`], // インラインのコードではない
    [`python -I tools/x.py ${drivePath}`], // ファイルを実行する書き方
    [String.raw`python -c "print('a\nb')"`], // \n は通す
    [`node -e "console.log(1)"`],
    [`git commit -m "fix"`],
    // コミットの文の中で、書き方を説明しているだけのもの（11/10 に誤って止めた）
    [
      `git commit -q -F - <<'EOF'\npython -c・python - <<・node -e に、Windows のパス（${drivePath}）があれば止める\nEOF`,
    ],
  ])("通す：%s", (command) => {
    expect(findInlineBackslashRisk(command)).toBeNull();
  });

  it("Hook として動かすと、止めるときは終了コード 2", () => {
    const input = JSON.stringify({
      tool_name: "Bash",
      tool_input: { command: `python -c "x=r'${drivePath}'"` },
    });
    let status = 0;
    try {
      execFileSync("node", [hook], { input, stdio: ["pipe", "pipe", "pipe"] });
    } catch (error) {
      status = (error as { status: number }).status;
    }
    expect(status).toBe(2);
  });

  it("Hook として動かすと、通すときは終了コード 0", () => {
    const input = JSON.stringify({ tool_name: "Bash", tool_input: { command: "git status" } });
    expect(() => execFileSync("node", [hook], { input, stdio: ["pipe", "pipe", "pipe"] })).not.toThrow();
  });
});

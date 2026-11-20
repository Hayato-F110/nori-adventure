import { execFileSync } from "node:child_process";
import path from "node:path";
import { describe, expect, it } from "vitest";
// @ts-expect-error -- Hook は素の JavaScript（.mjs）で、型定義を持たない
import { findCheckPipe, findLongForeground } from "../../.claude/hooks/guard-long-foreground.mjs";

const root = path.resolve(import.meta.dirname, "../..");
const hook = path.join(root, ".claude/hooks/guard-long-foreground.mjs");

describe("Hook：長い処理を表で流そうとしたら止める（スプリント2のふりかえりの改善②）", () => {
  it.each([
    ["npm run check", "npm run check"],
    ["npm run e2e -- e2e/stage4.spec.ts", "npm run check / e2e"],
    ["cd x && npm run check 2>&1 | tail -5", "npm run check"],
    ["CI=1 npx playwright test e2e/look.spec.ts", "playwright test"],
    ["gh pr checks 57 --watch --interval 60", "CI の見張り"],
    ["gh run watch 123", "CI の見張り"],
  ])("止める：%s", (command, label) => {
    expect(findLongForeground(command, undefined)).toContain(label.split(" / ")[0]);
  });

  it.each([
    ["npm run typecheck"], // コミットの前の確かめ（短い）
    ["npm test -- tests/core/traffic.test.ts"],
    ["gh pr checks 57"], // 1回だけ見る
    ["npx playwright install chromium"],
    // コミットの文の中で、書き方を説明しているだけのもの
    ["git commit -q -F - <<'EOF'\nnpm run check を裏で動かす\nEOF"],
  ])("通す：%s", (command) => {
    expect(findLongForeground(command, undefined)).toBeNull();
  });

  it("裏で動かす指定（run_in_background: true）があれば通す", () => {
    expect(findLongForeground("npm run check", true)).toBeNull();
  });

  it("Hook として動かすと、止めるときは終了コード 2", () => {
    const input = JSON.stringify({ tool_name: "Bash", tool_input: { command: "npm run e2e" } });
    let status = 0;
    try {
      execFileSync("node", [hook], { input, stdio: ["pipe", "pipe", "pipe"] });
    } catch (error) {
      status = (error as { status: number }).status;
    }
    expect(status).toBe(2);
  });

  it("Hook として動かすと、裏で動かすときでも npm run check をパイプにつなげば終了コード 2（NORI-92）", () => {
    const input = JSON.stringify({
      tool_name: "Bash",
      tool_input: { command: "npm run check 2>&1 | tail -5", run_in_background: true },
    });
    let status = 0;
    try {
      execFileSync("node", [hook], { input, stdio: ["pipe", "pipe", "pipe"] });
    } catch (error) {
      status = (error as { status: number }).status;
    }
    expect(status).toBe(2);
  });

  it("Hook として動かすと、裏で動かすときは終了コード 0", () => {
    const input = JSON.stringify({
      tool_name: "PowerShell",
      tool_input: { command: "npm run e2e", run_in_background: true },
    });
    expect(() => execFileSync("node", [hook], { input, stdio: ["pipe", "pipe", "pipe"] })).not.toThrow();
  });
});

// NORI-92：npm run check をパイプ（|）で別の命令につなぐと、終了コードがパイプの最後の命令（tail など）のものになり、
// 検査が落ちても 0（緑）に見える（2026-11-19、NORI-90 で起きた）。裏で動かしても同じなので、裏かどうかによらず止める
describe("Hook：npm run check をパイプにつないだら止める（NORI-92）", () => {
  it.each([
    ["npm run check | tail"],
    ["npm run check 2>&1 | head -20"],
    ["cd x && npm run check 2>&1 | tail -5"],
    ["CI=1 npm run check -- --silent | grep FAIL"],
    ["npm run check &> out.txt | cat"],
    ["npm run check | Select-Object -Last 5"], // PowerShell
    ["git fetch -q\nnpm run check 2>&1 | tail -3"], // 2 行目
    // /code-review の指摘 1：pipefail の文字が、パイプのあと・文の中にあるだけ
    ["npm run check 2>&1 | tail -5; set -o pipefail"],
    ['git commit -m "set -o pipefail を使う"; npm run check | tail'],
    ["set +o pipefail; npm run check | tail"], // + は外す
    // 指摘 2：行の続き・包む命令・まとめた命令
    ["npm run check 2>&1 \\\n  | tail -5"],
    ["time npm run check | tail"],
    ["env CI=1 npm run check | tail"],
    ["{ npm run check; } 2>&1 | tail"],
    ["( cd x && npm run check ) | tail"],
    // 指摘 3：シェルに渡す heredoc の中身は命令
    ["bash <<'EOF'\nnpm run check 2>&1 | tail -5\nEOF"],
  ])("止める：%s", (command) => {
    expect(findCheckPipe(command)).not.toBeNull();
  });

  it.each([
    ['npm run check > "$TEMP/check.txt" 2>&1; echo "exit=$?"'], // 決まりの書き方：ファイルに書き、$? を見る
    ["npm run check; echo $?"],
    ["npm run check || echo 落ちた"], // || はパイプではない
    ["npm run check && git push -u origin feature/NORI-92-x"],
    ["set -o pipefail; npm run check 2>&1 | tail -5"], // パイプの途中で落ちたら全体が落ちる
    ["set -euo pipefail; npm run check 2>&1 | tail -5"], // 指摘 4：よく使う書き方
    ["set -o errexit -o pipefail\nnpm run check | tail"],
    ["{ npm run check; } > c.txt 2>&1; echo $?"], // まとめた命令でも、ファイルに書けば通す
    ["npm run typecheck | tail"], // 別の命令（この課題の範囲の外）
    ['git commit -q -m "npm run check | tail で緑に見えた"'], // 文の中の説明
    ["git commit -q -F - <<'EOF'\nnpm run check | tail で緑に見えた\nEOF"],
    ["grep -n x f | head; npm run check > c.txt 2>&1"], // パイプは前の命令のもの
    ["npm run check > c.txt 2>&1; git log --oneline | head -3"], // パイプはあとの命令のもの
    ["npm run check > c.txt 2>&1\ngrep FAIL c.txt | head"], // 改行のあとの命令のもの
  ])("通す：%s", (command) => {
    expect(findCheckPipe(command)).toBeNull();
  });
});

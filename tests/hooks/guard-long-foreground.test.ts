import { execFileSync } from "node:child_process";
import path from "node:path";
import { describe, expect, it } from "vitest";
// @ts-expect-error -- Hook は素の JavaScript（.mjs）で、型定義を持たない
import { findLongForeground } from "../../.claude/hooks/guard-long-foreground.mjs";

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

  it("Hook として動かすと、裏で動かすときは終了コード 0", () => {
    const input = JSON.stringify({
      tool_name: "PowerShell",
      tool_input: { command: "npm run e2e", run_in_background: true },
    });
    expect(() => execFileSync("node", [hook], { input, stdio: ["pipe", "pipe", "pipe"] })).not.toThrow();
  });
});

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
// @ts-expect-error -- Hook は素の JavaScript（.mjs）で、型定義を持たない
import { findWaitWithoutNext } from "../../.claude/hooks/wait-needs-next.mjs";

const root = path.resolve(import.meta.dirname, "../..");
const hook = path.join(root, ".claude/hooks/wait-needs-next.mjs");

// 2026-11-15：裏の作業を待つとだけ書いて止まった（CLAUDE.md「CI・マージを待たない」「応答を遅くしない」の再発）
describe("Hook：裏の作業を待つと書いたら、待つ間に進める課題を書かせる", () => {
  it.each([
    ["どれもまだ裏で動いているので、新しい報告はありません。結果が届いたら続けます。"],
    ["PR #80 の CI を見張っています。緑ならマージします。"],
    ["2回目のレビューを待ちます。"],
    ["CI が終わったら知らせます。"],
  ])("止める：%s", (text) => {
    expect(findWaitWithoutNext(text)).not.toBeNull();
  });

  it.each([
    ["CI を裏で見張っています。\n待つ間に進める課題：NORI-73 の調べ（ステージ2のテストを読む）"],
    ["レビューを待ちます。待つ間に進める課題：なし（ほかの課題はどれもオーナーの承認待ち）"],
    ["検査はすべて通りました。PR を出しました。"], // 待つ言葉がない
    ["Hook の知らせに `CI を見張っています` という例を足した"], // コードの中の言葉
    [""],
  ])("通す：%s", (text) => {
    expect(findWaitWithoutNext(text)).toBeNull();
  });

  it("「なし」には理由が要る", () => {
    expect(findWaitWithoutNext("CI を待ちます。待つ間に進める課題：なし")).not.toBeNull();
  });

  const run = (input: object) => {
    try {
      execFileSync("node", [hook], { input: JSON.stringify(input), stdio: ["pipe", "pipe", "pipe"] });
      return 0;
    } catch (error) {
      return (error as { status: number }).status;
    }
  };

  it("Hook として動かすと、最後の文章で止めるときは終了コード 2", () => {
    expect(run({ hook_event_name: "Stop", last_assistant_message: "CI を見張っています。" })).toBe(2);
  });

  it("止めたあとの再実行（stop_hook_active）では止めない", () => {
    expect(
      run({
        hook_event_name: "Stop",
        stop_hook_active: true,
        last_assistant_message: "CI を見張っています。",
      }),
    ).toBe(0);
  });

  it("settings.json の Stop の Hook に入っている", () => {
    const settings = JSON.parse(readFileSync(path.join(root, ".claude/settings.json"), "utf8")) as {
      hooks: { Stop: { hooks: { args?: string[] }[] }[] };
    };
    const args = settings.hooks.Stop.flatMap((e) => e.hooks.flatMap((h) => h.args ?? []));
    expect(args.some((a) => a.endsWith("/.claude/hooks/wait-needs-next.mjs"))).toBe(true);
  });
});

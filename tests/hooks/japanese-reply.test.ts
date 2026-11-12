import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
// @ts-expect-error -- Hook は素の JavaScript（.mjs）で、型定義を持たない
import { findEnglishLines, textsOfThisTurn } from "../../.claude/hooks/japanese-reply.mjs";

const root = path.resolve(import.meta.dirname, "../..");
const hook = path.join(root, ".claude/hooks/japanese-reply.mjs");

describe("Hook：英語だけの行があれば、応答を止めて日本語で書き直させる（11/12）", () => {
  it.each([["Starting with the tests."], ["Now the engine that actually plays the sounds."]])(
    "止める：%s",
    (line) => {
      expect(findEnglishLines(line)).toEqual([line]);
    },
  );

  it.each([
    ["テストから書きます。"],
    ["PR #48 を作りました。CI を待っています。"], // 日本語の文字がある
    ["```ts\nconst sound = startSound(1);\nexport const loadSoundOn = () => true;\n```"], // コードブロック
    ["`git push origin main` を実行"],
    ["https://developer.chrome.com/blog/autoplay/"],
    ["| --- | --- |"],
    ["OK"], // 短い
  ])("通す：%s", (text) => {
    expect(findEnglishLines(text)).toEqual([]);
  });

  it("この回（最後のオーナーのメッセージのあと）の文章だけを集める。道具の結果はまたぐ", () => {
    const jsonl = [
      { message: { role: "assistant", content: [{ type: "text", text: "Old English reply from before." }] } },
      { message: { role: "user", content: "よい" } },
      { message: { role: "assistant", content: [{ type: "text", text: "Starting with the tests." }] } },
      { message: { role: "user", content: [{ type: "tool_result", content: "ok" }] } },
      { message: { role: "assistant", content: [{ type: "text", text: "完了しました。" }] } },
    ]
      .map((e) => JSON.stringify(e))
      .join("\n");
    expect(textsOfThisTurn(jsonl)).toEqual(["Starting with the tests.", "完了しました。"]);
  });

  const run = (input: object) => {
    try {
      execFileSync("node", [hook], { input: JSON.stringify(input), stdio: ["pipe", "pipe", "pipe"] });
      return 0;
    } catch (error) {
      return (error as { status: number }).status;
    }
  };

  it("英語だけの行があれば終了コード 2。止めたあとの再実行（stop_hook_active）では止めない", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "nori-hook-"));
    const transcript = path.join(dir, "t.jsonl");
    writeFileSync(
      transcript,
      [
        { message: { role: "user", content: "はい" } },
        {
          message: {
            role: "assistant",
            content: [{ type: "text", text: "Now the engine that plays sounds." }],
          },
        },
      ]
        .map((e) => JSON.stringify(e))
        .join("\n"),
    );
    expect(run({ transcript_path: transcript })).toBe(2);
    expect(run({ transcript_path: transcript, stop_hook_active: true })).toBe(0);
    expect(run({ last_assistant_message: "日本語の報告です。" })).toBe(0);
  });
});

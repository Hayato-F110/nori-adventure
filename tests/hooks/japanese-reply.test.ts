import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
// @ts-expect-error -- Hook は素の JavaScript（.mjs）で、型定義を持たない（整形で行が分かれないよう、まとめて読む）
import * as hook_ from "../../.claude/hooks/japanese-reply.mjs";

const { findEnglishLines, textsBeforeThisTool, textsOfThisTurn } = hook_ as {
  findEnglishLines: (text: string) => string[];
  textsBeforeThisTool: (jsonl: string) => string[];
  textsOfThisTurn: (jsonl: string) => string[];
};

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

  const said = (text: string) => ({
    type: "assistant",
    message: { role: "assistant", content: [{ type: "text", text }] },
  });

  it("前回この Hook が動いたあと（stop_hook_summary のあと）の文章を集める。途中のメッセージや知らせでは区切らない", () => {
    const jsonl = [
      said("Old English reply from before."),
      { type: "system", subtype: "stop_hook_summary" },
      { type: "user", message: { role: "user", content: "よい" } },
      said("Starting with the tests."),
      // 作業の途中に届いたオーナーのメッセージ・裏の作業の知らせ（11/12 にここで区切って見落とした）
      { type: "user", message: { role: "user", content: "先ほどの Hook は効いている?" } },
      { type: "user", message: { role: "user", content: "<task-notification>…</task-notification>" } },
      { type: "user", message: { role: "user", content: [{ type: "tool_result", content: "ok" }] } },
      // 記録用の写しは数えない（同じ文章が2回入る）
      {
        type: "api-request-blob",
        message: { role: "assistant", content: [{ type: "text", text: "完了しました。" }] },
      },
      said("完了しました。"),
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
        { type: "user", message: { role: "user", content: "はい" } },
        said("Now the engine that plays sounds."),
      ]
        .map((e) => JSON.stringify(e))
        .join("\n"),
    );
    expect(run({ transcript_path: transcript })).toBe(2);
    expect(run({ transcript_path: transcript, stop_hook_active: true })).toBe(0);
    expect(run({ last_assistant_message: "日本語の報告です。" })).toBe(0);
  });

  // 応答の終わりだけでは途中の1行を止められなかった（11/12、2回）ので、道具を呼ぶ直前にも調べる
  it("道具を呼ぶ直前：最後の道具の結果より後に書いた文だけを見る", () => {
    const jsonl = [
      said("Old English line before the last tool."),
      { type: "user", message: { role: "user", content: [{ type: "tool_result", content: "ok" }] } },
      said("Next I'll update the sound engine to use the tracker."),
    ]
      .map((e) => JSON.stringify(e))
      .join("\n");
    expect(textsBeforeThisTool(jsonl)).toEqual(["Next I'll update the sound engine to use the tracker."]);
  });

  it("道具を呼ぶ直前に英語だけの文があれば終了コード 2（その呼び出しを止める）。日本語なら通す", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "nori-hook-"));
    const write = (text: string) => {
      const file = path.join(dir, `${text.length}.jsonl`);
      writeFileSync(
        file,
        [
          { type: "user", message: { role: "user", content: [{ type: "tool_result", content: "ok" }] } },
          said(text),
        ]
          .map((e) => JSON.stringify(e))
          .join("\n"),
      );
      return file;
    };
    expect(
      run({
        hook_event_name: "PreToolUse",
        transcript_path: write("Next I'll update the sound engine now."),
      }),
    ).toBe(2);
    expect(run({ hook_event_name: "PreToolUse", transcript_path: write("次に音の仕組みを直します。") })).toBe(
      0,
    );
  });
});

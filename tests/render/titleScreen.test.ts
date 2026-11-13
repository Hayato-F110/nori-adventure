import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CLEAR, TITLE } from "../../src/config/index.ts";
import { CLEARED_STORAGE_KEY } from "../../src/render/progress.ts";

// docs/game-rules.md「タイトル画面・ステージ選び・クリアの演出」（NORI-30）。テストの一覧の 4・5・8
const root = path.resolve(import.meta.dirname, "../..");
const read = (file: string) => readFileSync(path.join(root, file), "utf8");
const html = read("index.html");
const css = read("src/style.css");
const privacy = read("public/privacy.html");

// 中に同じ要素（nav・div）を入れ子にしない作りなので、最初の閉じタグまでを取る
const block = (id: string) => new RegExp(`<(nav|div)\\s+id="${id}"[\\s\\S]*?</\\1>`).exec(html)?.[0] ?? "";
const links = (fragment: string) => [...fragment.matchAll(/<a[\s\S]*?<\/a>/g)].map((m) => m[0]);
const textBetweenTags = (fragment: string) =>
  [...fragment.matchAll(/>([^<]*)</g)].map((m) => (m[1] ?? "").trim()).filter((s) => s !== "");
const expectPictureOnly = (buttons: string[]) => {
  for (const b of buttons) {
    expect(b).toMatch(/aria-label="[^"]+"/);
    expect(b).toMatch(/<svg[^>]*aria-hidden="true"/);
    expect(textBetweenTags(b), b).toEqual([]);
  }
};

describe("タイトル画面", () => {
  const title = block("title");
  const buttons = links(title);

  it("最初は隠れている（?stage がないときだけ出す）", () => {
    expect(title).toMatch(/^<nav\s+id="title"[^>]*\shidden[\s>]/);
  });

  it("ボタンは TITLE.stages と同じ順（ステージ5のローバーまで。NORI-29）。どれも ./?stage=N を開く", () => {
    expect(buttons.map((b) => Number(/data-stage="(\d)"/.exec(b)?.[1]))).toEqual([...TITLE.stages]);
    expect(buttons.map((b) => /href="([^"]+)"/.exec(b)?.[1])).toEqual(
      TITLE.stages.map((n) => `./?stage=${n}`),
    );
  });

  it("文字を出さず、絵と読み上げの名前だけ。クリアの星は最初は隠れている", () => {
    expectPictureOnly(buttons);
    for (const b of buttons) expect(b).toMatch(/class="title-star"[^>]*\shidden/);
  });

  it("ボタンの大きさは TITLE.buttonSize（64 px 以上）", () => {
    expect(TITLE.buttonSize).toBeGreaterThanOrEqual(64);
    expect(css).toContain(`--title-button: ${TITLE.buttonSize}px;`);
  });
});

describe("クリアのボタン", () => {
  const panel = block("clear");
  const buttons = links(panel);

  it("最初は隠れている。もう一回・つぎ・タイトルの3つ", () => {
    expect(panel).toMatch(/^<div\s+id="clear"[^>]*\shidden[\s>]/);
    expect(buttons.map((b) => /id="([^"]+)"/.exec(b)?.[1])).toEqual([
      "clear-again",
      "clear-next",
      "clear-home",
    ]);
  });

  it("文字を出さず、絵と読み上げの名前だけ", () => {
    expectPictureOnly(buttons);
  });

  it("ボタンの大きさは CLEAR.buttonSize（64 px 以上）", () => {
    expect(CLEAR.buttonSize).toBeGreaterThanOrEqual(64);
    expect(css).toContain(`--clear-button: ${CLEAR.buttonSize}px;`);
  });
});

describe("プライバシーポリシー", () => {
  it("日本語・英語の両方に、クリアの記録を残す名前が書いてある", () => {
    const [ja = "", en = ""] = privacy.split(/<h2>What is stored on your device<\/h2>/);
    expect(ja).toContain(CLEARED_STORAGE_KEY);
    expect(en).toContain(CLEARED_STORAGE_KEY);
  });
});

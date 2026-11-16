import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// NORI-38 一覧 7（docs/test-plans/NORI-38.md）：ポリシー（日本語・英語）に、ルールの表の決まった文がそのまま入っている。
// 期待の文は docs/game-rules.md の「プライバシー」「iOS の注意」の行から読む（文書と写しがずれないように）
const root = path.resolve(import.meta.dirname, "../..");
const read = (file: string): string => readFileSync(path.join(root, file), "utf8");

const pwaSection = (): string => {
  const rules = read("docs/game-rules.md");
  const start = rules.indexOf("### ホーム画面に追加・通信なしで遊ぶ（PWA");
  const end = rules.indexOf("\n### ", start + 1);
  return rules.slice(start, end);
};

const rowOf = (name: string): string => {
  const row = pwaSection()
    .split("\n")
    .find((line) => line.startsWith(`| ${name} `));
  if (row === undefined) throw new Error(`ルールの表に「${name}」の行がありません`);
  return row;
};

const quoted = (row: string, lang: "日本語" | "英語"): string[] =>
  [...row.matchAll(new RegExp(`${lang}：?「([^」]+)」`, "g"))].map((m) => m[1] ?? "");

/** HTML の文字を、比べやすい形にする（タグを外し、空白をまとめ、&#39; などを戻す） */
const textOf = (html: string): string =>
  html
    .replace(/<[^>]+>/g, " ")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ");

describe("NORI-38 一覧 7：ポリシーの決まった文", () => {
  const ja = [...quoted(rowOf("iOS の注意"), "日本語"), ...quoted(rowOf("プライバシー"), "日本語")];
  const en = [...quoted(rowOf("iOS の注意"), "英語"), ...quoted(rowOf("プライバシー"), "英語")];

  it("ルールの表から、日本語の文 4 つと英語の文 4 つが読める", () => {
    expect(ja).toHaveLength(4);
    expect(en).toHaveLength(4);
  });

  it.each([...ja, ...en].map((s) => [s]))("ポリシーに入っている：%s", (sentence) => {
    expect(textOf(read("public/privacy.html"))).toContain(sentence);
  });

  it("前の前置き（「次の3つだけを、ブラウザの保存場所」「Only these three things are kept」）が残っていない", () => {
    const text = textOf(read("public/privacy.html"));
    // 新しい前置きは「設定として、次の3つだけを、…」なので、文の頭にある古い形だけを探す
    expect(text).not.toMatch(/(?:^|[ >])次の3つだけを、ブラウザの保存場所/);
    expect(text).not.toContain("Only these three things are kept");
  });
});

// NORI-76 一覧 7（docs/test-plans/NORI-76.md）：判定の結果を sessionStorage に置くことの文。
// 期待の文は docs/game-rules.md「ステージの始まりの待ちと、タイトルでの画質の判定」の「プライバシーポリシーに足す文」の行から読む
describe("NORI-76 一覧 7：画質の判定の結果の文", () => {
  const rules = read("docs/game-rules.md");
  const start = rules.indexOf("### ステージの始まりの待ちと、タイトルでの画質の判定");
  const section = rules.slice(start, rules.indexOf("\n## ", start + 1));
  const row = section.split("\n").find((l) => l.startsWith("| プライバシーポリシーに足す文 ")) ?? "";
  const ja = quoted(row, "日本語");
  const en = quoted(row, "英語");
  const page = textOf(read("public/privacy.html"));

  it("ルールの表から、日本語・英語の文が 1 つずつ読める", () => {
    expect(start).toBeGreaterThan(0);
    expect(ja).toHaveLength(1);
    expect(en).toHaveLength(1);
  });

  it.each([...ja, ...en].map((s) => [s]))("ポリシーに 1 回だけ入っている：%s", (sentence) => {
    expect(page.split(sentence).length - 1).toBe(1);
  });

  it("「3つだけ」（localStorage）の段落と箇条書きの中にはない", () => {
    const raw = read("public/privacy.html");
    const ranges = [
      [raw.indexOf("次の3つだけを"), raw.indexOf("</ul>", raw.indexOf("次の3つだけを"))],
      [raw.indexOf("only these three things"), raw.indexOf("</ul>", raw.indexOf("only these three things"))],
    ];
    for (const [a, b] of ranges) {
      expect(a).toBeGreaterThan(0);
      const inside = textOf(raw.slice(a, b));
      for (const s of [...ja, ...en]) expect(inside).not.toContain(s);
    }
  });
});

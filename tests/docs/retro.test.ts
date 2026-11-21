// 2026-11-21 スプリント4のふりかえりの追記：ふりかえり（docs/retro/sprint-N.md）は、前のふりかえりの項目を 1 項目 1 行で刈り取る。
// スプリント4のふりかえりで、スプリント3の改善 I1〜I3 だけを確かめ、問題 P・観察 O の 12 件を確かめずに書き終えたため（オーナーが気づいた）。
// スプリント3のふりかえり（スプリント2の 48 項目を刈り取った）と同じ形を、スプリント3 以降のすべてに求める。
import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const dir = "docs/retro";

/** 表の行の 1 列目が ID（F1・CC2・P3 など）なら、その ID を返す */
const idOf = (line: string): string | null => /^\|\s*([A-Z]{1,2}\d+)\s*\|/.exec(line)?.[1] ?? null;

/** 見出し（## …）ごとに行を分ける */
const sections = (text: string): { heading: string; lines: string[] }[] => {
  const out: { heading: string; lines: string[] }[] = [{ heading: "", lines: [] }];
  for (const line of text.split("\n")) {
    if (line.startsWith("## ")) out.push({ heading: line, lines: [] });
    else (out.at(-1) as { lines: string[] }).lines.push(line);
  }
  return out;
};

const harvestHeading = (prev: number) => `## スプリント${prev}のふりかえりの刈り取り`;

/** 前のふりかえりの項目の ID（そのふりかえり自身の刈り取りの節の行は除く。それは前の前の項目なので） */
const itemIds = (text: string): string[] => [
  ...new Set(
    sections(text)
      .filter((s) => !/^## スプリント\d+のふりかえりの刈り取り/.test(s.heading))
      .flatMap((s) => s.lines.map(idOf))
      .filter((id): id is string => id !== null),
  ),
];

/** 今のふりかえりの刈り取りの節の行の ID。節がなければ null */
const harvestedIds = (text: string, prev: number): string[] | null => {
  const s = sections(text).find((x) => x.heading.startsWith(harvestHeading(prev)));
  return s === undefined ? null : s.lines.map(idOf).filter((id): id is string => id !== null);
};

const sprints = readdirSync(dir)
  .map((f) => /^sprint-(\d+)\.md$/.exec(f)?.[1])
  .filter((n): n is string => n !== undefined)
  .map(Number)
  .filter((n) => n >= 3)
  .sort((a, b) => a - b);

describe("ふりかえり（docs/retro/sprint-N.md）", () => {
  it("スプリント3 以降のふりかえりが 1 つ以上ある（検査が空回りしない）", () => {
    expect(sprints.length).toBeGreaterThan(0);
  });

  for (const n of sprints) {
    it(`スプリント${n}：「${harvestHeading(n - 1)}」の節に、前のふりかえりの全項目が 1 項目 1 行である`, () => {
      const now = readFileSync(`${dir}/sprint-${n}.md`, "utf8");
      const prev = readFileSync(`${dir}/sprint-${n - 1}.md`, "utf8");
      const got = harvestedIds(now, n - 1);
      expect(got, `${harvestHeading(n - 1)} の節がない`).not.toBeNull();
      const missing = itemIds(prev).filter((id) => !(got as string[]).includes(id));
      expect(missing, "刈り取りの節に行がない項目").toEqual([]);
    });
  }
});

describe("ふりかえりの検査の部品", () => {
  const prev = [
    "## 問題",
    "| ID | 問題 |",
    "| --- | --- |",
    "| P1 | あ |",
    "## スプリント1のふりかえりの刈り取り",
    "| X9 | 前の前 |",
    "## 観察",
    "| O1 | い |",
    "| CC2 | う |",
  ].join("\n");

  it("前のふりかえりの ID は、その刈り取りの節を除いて集める", () => {
    expect(itemIds(prev)).toEqual(["P1", "O1", "CC2"]);
  });

  it("刈り取りの節がなければ null、あれば行の ID", () => {
    expect(harvestedIds("## 数値\n| P1 | x |", 2)).toBeNull();
    expect(
      harvestedIds("## スプリント2のふりかえりの刈り取り\n| P1 | 閉じた |\n| O1 | 閉じない |\n## 次", 2),
    ).toEqual(["P1", "O1"]);
  });
});

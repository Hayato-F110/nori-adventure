// 2026-11-21 スプリント4のふりかえりの追記：ふりかえり（docs/retro/sprint-N.md）は、前のふりかえりの項目を 1 項目 1 行で刈り取る。
// スプリント4のふりかえりで、スプリント3の改善 I1〜I3 だけを確かめ、問題 P・観察 O の 12 件を確かめずに書き終えたため（オーナーが気づいた）。
// スプリント3のふりかえり（スプリント2の 48 項目を刈り取った）と同じ形を、スプリント3 以降のすべてに求める。手順は /retro（.claude/skills/retro/SKILL.md）。
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const dir = "docs/retro";
const results = ["閉じた", "閉じない", "課題なし"] as const;

/** 表の行を列に分ける（前後の「|」を外す） */
const cellsOf = (line: string): string[] =>
  line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((c) => c.trim());

/** 表の行の 1 列目が ID（英大文字＋数字。F1・CC2・O10 など）なら、その ID を返す */
const idOf = (line: string): string | null => /^\|\s*([A-Z]+\d+)\s*\|/.exec(line)?.[1] ?? null;

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

/** 今のふりかえりの、ID が 2 つ以上の行にある項目（刈り取りの節を除く。前のスプリントの項目は「S3-I1」と書くので数えない） */
const duplicateIds = (text: string): string[] => {
  const ids = sections(text)
    .filter((s) => !/^## スプリント\d+のふりかえりの刈り取り/.test(s.heading))
    .flatMap((s) => s.lines.map(idOf))
    .filter((id): id is string => id !== null);
  return [...new Set(ids.filter((id, i) => ids.indexOf(id) !== i))];
};

/** 今のふりかえりの刈り取りの節の行（ID と「結果」の列）。ID は「S2-P1」の形でも「P1」の形でもよい。節がなければ null */
const harvestRows = (text: string, prev: number): { id: string; result: string }[] | null => {
  const s = sections(text).find((x) => x.heading.startsWith(harvestHeading(prev)));
  if (s === undefined) return null;
  const header = s.lines.find((l) => l.trim().startsWith("|") && cellsOf(l).includes("結果"));
  const col = header === undefined ? -1 : cellsOf(header).indexOf("結果");
  const rowId = new RegExp(`^\\|\\s*(?:S${prev}-)?([A-Z]+\\d+)\\s*\\|`);
  return s.lines.flatMap((l) => {
    const id = rowId.exec(l)?.[1] ?? null;
    return id === null ? [] : [{ id, result: col < 0 ? "" : (cellsOf(l)[col] ?? "") }];
  });
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
    it(`スプリント${n}：「${harvestHeading(n - 1)}」の節に、前のふりかえりの全項目が 1 項目 1 行あり、結果が書いてある`, () => {
      const prevPath = `${dir}/sprint-${n - 1}.md`;
      expect(existsSync(prevPath), `${prevPath} がない（前のふりかえりがないと刈り取れない）`).toBe(true);
      const rows = harvestRows(readFileSync(`${dir}/sprint-${n}.md`, "utf8"), n - 1);
      expect(rows, `${harvestHeading(n - 1)} の節がない`).not.toBeNull();
      const got = (rows as { id: string; result: string }[]).map((r) => r.id);
      const items = itemIds(readFileSync(prevPath, "utf8"));
      expect(
        items.filter((id) => !got.includes(id)),
        "刈り取りの節に行がない項目",
      ).toEqual([]);
      expect(
        got.filter((id) => !items.includes(id)),
        "前のふりかえりにない ID の行",
      ).toEqual([]);
      expect(
        (rows as { id: string; result: string }[])
          .filter((r) => !results.some((w) => r.result.startsWith(w)))
          .map((r) => r.id),
        `「結果」の列が ${results.join("・")} のどれかで始まらない行`,
      ).toEqual([]);
    });
  }

  // スプリント4から：前のスプリントの項目は「S3-I1」と書き、今回の「I1」とかぶらせない（スプリント3の文書は前の書き方のまま）
  for (const n of sprints.filter((x) => x >= 4)) {
    it(`スプリント${n}：同じ ID が 2 つの行にない（前のスプリントの項目は「S${n - 1}-I1」の形で書く）`, () => {
      expect(duplicateIds(readFileSync(`${dir}/sprint-${n}.md`, "utf8"))).toEqual([]);
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
    "| ABC10 | う |",
  ].join("\n");

  it("前のふりかえりの ID は、その刈り取りの節を除いて集める（3 文字以上の ID も）", () => {
    expect(itemIds(prev)).toEqual(["P1", "O1", "ABC10"]);
  });

  it("刈り取りの節がなければ null、あれば行の ID と「結果」の列", () => {
    expect(harvestRows("## 数値\n| P1 | x |", 2)).toBeNull();
    const now = [
      "## スプリント2のふりかえりの刈り取り",
      "| 項目 | 前回の内容 | 結果 | 引き継ぐ先 |",
      "| --- | --- | --- | --- |",
      "| P1 | あ | 閉じた：証拠 | — |",
      "| S2-O1 | い |  | O3 |",
      "| S1-O2 | 前の前のスプリント |  | — |",
      "## 次",
    ].join("\n");
    expect(harvestRows(now, 2)).toEqual([
      { id: "P1", result: "閉じた：証拠" },
      { id: "O1", result: "" },
    ]);
  });

  it("同じ ID が 2 つの行にあれば見つける。「S3-I1」は数えない。刈り取りの節も数えない", () => {
    const text = [
      "## 前回の改善は効いたか",
      "| S3-I1 | 前回 |",
      "## スプリント3のふりかえりの刈り取り",
      "| S3-I1 | 閉じた |",
      "| I1 | 閉じた |",
      "## 次にやる改善",
      "| I1 | 今回 |",
      "## 観察",
      "| O1 | あ |",
    ].join("\n");
    expect(duplicateIds(text)).toEqual([]);
    expect(duplicateIds(`${text}\n## もう 1 つ\n| I1 | かぶり |`)).toEqual(["I1"]);
  });
});

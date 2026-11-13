// NORI-69：テストの一覧（docs/test-plans/NORI-xx.md）の各行に「確かめる範囲」「確かめない範囲（理由）」があるか。
// NORI-67 では、ルール「生きものの印（6粒）が水より目立つ」に対して1粒しか測らないテストが、ひも付けとしては
// 正しく見えて通った。確かめない範囲を書かせて、作る前に狭さに気づけるようにする（2026-11-13 にオーナーが採用）。
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const SCOPE = "確かめる範囲";
const NOT_SCOPE = "確かめない範囲（理由）";
const dir = path.resolve(import.meta.dirname, "../../docs/test-plans");

type Row = { line: number; cells: string[] };

const cellsOf = (line: string): string[] =>
  line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((c) => c.trim());

/** 一覧の表（見出しに「#」がある表）の見出しと行 */
export const parsePlan = (text: string): { header: string[]; rows: Row[] }[] => {
  const lines = text.split(/\r?\n/);
  const tables: { header: string[]; rows: Row[] }[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    if (!line.startsWith("|") || (cellsOf(line)[0] ?? "") !== "#") continue;
    const header = cellsOf(line);
    const rows: Row[] = [];
    let j = i + 2; // 見出しと区切りの行のあと
    while ((lines[j] ?? "").startsWith("|")) {
      rows.push({ line: j + 1, cells: cellsOf(lines[j] ?? "") });
      j++;
    }
    tables.push({ header, rows });
    i = j;
  }
  return tables;
};

// 初見のサブエージェント（.claude/agents/test-plan-reviewer.md）に突き合わせてもらった記録の行（2026-11-13 にオーナーが決めた）。
// 例：「- 初見レビュー：2026-11-13 test-plan-reviewer、指摘 3（直した 2・直さない 1：理由は下）」
const REVIEW_LINE = /^- 初見レビュー：\d{4}-\d{2}-\d{2} test-plan-reviewer、指摘 \d+/m;

/** 足りないところの一覧（空なら OK） */
export const findPlanProblems = (text: string): string[] => {
  const tables = parsePlan(text);
  if (tables.length === 0) return ["一覧の表（見出しが「#」で始まる表）がない"];
  const problems: string[] = [];
  if (!REVIEW_LINE.test(text)) {
    problems.push("「- 初見レビュー：YYYY-MM-DD test-plan-reviewer、指摘 N」の行がない");
  }
  for (const { header, rows } of tables) {
    const a = header.indexOf(SCOPE);
    const b = header.indexOf(NOT_SCOPE);
    if (a < 0 || b < 0) {
      problems.push(`表の見出しに「${SCOPE}」「${NOT_SCOPE}」の列がない`);
      continue;
    }
    for (const { line, cells } of rows) {
      for (const [k, name] of [
        [a, SCOPE],
        [b, NOT_SCOPE],
      ] as const) {
        const v = cells[k] ?? "";
        if (v === "" || /^[-—ー]+$/.test(v)) problems.push(`${line} 行目：「${name}」が空`);
      }
    }
  }
  return problems;
};

describe("テストの一覧の検査の仕組み", () => {
  const review = "- 初見レビュー：2026-11-13 test-plan-reviewer、指摘 0\n\n";
  const head = `${review}| # | テスト | ${SCOPE} | ${NOT_SCOPE} |\n| - | - | - | - |\n`;
  it("初見レビューの行がなければ落とす", () => {
    const noReview = head.replace(review, "");
    expect(findPlanProblems(`${noReview}| 1 | a | b | c |\n`).join()).toContain("初見レビュー");
  });
  it("2列がそろっていれば通す", () => {
    expect(findPlanProblems(`${head}| 1 | a | 6粒すべて | なし（ルールの文をすべて確かめる） |\n`)).toEqual(
      [],
    );
  });
  it("列がなければ落とす", () => {
    expect(findPlanProblems(`${review}| # | テスト |\n| - | - |\n| 1 | a |\n`).join()).toContain("列がない");
  });
  it("空や「-」だけの欄を落とす", () => {
    expect(findPlanProblems(`${head}| 1 | a |  | - |\n`)).toHaveLength(2);
  });
  it("表がなければ落とす", () => {
    expect(findPlanProblems("# 見出しだけ\n")).toHaveLength(1);
  });
});

describe("docs/test-plans の一覧に「確かめる範囲」「確かめない範囲（理由）」がある（NORI-69）", () => {
  const files = readdirSync(dir).filter((f) => /^NORI-\d+\.md$/.test(f));
  it("一覧が1つ以上ある", () => {
    expect(files.length).toBeGreaterThan(0);
  });
  it.each(files)("%s", (f) => {
    expect(findPlanProblems(readFileSync(path.join(dir, f), "utf8"))).toEqual([]);
  });
});

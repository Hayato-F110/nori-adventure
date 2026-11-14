// NORI-69：テストの一覧（docs/test-plans/NORI-xx.md）の各行に「確かめる範囲」「確かめない範囲（理由）」があるか。
// NORI-67 では、ルール「生きものの印（6粒）が水より目立つ」に対して1粒しか測らないテストが、ひも付けとしては
// 正しく見えて通った。確かめない範囲を書かせて、作る前に狭さに気づけるようにする（2026-11-13 にオーナーが採用）。
import { createHash } from "node:crypto";
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

/**
 * 一覧の表の「ハッシュ値」（2026-11-13 にオーナーが決めた）：表の見出しと行の中身（欄の前後の空白は除く）から作る、16 進 8 文字。
 * 初見レビューかオーナーの承認の行に「ハッシュ値 xxxxxxxx」と書き、今の表と同じ値でなければ落とす。
 * レビュー・承認のあとに表を1文字でも変えたら、回し直すか承認をもらい直すまで赤になる（書き忘れ・自己申告に頼らない）。
 * 回すのは2回まで（2回目は前回からの差分だけを見る）。残りはオーナーの承認で閉じる
 */
export const planFingerprint = (text: string): string =>
  createHash("sha256")
    .update(
      parsePlan(text)
        .map(({ header, rows }) => [header, ...rows.map((r) => r.cells)].map((c) => c.join("|")).join("\n"))
        .join("\n\n"),
    )
    .digest("hex")
    .slice(0, 8);

const SIGNED_LINE = /^- (?:初見レビュー|承認)：.*ハッシュ値 ([0-9a-f]{8})/gm;

/** 足りないところの一覧（空なら OK） */
export const findPlanProblems = (text: string): string[] => {
  const tables = parsePlan(text);
  if (tables.length === 0) return ["一覧の表（見出しが「#」で始まる表）がない"];
  const problems: string[] = [];
  if (!REVIEW_LINE.test(text)) {
    problems.push("「- 初見レビュー：YYYY-MM-DD test-plan-reviewer、指摘 N」の行がない");
  }
  const now = planFingerprint(text);
  const signed = [...text.matchAll(SIGNED_LINE)].map((m) => m[1]);
  if (!signed.includes(now)) {
    problems.push(
      `今の表（ハッシュ値 ${now}）は、初見レビューにもオーナーの承認にもまだ通っていない（レビュー・承認の行のハッシュ値：${signed.join("・") || "なし"}）`,
    );
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

/**
 * 「刈り取り」の節（2026-11-14 にオーナーが決めた）：一覧の各項目を、どの課題の完了条件で刈り取る（実装して確かめ、閉じる）かを書く。
 * 「## 刈り取り」の見出しのあとに、見出しが「項目」で始まり「課題」の列がある表を置く。
 * 一覧の表の行の「#」（1・2・E2E など）は、どれかの「項目」の頭（「：」か「 の」の前。「・」で区切り、「1〜7」は範囲）に出てくること。
 * 「課題」の欄は NORI-xx を含むか、「課題なし（理由）」で始まること（何も決めずに残さない）
 */
export const findHarvestProblems = (text: string): string[] => {
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex((l) => /^## 刈り取り/.test(l));
  if (start < 0) return ["「## 刈り取り」の節がない（各項目をどの課題の完了条件で閉じるか）"];
  const headerAt = lines.findIndex((l, i) => i > start && l.startsWith("|"));
  const header = headerAt < 0 ? [] : cellsOf(lines[headerAt] ?? "");
  const issueCol = header.indexOf("課題");
  if (header[0] !== "項目" || issueCol < 0) return ["「刈り取り」の節に、見出しが「項目」「課題」の表がない"];
  const problems: string[] = [];
  const covered = new Set<string>();
  for (let j = headerAt + 2; (lines[j] ?? "").startsWith("|"); j++) {
    const cells = cellsOf(lines[j] ?? "");
    const lead = (cells[0] ?? "").split(/：| の/)[0]?.trim() ?? "";
    for (const token of lead.split("・")) {
      const range = /^(\d+)〜(\d+)$/.exec(token);
      if (range === null) covered.add(token);
      else for (let n = Number(range[1]); n <= Number(range[2]); n++) covered.add(String(n));
    }
    const issue = cells[issueCol] ?? "";
    if (!/NORI-\d+/.test(issue) && !/^課題なし（.+）/.test(issue)) {
      problems.push(`${j + 1} 行目：「課題」が NORI-xx でも「課題なし（理由）」でもない`);
    }
  }
  for (const { rows } of parsePlan(text)) {
    for (const { cells } of rows) {
      const id = cells[0] ?? "";
      if (!covered.has(id)) problems.push(`一覧の「${id}」を、どの課題で刈り取るかが「刈り取り」の節にない`);
    }
  }
  return problems;
};

describe("刈り取りの節の検査の仕組み", () => {
  const plan = "| # | テスト |\n| - | - |\n| 1 | a |\n| 2 | b |\n| E2E | c |\n";
  const harvest = (rows: string) => `${plan}\n## 刈り取り\n\n| 項目 | 課題 |\n| - | - |\n${rows}`;
  it("節がなければ落とす", () => {
    expect(findHarvestProblems(plan).join()).toContain("節がない");
  });
  it("すべての行が、範囲（1〜2）や「・」の区切りで課題にひも付いていれば通す", () => {
    expect(
      findHarvestProblems(harvest("| 1〜2 | NORI-71 |\n| E2E の確かめない範囲：x | NORI-70 |\n")),
    ).toEqual([]);
    expect(findHarvestProblems(harvest("| 1・2・E2E | NORI-71 |\n"))).toEqual([]);
  });
  it("節に出てこない行があれば落とす", () => {
    expect(findHarvestProblems(harvest("| 1〜2 | NORI-71 |\n")).join()).toContain("「E2E」");
  });
  it("課題が空や「—」なら落とし、「課題なし（理由）」なら通す", () => {
    expect(findHarvestProblems(harvest("| 1・2・E2E | — |\n"))).toHaveLength(1);
    expect(findHarvestProblems(harvest("| 1・2・E2E | 課題なし（直す必要がない） |\n"))).toEqual([]);
  });
});

describe("テストの一覧の検査の仕組み", () => {
  const table = `| # | テスト | ${SCOPE} | ${NOT_SCOPE} |\n| - | - | - | - |\n`;
  /** 表に、今のハッシュ値のレビューの行を付ける */
  const signedBy = (rows: string, kind: "初見レビュー" | "承認" = "初見レビュー") => {
    const body = `${table}${rows}`;
    const line =
      kind === "初見レビュー"
        ? `- 初見レビュー：2026-11-13 test-plan-reviewer、指摘 0、ハッシュ値 ${planFingerprint(body)}`
        : `- 初見レビュー：2026-11-13 test-plan-reviewer、指摘 0、ハッシュ値 00000000\n- 承認：2026-11-13 オーナー、ハッシュ値 ${planFingerprint(body)}`;
    return `${line}\n\n${body}`;
  };
  const ok = "| 1 | a | 6粒すべて | なし（ルールの文をすべて確かめる） |\n";
  it("初見レビューの行がなければ落とす", () => {
    expect(findPlanProblems(`${table}${ok}`).join()).toContain("初見レビュー");
  });
  it("2列がそろい、今の表のハッシュ値がレビューの行にあれば通す", () => {
    expect(findPlanProblems(signedBy(ok))).toEqual([]);
  });
  it("レビューのあとに表を変えたら落とす（ハッシュ値が合わない）", () => {
    const changed = signedBy(ok).replace("6粒すべて", "1粒だけ");
    expect(findPlanProblems(changed).join()).toContain("まだ通っていない");
  });
  it("レビューのあとに変えても、オーナーの承認の行のハッシュ値が今の表と同じなら通す（承認でループを閉じる）", () => {
    expect(findPlanProblems(signedBy(ok, "承認"))).toEqual([]);
  });
  it("整形で欄の空白の幅が変わっただけなら、ハッシュ値は変わらない", () => {
    const wide = ok.replace("| a |", "|   a   |");
    expect(planFingerprint(`${table}${wide}`)).toBe(planFingerprint(`${table}${ok}`));
  });
  it("列がなければ落とす", () => {
    expect(
      findPlanProblems(signedBy("| 1 | a |\n").replace(table, "| # | テスト |\n| - | - |\n")).join(),
    ).toContain("列がない");
  });
  it("空や「-」だけの欄を落とす", () => {
    expect(findPlanProblems(signedBy("| 1 | a |  | - |\n"))).toHaveLength(2);
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
    const text = readFileSync(path.join(dir, f), "utf8");
    expect([...findPlanProblems(text), ...findHarvestProblems(text)]).toEqual([]);
  });
});

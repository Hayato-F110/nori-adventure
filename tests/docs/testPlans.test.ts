// NORI-69：テストの一覧（docs/test-plans/NORI-xx.md）の各行に「確かめる範囲」「確かめない範囲（理由）」があるか。
// NORI-67 では、ルール「生きものの印（6粒）が水より目立つ」に対して1粒しか測らないテストが、ひも付けとしては
// 正しく見えて通った。確かめない範囲を書かせて、作る前に狭さに気づけるようにする（2026-11-13 にオーナーが採用）。
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
// @ts-expect-error -- Hook は素の JavaScript（.mjs）で、型定義を持たない。刈り取りの表の読み方を Hook と同じにする
import { harvestTable } from "../../.claude/hooks/harvest-before-done.mjs";

type HarvestTable = {
  header: string[];
  rows: { lineNo: number; item: string; issue: string; result: string }[];
};

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
 * 2026-11-14 にオーナーが決めた形（**1項目1行・結果の列**）：課題の完了条件は「この表で、その課題の行の結果がすべて埋まっていること」。
 * 閉じる前に Hook（.claude/hooks/harvest-before-done.mjs）が同じ表を読み、結果が空か「まだ」の行があれば止める。
 * - 見出しに「項目」「課題」「結果」の列がある
 * - 一覧の表の行の「#」（1・2・E2E など）ごとに、「項目」がちょうどその「#」の行が1つある（「1〜4」「1・2」のまとめ書きは不可）
 * - 「確かめない範囲（理由）」が空でも「—」でもない行は、「項目」が「# の確かめない範囲」で始まる行が1つ以上ある
 * - 「課題」の欄は NORI-xx を含むか、「課題なし（理由）」で始まる（何も決めずに残さない）
 * - 「結果」の欄は空にしない（まだなら「（まだ）」、課題なしなら「（承認で閉じる）」など）
 */
export const findHarvestProblems = (text: string): string[] => {
  if (!/^## 刈り取り/m.test(text))
    return ["「## 刈り取り」の節がない（各項目をどの課題の完了条件で閉じるか）"];
  const table = harvestTable(text) as HarvestTable | null;
  const header = table?.header ?? [];
  if (table === null || header[0] !== "項目" || !header.includes("課題") || !header.includes("結果")) {
    return [
      "「刈り取り」の節に、見出しが「項目」「課題」「結果」の表がない（1項目1行。結果は閉じるときに埋める）",
    ];
  }
  const problems: string[] = [];
  const items = table.rows.map((r) => r.item);
  for (const { lineNo, item, issue, result } of table.rows) {
    if (/〜/.test(item.split(/：| の/)[0] ?? "") || /^[^：]*・/.test(item.split(/ の|：/)[0] ?? "")) {
      problems.push(`${lineNo} 行目：「${item}」は項目をまとめて書いている（1項目1行に分ける）`);
    }
    if (!/NORI-\d+/.test(issue) && !/^課題なし（.+）/.test(issue)) {
      problems.push(`${lineNo} 行目：「課題」が NORI-xx でも「課題なし（理由）」でもない`);
    }
    if (result === "") problems.push(`${lineNo} 行目：「結果」が空（まだなら「（まだ）」と書く）`);
  }
  for (const { header: planHeader, rows } of parsePlan(text)) {
    const notScope = planHeader.indexOf(NOT_SCOPE);
    for (const { cells } of rows) {
      const id = cells[0] ?? "";
      if (!items.includes(id))
        problems.push(`一覧の「${id}」の行が「刈り取り」の表にない（項目がちょうど「${id}」の行）`);
      const reason = notScope < 0 ? "" : (cells[notScope] ?? "");
      if (
        reason !== "" &&
        !/^[-—ー]+$/.test(reason) &&
        !items.some((i) => i.startsWith(`${id} の確かめない範囲`))
      ) {
        problems.push(
          `一覧の「${id}」の確かめない範囲を、どの課題で刈り取るかが「刈り取り」の表にない（「${id} の確かめない範囲：…」の行）`,
        );
      }
    }
  }
  return problems;
};

/**
 * 「計算」の節（2026-11-14 にオーナーが決めた。NORI-71 で、計算の前に E2E と値の掃引（値を段階的に変えてまとめて測ること）を流したため）：
 * 見た目（明るさの比・色）や動き（速さ・距離）の値を E2E で測るテストがあるときは、流す前に式で必要な値を計算し、
 * 「## 計算」の節に表で書く（CLAUDE.md「数値は試行錯誤で決めない」の①）。ないときは「なし（理由）」と書く
 */
export const findCalcProblems = (text: string): string[] => {
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex((l) => /^## 計算/.test(l));
  if (start < 0)
    return ["「## 計算」の節がない（値を測る E2E の前に、式で計算した表。ないときは「なし（理由）」）"];
  const body: string[] = [];
  for (let i = start + 1; i < lines.length && !/^## /.test(lines[i] ?? ""); i++) {
    const l = (lines[i] ?? "").trim();
    if (l !== "") body.push(l);
  }
  const hasTable = body.some((l) => l.startsWith("|"));
  const none = body.some((l) => /^なし（.+）/.test(l));
  return hasTable || none ? [] : ["「計算」の節に、計算の表も「なし（理由）」もない"];
};

describe("計算の節の検査の仕組み", () => {
  it("節がなければ落とす", () => {
    expect(findCalcProblems("# 一覧\n").join()).toContain("節がない");
  });
  it("表か「なし（理由）」があれば通し、空なら落とす", () => {
    expect(findCalcProblems("## 計算\n\n| 値 | 式 |\n| - | - |\n| 比 | 3.2 |\n")).toEqual([]);
    expect(findCalcProblems("## 計算\n\nなし（値を測る E2E がない）\n")).toEqual([]);
    expect(findCalcProblems("## 計算\n\nあとで書く\n\n## 次\n")).toHaveLength(1);
  });
});

describe("刈り取りの節の検査の仕組み", () => {
  // 一覧：1 と E2E は確かめない範囲あり、2 は「—」
  const plan = `| # | テスト | ${NOT_SCOPE} |\n| - | - | - |\n| 1 | a | x（理由） |\n| 2 | b | — |\n| E2E | c | y（理由） |\n`;
  const harvest = (rows: string) => `${plan}\n## 刈り取り\n\n| 項目 | 課題 | 結果 |\n| - | - | - |\n${rows}`;
  const full =
    "| 1 | NORI-71 | （まだ） |\n| 2 | NORI-71 | （まだ） |\n| E2E | NORI-71 | （まだ） |\n" +
    "| 1 の確かめない範囲：x | 課題なし（直す必要がない） | （承認で閉じる） |\n| E2E の確かめない範囲：y | NORI-70 | （まだ） |\n";
  it("節がなければ落とす", () => {
    expect(findHarvestProblems(plan).join()).toContain("節がない");
  });
  it("1項目1行で、行ごと・確かめない範囲ごとに課題と結果があれば通す", () => {
    expect(findHarvestProblems(harvest(full))).toEqual([]);
  });
  it("「結果」の列がなければ落とす", () => {
    const noResult = `${plan}\n## 刈り取り\n\n| 項目 | 課題 |\n| - | - |\n| 1 | NORI-71 |\n`;
    expect(findHarvestProblems(noResult).join()).toContain("見出しが「項目」「課題」「結果」の表がない");
  });
  it("「1〜2」「1・2」のまとめ書きは落とす（項目がちょうどその「#」の行も足りない）", () => {
    const rest = full.split("\n").slice(2).join("\n");
    expect(findHarvestProblems(harvest(`| 1〜2 | NORI-71 | （まだ） |\n${rest}`)).join()).toContain(
      "まとめて",
    );
    expect(findHarvestProblems(harvest(`| 1・2 | NORI-71 | （まだ） |\n${rest}`)).join()).toContain(
      "まとめて",
    );
  });
  it("一覧の行が表にない、確かめない範囲の行がないと落とす（「—」の行は要らない）", () => {
    const without = (text: string) =>
      full
        .split("\n")
        .filter((l) => !l.startsWith(text))
        .join("\n");
    expect(findHarvestProblems(harvest(without("| E2E |"))).join()).toContain("「E2E」の行");
    expect(findHarvestProblems(harvest(without("| 1 の確かめない"))).join()).toContain(
      "「1」の確かめない範囲",
    );
    expect(findHarvestProblems(harvest(full)).join()).not.toContain("「2」の確かめない範囲");
  });
  it("課題が空や「—」、結果が空なら落とし、「課題なし（理由）」なら通す", () => {
    expect(findHarvestProblems(harvest(full.replace("| 2 | NORI-71 |", "| 2 | — |"))).join()).toContain(
      "「課題」",
    );
    expect(
      findHarvestProblems(harvest(full.replace("| 2 | NORI-71 | （まだ） |", "| 2 | NORI-71 |  |"))).join(),
    ).toContain("「結果」が空");
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
    expect([...findPlanProblems(text), ...findHarvestProblems(text), ...findCalcProblems(text)]).toEqual([]);
  });
});

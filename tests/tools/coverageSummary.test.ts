// NORI-68：カバレッジの結果（coverage/coverage-summary.json）から、CI の実行結果のまとめに出す表を作る
import { describe, expect, it } from "vitest";
import { coverageTable } from "../../tools/ci/coverage-summary";

const metric = (pct: number, covered: number, total: number) => ({ pct, covered, total, skipped: 0 });
const summary = {
  total: {
    statements: metric(98.36, 600, 610),
    branches: metric(90.51, 286, 316),
    functions: metric(100, 120, 120),
    lines: metric(99.3, 570, 574),
  },
  "C:/repo/src/core/course.ts": {
    statements: metric(97.87, 46, 47),
    branches: metric(69.56, 16, 23),
    functions: metric(100, 5, 5),
    lines: metric(97.56, 40, 41),
  },
  "C:/repo/src/config/index.ts": {
    statements: metric(100, 10, 10),
    branches: metric(100, 0, 0),
    functions: metric(100, 0, 0),
    lines: metric(100, 10, 10),
  },
};

describe("カバレッジの表（tools/ci/coverage-summary.ts）", () => {
  const table = coverageTable(summary, "C:/repo");

  it("全体の4つの値（命令・分岐・関数・行）を、割合と数で出す", () => {
    expect(table).toContain(
      "| 全体 | 98.36%（600/610） | 90.51%（286/316） | 100%（120/120） | 99.3%（570/574） |",
    );
  });

  it("ファイルはリポジトリからの道すじで、分岐の低い順に並べる", () => {
    const course = table.indexOf("| src/core/course.ts |");
    const config = table.indexOf("| src/config/index.ts |");
    expect(course).toBeGreaterThan(0);
    expect(config).toBeGreaterThan(course);
    expect(table).not.toContain("C:/repo");
  });

  it("ドライブ名の大文字・小文字や、区切りの \\ と / が違っても、リポジトリの場所を外す（Git Bash では c:\\ で渡る）", () => {
    expect(coverageTable(summary, "c:\\repo\\")).toContain("| src/core/course.ts |");
  });

  it("見出しは日本語", () => {
    expect(table).toContain("| ファイル | 命令 | 分岐 | 関数 | 行 |");
  });
});

// NORI-68：カバレッジの結果（coverage/coverage-summary.json。Vitest の json-summary）から、表（Markdown）を作る。
// 使い方（CI）：node tools/ci/coverage-summary.ts >> "$GITHUB_STEP_SUMMARY"
// GITHUB_STEP_SUMMARY に書いた Markdown は、GitHub の実行結果の画面の「Summary」に表として出る。
import { readFileSync } from "node:fs";
import path from "node:path";

type Metric = { pct: number; covered: number; total: number };
type FileSummary = { statements: Metric; branches: Metric; functions: Metric; lines: Metric };

const cell = (m: Metric) => `${m.pct}%（${m.covered}/${m.total}）`;
const row = (name: string, s: FileSummary) =>
  `| ${name} | ${cell(s.statements)} | ${cell(s.branches)} | ${cell(s.functions)} | ${cell(s.lines)} |`;

/** 全体の行と、ファイルごとの行（分岐の割合の低い順）の表。root はリポジトリの場所（表では外す） */
export const coverageTable = (summary: Record<string, FileSummary>, root: string): string => {
  const { total, ...files } = summary;
  // 区切りを / に、ドライブ名を大文字にそろえる（Git Bash からは c:\ で渡り、結果のファイルは C:/ で書かれる）
  const norm = (p: string) => p.replace(/\\/g, "/").replace(/^[a-z]:/, (d) => d.toUpperCase());
  const prefix = `${norm(root).replace(/\/$/, "")}/`;
  const rows = Object.entries(files)
    .map(([file, s]) => ({ name: norm(file).replace(prefix, ""), s }))
    .sort((a, b) => a.s.branches.pct - b.s.branches.pct || a.name.localeCompare(b.name))
    .map(({ name, s }) => row(name, s));
  return [
    "## 単体テストのカバレッジ（src/core・src/config。NORI-68）",
    "",
    "| ファイル | 命令 | 分岐 | 関数 | 行 |",
    "| --- | --- | --- | --- | --- |",
    ...(total === undefined ? [] : [row("全体", total)]),
    ...rows,
    "",
  ].join("\n");
};

// node で直接動かしたときだけ、ファイルを読んで表を出す（テストから読み込んだときは動かない）
if (process.argv[1] !== undefined && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  const file = path.resolve("coverage/coverage-summary.json");
  process.stdout.write(coverageTable(JSON.parse(readFileSync(file, "utf8")), process.cwd()));
}

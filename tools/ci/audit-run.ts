// NORI-88：CI から呼ぶ入口。npm audit を 2 回（すべての依存・本番の依存だけ）流し、tools/ci/audit-check.ts で判定する。
// 使い方（CI）：node tools/ci/audit-run.ts
// 「直接動かしたときだけ」の判定を置かない（判定が外れて何も調べずに通る、を作らないため）。判定の中身のテストは tests/tools/auditCheck.test.ts。
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { judgeBoth } from "./audit-check.ts";

const readStdout = (command: string): string => {
  try {
    // Windows では npm が npm.cmd でシェルが要るので、固定の 1 つの文字列で呼ぶ（外からの値は入れない）
    return execSync(command, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  } catch (err) {
    // npm audit は脆弱性があると終了コード 1 を返すので、そのときも出力（stdout）を読む
    const out = typeof err === "object" && err !== null && "stdout" in err ? err.stdout : undefined;
    return typeof out === "string" ? out : "";
  }
};

const parse = (raw: string): unknown => {
  try {
    return JSON.parse(raw);
  } catch {
    return null; // 読めなければ judgeAudit が落とす
  }
};

const allow: unknown = JSON.parse(readFileSync(path.resolve("tools/ci/audit-allow.json"), "utf8"));
// 見直す日は日本時間で数える（en-CA の書式は YYYY-MM-DD）
const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo" }).format(new Date());
const result = judgeBoth(
  parse(readStdout("npm audit --json")),
  parse(readStdout("npm audit --omit=dev --json")),
  allow,
  today,
);
process.stdout.write([...result.lines, ""].join("\n"));
process.exitCode = result.ok ? 0 : 1;

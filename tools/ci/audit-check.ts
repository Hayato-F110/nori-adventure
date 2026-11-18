// NORI-88：npm audit の high 以上のうち、除く表（tools/ci/audit-allow.json）にあるものだけを通す。
// 使い方（CI）：node tools/ci/audit-check.ts
// 今までの `npm audit --audit-level=high` と同じく、high・critical が 1 つでもあれば落とす。
// 例外は、影響を確かめて、理由と見直す日を表に書いたものだけ。見直す日を過ぎたら落とす。
// npm audit --json の形（auditReportVersion 2）：https://docs.npmjs.com/cli/v11/commands/npm-audit
//   vulnerabilities の各パッケージの via に、脆弱性の情報（オブジェクト）か、経由したパッケージの名前（文字列）が入る。
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";

export type AllowEntry = { id: string; package: string; reason: string; until: string };
export type AuditResult = { ok: boolean; lines: string[] };

const BLOCKING = new Set(["high", "critical"]);

type Advisory = { id: string | undefined; pkg: string; severity: string; title: string };

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;

/** via の中の脆弱性の情報を、重なりなく集める（ID とパッケージの組で 1 つ） */
const collectAdvisories = (vulnerabilities: Record<string, unknown>): Advisory[] => {
  const found = new Map<string, Advisory>();
  for (const vuln of Object.values(vulnerabilities)) {
    if (!isRecord(vuln) || !Array.isArray(vuln.via)) continue;
    for (const via of vuln.via) {
      if (!isRecord(via)) continue; // 文字列は、ほかのパッケージを経由した印
      const url = typeof via.url === "string" ? via.url : "";
      const id = /\/(GHSA(?:-[a-z0-9]{4}){3})$/.exec(url)?.[1];
      const pkg = typeof via.name === "string" ? via.name : "（名前なし）";
      const severity = typeof via.severity === "string" ? via.severity : "（不明）";
      const title = typeof via.title === "string" ? via.title : "";
      found.set(`${id ?? url}|${pkg}`, { id, pkg, severity, title });
    }
  }
  return [...found.values()];
};

/** 判定。today は YYYY-MM-DD（UTC）。文字列のまま比べる（同じ形なので、辞書順が日付の順） */
export const judgeAudit = (report: unknown, allow: AllowEntry[], today: string): AuditResult => {
  if (!isRecord(report) || report.auditReportVersion !== 2 || "error" in report || !isRecord(report.vulnerabilities)) {
    return { ok: false, lines: ["npm audit の出力が読めない（auditReportVersion 2 の形でない、または error がある）"] };
  }
  const lines: string[] = [];
  let ok = true;
  const advisories = collectAdvisories(report.vulnerabilities);
  for (const a of advisories) {
    // 表にあるかは、ID とパッケージの両方で見る（同じ ID でも、別のパッケージは影響を確かめていない）
    const entry = allow.find((e) => e.id === a.id && e.package === a.pkg);
    if (BLOCKING.has(a.severity) || a.severity === "（不明）") {
      if (entry === undefined) {
        ok = false;
        lines.push(`NG：${a.id ?? "（GHSA の ID なし）"}（${a.pkg}、${a.severity}）は除く表にない。${a.title}`);
      } else if (today > entry.until) {
        ok = false;
        lines.push(`NG：${entry.id}（${entry.package}）は見直す日 ${entry.until} を過ぎた。影響を確かめ直して表を直す`);
      } else {
        lines.push(`除いた：${entry.id}（${entry.package}、${a.severity}）見直す日 ${entry.until}。理由：${entry.reason}`);
      }
    }
  }
  for (const e of allow) {
    if (!advisories.some((a) => a.id === e.id && a.pkg === e.package)) {
      lines.push(`表から外せる：${e.id}（${e.package}）は、もう npm audit に出ていない`);
    }
  }
  return { ok, lines };
};

// node で直接動かしたときだけ、npm audit を流して判定する（テストから読み込んだときは動かない）
if (process.argv[1] !== undefined && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  let raw = "";
  try {
    // npm audit は脆弱性があると終了コード 1 を返すので、そのときも出力（stdout）を読む
    // Windows では npm が npm.cmd でシェルが要るので、固定の 1 つの文字列で呼ぶ（外からの値は入れない）
    raw = execSync("npm audit --json", { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  } catch (err) {
    raw = isRecord(err) && typeof err.stdout === "string" ? err.stdout : "";
  }
  let report: unknown = null;
  try {
    report = JSON.parse(raw);
  } catch {
    report = null;
  }
  const allow = JSON.parse(readFileSync(path.resolve("tools/ci/audit-allow.json"), "utf8")) as AllowEntry[];
  const today = new Date().toISOString().slice(0, 10);
  const result = judgeAudit(report, allow, today);
  for (const line of result.lines) console.log(line);
  console.log(result.ok ? "OK：除く表にない high・critical はない" : "NG：上の行を直す");
  process.exitCode = result.ok ? 0 : 1;
}

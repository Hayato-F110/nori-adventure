// NORI-88：npm audit の high 以上のうち、除く表（tools/ci/audit-allow.json）にあるものだけを通す。
// 使い方（CI）：node tools/ci/audit-check.ts
// 今までの `npm audit --audit-level=high` と同じく、high・critical が 1 つでもあれば落とす。
// 例外は、影響を確かめて、重さ・理由・見直す日を表に書いたものだけ。見直す日（日本時間）を過ぎたら落とす。
// 除く表は「開発の道具だけ」の例外なので、本番の依存だけの audit（--omit=dev）は例外なしで見る。
// npm audit --json の形（auditReportVersion 2）：https://docs.npmjs.com/cli/v11/commands/npm-audit
//   vulnerabilities の各パッケージの via に、脆弱性の情報（オブジェクト）か、経由したパッケージの名前（文字列）が入る。
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";

export type AllowEntry = { id: string; package: string; severity: string; reason: string; until: string };
export type AuditResult = { ok: boolean; lines: string[] };

const BLOCKING = new Set(["high", "critical"]);

type Advisory = { id: string | undefined; pkg: string; severity: string | undefined; title: string };

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;
const nonEmpty = (v: unknown): v is string => typeof v === "string" && v.length > 0;

/** 除く表の 1 行の形を確かめる。見直す日がない・書き間違いの行を通すと、期限が切れない例外になるため */
const isAllowEntry = (e: unknown): e is AllowEntry =>
  isRecord(e) &&
  typeof e.id === "string" &&
  /^GHSA(-[a-z0-9]{4}){3}$/.test(e.id) &&
  nonEmpty(e.package) &&
  typeof e.severity === "string" &&
  BLOCKING.has(e.severity) &&
  nonEmpty(e.reason) &&
  typeof e.until === "string" &&
  /^\d{4}-\d{2}-\d{2}$/.test(e.until);

/** via の中の脆弱性の情報を、重なりなく集める（ID・パッケージ・題名の組で 1 つ） */
const collectAdvisories = (vulnerabilities: Record<string, unknown>): Advisory[] => {
  const found = new Map<string, Advisory>();
  for (const vuln of Object.values(vulnerabilities)) {
    if (!isRecord(vuln) || !Array.isArray(vuln.via)) continue;
    for (const via of vuln.via) {
      if (!isRecord(via)) continue; // 文字列は、ほかのパッケージを経由した印
      const url = typeof via.url === "string" ? via.url : "";
      const id = /\/(GHSA(?:-[a-z0-9]{4}){3})$/.exec(url)?.[1];
      const pkg = typeof via.name === "string" ? via.name : "（名前なし）";
      const severity = typeof via.severity === "string" ? via.severity : undefined;
      const title = typeof via.title === "string" ? via.title : "";
      found.set(JSON.stringify([id ?? url, pkg, title]), { id, pkg, severity, title });
    }
  }
  return [...found.values()];
};

/** 判定。today は YYYY-MM-DD（日本時間）。文字列のまま比べる（同じ形なので、辞書順が日付の順） */
export const judgeAudit = (report: unknown, allowInput: unknown, today: string): AuditResult => {
  if (
    !isRecord(report) ||
    report.auditReportVersion !== 2 ||
    "error" in report ||
    !isRecord(report.vulnerabilities)
  ) {
    return {
      ok: false,
      lines: ["npm audit の出力が読めない（auditReportVersion 2 の形でない、または error がある）"],
    };
  }
  if (!Array.isArray(allowInput) || !allowInput.every(isAllowEntry)) {
    return {
      ok: false,
      lines: [
        "除く表の形がおかしい（配列で、各行に GHSA の ID・パッケージ・重さ（high か critical）・理由・見直す日 YYYY-MM-DD）",
      ],
    };
  }
  const allow = allowInput;
  const lines: string[] = [];
  let ok = true;
  const advisories = collectAdvisories(report.vulnerabilities);
  for (const a of advisories) {
    // 重さが書かれていないものは、high と同じく止める
    if (a.severity !== undefined && !BLOCKING.has(a.severity)) continue;
    const shown = `${a.id ?? "（GHSA の ID なし）"}（${a.pkg}、${a.severity ?? "重さ不明"}）`;
    // 表にあるかは、ID とパッケージの両方で見る（同じ ID でも、別のパッケージは影響を確かめていない）
    const entry = allow.find((e) => e.id === a.id && e.package === a.pkg);
    if (entry === undefined) {
      ok = false;
      lines.push(`NG：${shown} は除く表にない。${a.title}`);
    } else if (entry.severity !== a.severity) {
      ok = false;
      lines.push(`NG：${shown} は、受け入れたときの重さ ${entry.severity} と違う。影響を確かめ直す`);
    } else if (today > entry.until) {
      ok = false;
      lines.push(`NG：${shown} は見直す日 ${entry.until} を過ぎた。影響を確かめ直して表を直す`);
    } else {
      lines.push(`除いた：${shown} 見直す日 ${entry.until}。理由：${entry.reason}`);
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
  const readStdout = (command: string): string => {
    try {
      // Windows では npm が npm.cmd でシェルが要るので、固定の 1 つの文字列で呼ぶ（外からの値は入れない）
      return execSync(command, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
    } catch (err) {
      // npm audit は脆弱性があると終了コード 1 を返すので、そのときも出力（stdout）を読む
      return isRecord(err) && typeof err.stdout === "string" ? err.stdout : "";
    }
  };
  const runAudit = (command: string): unknown => {
    const raw = readStdout(command);
    try {
      return JSON.parse(raw);
    } catch {
      return null; // 読めなければ judgeAudit が落とす
    }
  };
  const allow: unknown = JSON.parse(readFileSync(path.resolve("tools/ci/audit-allow.json"), "utf8"));
  // 見直す日は日本時間で数える（en-CA の書式は YYYY-MM-DD）
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo" }).format(new Date());
  const all = judgeAudit(runAudit("npm audit --json"), allow, today);
  const prod = judgeAudit(runAudit("npm audit --omit=dev --json"), [], today);
  const ok = all.ok && prod.ok;
  process.stdout.write(
    [
      "## すべての依存（例外は除く表だけ）",
      ...all.lines,
      "## 本番の依存だけ（--omit=dev。例外なし）",
      ...prod.lines,
      ok ? "OK：除く表にない high・critical はない" : "NG：上の行を直す",
      "",
    ].join("\n"),
  );
  process.exitCode = ok ? 0 : 1;
}

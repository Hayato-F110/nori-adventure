// NORI-88：npm audit の high 以上のうち、除く表（tools/ci/audit-allow.json）にあるものだけを通す判定。
// CI からは tools/ci/audit-run.ts を呼ぶ（npm audit を流してこの判定に渡す入口）。
// 今までの `npm audit --audit-level=high` と同じく、high・critical が 1 つでもあれば落とす。
// 例外は、影響を確かめて、重さ・理由・見直す日（今日から 14 日以内）を表に書いたものだけ。
// 重さが変わる・見直す日（日本時間）を過ぎる・audit に出なくなる（表から消す）と落とす。
// 除く表は「開発の道具だけ」の例外なので、本番の依存だけの audit（--omit=dev）は例外なしで見る（judgeBoth）。
// npm audit --json の形（auditReportVersion 2）：https://docs.npmjs.com/cli/v11/commands/npm-audit
//   vulnerabilities の各パッケージの via に、脆弱性の情報（オブジェクト）か、経由したパッケージの名前（文字列）が入る。

export type AllowEntry = { id: string; package: string; severity: string; reason: string; until: string };
export type AuditResult = { ok: boolean; lines: string[] };

/** 見直す日は、今日から何日先までにできるか（遠い日を書いて、ずっと例外にしないため） */
export const MAX_ALLOW_DAYS = 14;

const BLOCKING = new Set(["high", "critical"]);
const DAY_MS = 24 * 60 * 60 * 1000;

type Advisory = { id: string | undefined; pkg: string; severity: string | undefined; title: string };

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;
const nonEmpty = (v: unknown): v is string => typeof v === "string" && v.length > 0;

/** YYYY-MM-DD を、UTC の 0 時の数に。ない日付（2026-02-30 など）は undefined */
const dayNumber = (s: string): number | undefined => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (m === null) return undefined;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const t = Date.UTC(y, mo - 1, d);
  const back = new Date(t);
  return back.getUTCFullYear() === y && back.getUTCMonth() === mo - 1 && back.getUTCDate() === d
    ? t
    : undefined;
};

/** 除く表の 1 行の形を確かめる。見直す日がない・書き間違い・遠すぎる行を通すと、期限が切れない例外になるため */
const isAllowEntry = (e: unknown, today: string): e is AllowEntry => {
  if (!isRecord(e)) return false;
  const until = typeof e.until === "string" ? dayNumber(e.until) : undefined;
  const now = dayNumber(today);
  return (
    typeof e.id === "string" &&
    /^GHSA(-[a-z0-9]{4}){3}$/.test(e.id) &&
    nonEmpty(e.package) &&
    typeof e.severity === "string" &&
    BLOCKING.has(e.severity) &&
    nonEmpty(e.reason) &&
    until !== undefined &&
    now !== undefined &&
    until - now <= MAX_ALLOW_DAYS * DAY_MS
  );
};

const validAllowList = (allow: unknown, today: string): allow is AllowEntry[] =>
  Array.isArray(allow) &&
  allow.every((e) => isAllowEntry(e, today)) &&
  new Set(allow.map((e: AllowEntry) => JSON.stringify([e.id, e.package]))).size === allow.length;

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

/** 判定。today は YYYY-MM-DD（日本時間）。日付は文字列のまま比べる（同じ形なので、辞書順が日付の順） */
export const judgeAudit = (report: unknown, allowInput: unknown, today: string): AuditResult => {
  if (
    !isRecord(report) ||
    report.auditReportVersion !== 2 ||
    "error" in report ||
    !isRecord(report.vulnerabilities)
  ) {
    return {
      ok: false,
      lines: ["NG：npm audit の出力が読めない（auditReportVersion 2 の形でない、または error がある）"],
    };
  }
  if (!validAllowList(allowInput, today)) {
    return {
      ok: false,
      lines: [
        `NG：除く表の形がおかしい（配列で、各行に GHSA の ID・パッケージ・重さ（high か critical）・理由・見直す日（今日から ${MAX_ALLOW_DAYS} 日以内の YYYY-MM-DD）。同じ ID とパッケージの行は 1 つだけ）`,
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
    const e = allow.find((x) => x.id === a.id && x.package === a.pkg);
    if (e === undefined) {
      ok = false;
      lines.push(`NG：${shown} は除く表にない。${a.title}`);
    } else if (e.severity !== a.severity) {
      ok = false;
      lines.push(`NG：${shown} は、受け入れたときの重さ ${e.severity} と違う。影響を確かめ直す`);
    } else if (today > e.until) {
      ok = false;
      lines.push(`NG：${shown} は見直す日 ${e.until} を過ぎた。影響を確かめ直して表を直す`);
    } else {
      lines.push(`除いた：${shown} 見直す日 ${e.until}。理由：${e.reason}`);
    }
  }
  for (const e of allow) {
    if (!advisories.some((a) => a.id === e.id && a.pkg === e.package)) {
      // 残しておくと、同じ脆弱性が戻ってきたときに、影響を確かめずに通してしまう
      ok = false;
      lines.push(`NG：${e.id}（${e.package}）は、もう npm audit に出ていない。除く表から消す`);
    }
  }
  return { ok, lines };
};

/** すべての依存（除く表を使う）と、本番の依存だけ（--omit=dev。例外なし）の両方が通ったときだけ通す */
export const judgeBoth = (all: unknown, prod: unknown, allow: unknown, today: string): AuditResult => {
  const a = judgeAudit(all, allow, today);
  const p = judgeAudit(prod, [], today);
  const ok = a.ok && p.ok;
  return {
    ok,
    lines: [
      "## すべての依存（例外は除く表だけ）",
      ...a.lines,
      "## 本番の依存だけ（--omit=dev。例外なし）",
      ...p.lines,
      ok ? "OK：除く表にない high・critical はない" : "NG：上の行を直す",
    ],
  };
};

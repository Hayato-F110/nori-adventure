// NORI-88：npm audit の high 以上のうち、除く表（重さ・理由・見直す日つき）にあるものだけを通す判定
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { type AllowEntry, judgeAudit, judgeBoth, MAX_ALLOW_DAYS } from "../../tools/ci/audit-check";

const PICO = "GHSA-fc5q-39xc-vjpf";
const TODAY = "2026-11-18";

/** npm audit --json（auditReportVersion 2）の形。via の中のオブジェクトが脆弱性の情報、文字列はほかのパッケージ経由 */
const advisory = (pkg: string, ghsa: string, severity: string) => ({
  source: 1,
  name: pkg,
  dependency: pkg,
  title: `${pkg} の脆弱性`,
  url: `https://github.com/advisories/${ghsa}`,
  severity,
  range: "<=1.0.0",
});
const report = (vulns: Record<string, { severity: string; via: unknown[] }>) => ({
  auditReportVersion: 2,
  vulnerabilities: Object.fromEntries(Object.entries(vulns).map(([name, v]) => [name, { name, ...v }])),
  metadata: {},
});
const picoReport = () =>
  report({
    picomatch: { severity: "high", via: [advisory("picomatch", PICO, "high")] },
    vite: { severity: "high", via: ["picomatch", "tinyglobby"] },
    vitest: { severity: "high", via: ["picomatch", "vite"] },
  });
const entry: AllowEntry = {
  id: PICO,
  package: "picomatch",
  severity: "high",
  reason: "開発の道具だけで使う",
  until: "2026-11-25",
};
const allow: AllowEntry[] = [entry];
const text = (r: { lines: string[] }) => r.lines.join("\n");

describe("npm audit の判定（tools/ci/audit-check.ts）", () => {
  it("除く表の行の形がおかしいときは落とす（見直す日がない・日付の書き方・ない日付・文字でない日付・重さ・空の理由・空のパッケージ・ID の形）", () => {
    const noUntil = { id: PICO, package: "picomatch", severity: "high", reason: "開発の道具だけで使う" };
    const bads: unknown[] = [
      noUntil,
      { ...entry, until: "11/25" },
      { ...entry, until: "2026-02-30" },
      { ...entry, until: 20261125 },
      { ...entry, severity: "moderate" },
      { ...entry, reason: "" },
      { ...entry, package: "" },
      { ...entry, id: "CVE-2026-112366" },
    ];
    for (const bad of bads) {
      const r = judgeAudit(picoReport(), [bad], TODAY);
      expect(r.ok, JSON.stringify(bad)).toBe(false);
      expect(text(r), JSON.stringify(bad)).toMatch(/除く表の形/);
    }
  });

  it(`見直す日は、今日から ${MAX_ALLOW_DAYS} 日以内だけ（遠い日を書いて、ずっと例外にしない）`, () => {
    expect(MAX_ALLOW_DAYS).toBe(14);
    expect(judgeAudit(picoReport(), [{ ...entry, until: "2026-12-02" }], TODAY).ok).toBe(true);
    const far = judgeAudit(picoReport(), [{ ...entry, until: "2026-12-03" }], TODAY);
    expect(far.ok).toBe(false);
    expect(text(far)).toMatch(/除く表の形/);
  });

  it("同じ ID とパッケージの行が 2 つあれば落とす", () => {
    const r = judgeAudit(picoReport(), [entry, { ...entry, until: "2026-11-20" }], TODAY);
    expect(r.ok).toBe(false);
    expect(text(r)).toMatch(/除く表の形/);
  });

  it("除く表が配列でないときは落とす", () => {
    expect(judgeAudit(picoReport(), { id: PICO }, TODAY).ok).toBe(false);
  });

  it("受け入れた重さ（high）と違う重さ（critical に上がった）なら落とす", () => {
    const rep = report({
      picomatch: { severity: "critical", via: [advisory("picomatch", PICO, "critical")] },
    });
    const r = judgeAudit(rep, allow, TODAY);
    expect(r.ok).toBe(false);
    expect(text(r)).toContain("critical");
  });

  it("表にあるパッケージ（picomatch）でも、GHSA の ID が読めない high は落とす", () => {
    const noId = { ...advisory("picomatch", "", "high"), url: "", title: "ID なし" };
    const rep = report({ picomatch: { severity: "high", via: [advisory("picomatch", PICO, "high"), noId] } });
    const r = judgeAudit(rep, allow, TODAY);
    expect(r.ok).toBe(false);
    expect(text(r)).toContain("ID なし");
  });

  it("表にある ID とパッケージでも、重さが書かれていなければ落とす", () => {
    const noSeverity = { name: "picomatch", title: "重さなし", url: `https://github.com/advisories/${PICO}` };
    const rep = report({ picomatch: { severity: "high", via: [noSeverity] } });
    expect(judgeAudit(rep, allow, TODAY).ok).toBe(false);
  });

  it("GHSA の ID も URL もない high が同じパッケージに 2 つあれば、2 つとも出す", () => {
    const noId = (title: string) => ({ name: "x", title, severity: "high" });
    const r = judgeAudit(
      report({ x: { severity: "high", via: [noId("一つ目"), noId("二つ目")] } }),
      allow,
      TODAY,
    );
    expect(text(r)).toContain("一つ目");
    expect(text(r)).toContain("二つ目");
  });

  it("除く表にある high だけなら通し、除いたことを ID・見直す日つきで出す。ほかのパッケージ経由（文字列）は数えない", () => {
    const r = judgeAudit(picoReport(), allow, TODAY);
    expect(r.ok).toBe(true);
    expect(text(r)).toContain(PICO);
    expect(text(r)).toContain("2026-11-25");
  });

  it("見直す日の当日は通す", () => {
    expect(judgeAudit(picoReport(), allow, "2026-11-25").ok).toBe(true);
  });

  it("見直す日を過ぎたら落とす（見直す日と ID を出す）", () => {
    const r = judgeAudit(picoReport(), allow, "2026-11-26");
    expect(r.ok).toBe(false);
    expect(text(r)).toMatch(new RegExp(`${PICO}.*2026-11-25|2026-11-25.*${PICO}`));
  });

  it("表にない high・critical は落とし、その ID を出す", () => {
    for (const severity of ["high", "critical"]) {
      const rep = picoReport();
      Object.assign(rep.vulnerabilities, {
        lodash: { name: "lodash", severity, via: [advisory("lodash", "GHSA-aaaa-bbbb-cccc", severity)] },
      });
      const r = judgeAudit(rep, allow, TODAY);
      expect(r.ok, severity).toBe(false);
      expect(text(r)).toContain("GHSA-aaaa-bbbb-cccc");
    }
  });

  it("moderate 以下は表になくても通す（今までの --audit-level=high と同じ）", () => {
    const rep = picoReport();
    Object.assign(rep.vulnerabilities, {
      foo: { name: "foo", severity: "moderate", via: [advisory("foo", "GHSA-1111-2222-3333", "moderate")] },
      bar: { name: "bar", severity: "low", via: [advisory("bar", "GHSA-4444-5555-6666", "low")] },
    });
    expect(judgeAudit(rep, allow, TODAY).ok).toBe(true);
  });

  it("ID が同じでもパッケージが違えば落とす", () => {
    const rep = report({ other: { severity: "high", via: [advisory("other", PICO, "high")] } });
    expect(judgeAudit(rep, allow, TODAY).ok).toBe(false);
  });

  it("audit の出力が読めない（版が違う・error がある・vulnerabilities がない）ときは落とす", () => {
    expect(judgeAudit({ ...picoReport(), auditReportVersion: 1 }, allow, TODAY).ok).toBe(false);
    expect(judgeAudit({ ...picoReport(), error: { code: "ENOLOCK" } }, allow, TODAY).ok).toBe(false);
    expect(judgeAudit({ auditReportVersion: 2 }, allow, TODAY).ok).toBe(false);
    expect(judgeAudit(null, allow, TODAY).ok).toBe(false);
  });

  it("表にあるのに audit に出てこないもの（直った）は、表から消すまで落とす（残った例外が、戻ってきた脆弱性を黙って通さない）", () => {
    const r = judgeAudit(report({}), allow, TODAY);
    expect(r.ok).toBe(false);
    expect(text(r)).toMatch(/表から消す/);
  });
});

describe("すべての依存と本番の依存だけの 2 つの判定（judgeBoth）", () => {
  it("本番の依存だけの audit には、除く表を使わない（開発の道具だけの例外が本番に効かない）", () => {
    const r = judgeBoth(picoReport(), picoReport(), allow, TODAY);
    expect(r.ok).toBe(false);
    expect(text(r)).toMatch(/本番の依存だけ[\s\S]*NG/);
  });

  it("両方が通ったときだけ通す", () => {
    expect(judgeBoth(picoReport(), report({}), allow, TODAY).ok).toBe(true);
    const lodash = report({
      lodash: { severity: "high", via: [advisory("lodash", "GHSA-aaaa-bbbb-cccc", "high")] },
    });
    expect(judgeBoth(lodash, report({}), allow, TODAY).ok).toBe(false);
  });
});

describe("本物の除く表（tools/ci/audit-allow.json）", () => {
  it("判定と同じ確かめ方で、形がそろっている（今日の日本時間で、見直す日が 14 日以内）", () => {
    const real: unknown = JSON.parse(readFileSync("tools/ci/audit-allow.json", "utf8"));
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo" }).format(new Date());
    expect(text(judgeAudit(picoReport(), real, today))).not.toMatch(/除く表の形/);
  });
});

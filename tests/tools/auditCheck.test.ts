// NORI-88：npm audit の high 以上のうち、除く表（理由と見直す日つき）にあるものだけを通す判定
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { type AllowEntry, judgeAudit } from "../../tools/ci/audit-check";

const PICO = "GHSA-fc5q-39xc-vjpf";

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
const allow: AllowEntry[] = [
  { id: PICO, package: "picomatch", severity: "high", reason: "開発の道具だけで使う", until: "2026-11-25" },
];

describe("npm audit の判定（tools/ci/audit-check.ts）", () => {
  it("除く表の行の形がおかしい（見直す日がない・書き間違い）ときは落とす。期限が切れない例外を作らない", () => {
    const noUntil = { id: PICO, package: "picomatch", severity: "high", reason: "開発の道具だけで使う" };
    for (const bad of [
      [noUntil],
      [{ ...allow[0], until: "11/25" }],
      [{ ...allow[0], severity: "moderate" }],
    ]) {
      const r = judgeAudit(picoReport(), bad, "2026-11-18");
      expect(r.ok, JSON.stringify(bad)).toBe(false);
      expect(r.lines.join("\n")).toMatch(/除く表の形/);
    }
  });

  it("除く表が配列でないときは落とす", () => {
    expect(judgeAudit(picoReport(), { id: PICO }, "2026-11-18").ok).toBe(false);
  });

  it("受け入れた重さ（high）と違う重さ（critical に上がった）なら落とす", () => {
    const rep = report({
      picomatch: { severity: "critical", via: [advisory("picomatch", PICO, "critical")] },
    });
    const r = judgeAudit(rep, allow, "2026-11-18");
    expect(r.ok).toBe(false);
    expect(r.lines.join("\n")).toContain("critical");
  });

  it("GHSA の ID も URL もない high が同じパッケージに 2 つあれば、2 つとも出す", () => {
    const noId = (title: string) => ({ name: "x", title, severity: "high" });
    const rep = report({ x: { severity: "high", via: [noId("一つ目"), noId("二つ目")] } });
    const text = judgeAudit(rep, allow, "2026-11-18").lines.join("\n");
    expect(text).toContain("一つ目");
    expect(text).toContain("二つ目");
  });

  it("重さが書かれていない指摘は、high と同じく落とす", () => {
    const noSeverity = {
      name: "x",
      title: "重さなし",
      url: "https://github.com/advisories/GHSA-7777-8888-9999",
    };
    const rep = report({ x: { severity: "high", via: [noSeverity] } });
    expect(judgeAudit(rep, allow, "2026-11-18").ok).toBe(false);
  });

  it("除く表にある high だけなら通し、除いたことを ID・見直す日つきで出す。ほかのパッケージ経由（文字列）は数えない", () => {
    const r = judgeAudit(picoReport(), allow, "2026-11-18");
    expect(r.ok).toBe(true);
    expect(r.lines.join("\n")).toContain(PICO);
    expect(r.lines.join("\n")).toContain("2026-11-25");
  });

  it("見直す日の当日は通す", () => {
    expect(judgeAudit(picoReport(), allow, "2026-11-25").ok).toBe(true);
  });

  it("見直す日を過ぎたら落とす（見直す日と ID を出す）", () => {
    const r = judgeAudit(picoReport(), allow, "2026-11-26");
    expect(r.ok).toBe(false);
    expect(r.lines.join("\n")).toMatch(new RegExp(`${PICO}.*2026-11-25|2026-11-25.*${PICO}`));
  });

  it("表にない high・critical は落とし、その ID を出す", () => {
    for (const severity of ["high", "critical"]) {
      const rep = picoReport();
      Object.assign(rep.vulnerabilities, {
        lodash: { name: "lodash", severity, via: [advisory("lodash", "GHSA-aaaa-bbbb-cccc", severity)] },
      });
      const r = judgeAudit(rep, allow, "2026-11-18");
      expect(r.ok, severity).toBe(false);
      expect(r.lines.join("\n")).toContain("GHSA-aaaa-bbbb-cccc");
    }
  });

  it("moderate 以下は表になくても通す（今までの --audit-level=high と同じ）", () => {
    const rep = report({
      foo: { severity: "moderate", via: [advisory("foo", "GHSA-1111-2222-3333", "moderate")] },
      bar: { severity: "low", via: [advisory("bar", "GHSA-4444-5555-6666", "low")] },
    });
    expect(judgeAudit(rep, allow, "2026-11-18").ok).toBe(true);
  });

  it("ID が同じでもパッケージが違えば落とす", () => {
    const rep = report({ other: { severity: "high", via: [advisory("other", PICO, "high")] } });
    expect(judgeAudit(rep, allow, "2026-11-18").ok).toBe(false);
  });

  it("GHSA の ID が読めない high は落とす", () => {
    const rep = report({ x: { severity: "high", via: [{ ...advisory("x", "", "high"), url: "" }] } });
    expect(judgeAudit(rep, allow, "2026-11-18").ok).toBe(false);
  });

  it("audit の出力が読めない（版が違う・error がある・vulnerabilities がない）ときは落とす", () => {
    expect(judgeAudit({ ...picoReport(), auditReportVersion: 1 }, allow, "2026-11-18").ok).toBe(false);
    expect(judgeAudit({ ...picoReport(), error: { code: "ENOLOCK" } }, allow, "2026-11-18").ok).toBe(false);
    expect(judgeAudit({ auditReportVersion: 2 }, allow, "2026-11-18").ok).toBe(false);
    expect(judgeAudit(null, allow, "2026-11-18").ok).toBe(false);
  });

  it("表にあるのに audit に出てこないもの（直った）は通し、表から外せると出す", () => {
    const r = judgeAudit(report({}), allow, "2026-11-18");
    expect(r.ok).toBe(true);
    expect(r.lines.join("\n")).toMatch(/外せる/);
  });

  it("本物の除く表（tools/ci/audit-allow.json）：どの行も GHSA の ID・パッケージ・理由・見直す日（YYYY-MM-DD）がある", () => {
    const real = JSON.parse(readFileSync("tools/ci/audit-allow.json", "utf8")) as AllowEntry[];
    expect(real.length).toBeGreaterThan(0);
    for (const e of real) {
      expect(e.id).toMatch(/^GHSA(-[a-z0-9]{4}){3}$/);
      expect(e.package.length).toBeGreaterThan(0);
      expect(["high", "critical"]).toContain(e.severity);
      expect(e.reason.length).toBeGreaterThan(10);
      expect(e.until).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });
});

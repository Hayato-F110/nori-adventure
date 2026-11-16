import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
// @ts-expect-error -- Hook は素の JavaScript（.mjs）で、型定義を持たない（整形で行が分かれないよう、まとめて読む）
import * as hook_ from "../../.claude/hooks/approval-jira.mjs";

const { issuesInHarvestTables, jiraChecksOfThisTurn, missingJira, missingHarvestTable } = hook_ as {
  missingHarvestTable: (texts: string[], last: string) => string | null;
  issuesInHarvestTables: (text: string) => string[];
  jiraChecksOfThisTurn: (jsonl: string) => Map<string, boolean>;
  missingJira: (texts: string[], jsonl: string) => string[];
};

const root = path.resolve(import.meta.dirname, "../..");
const hook = path.join(root, ".claude/hooks/approval-jira.mjs");

const request = [
  "## NORI-57（リプレイ）テストの一覧の承認のお願い",
  "",
  "| 項目 | 課題 | 完了条件 | 結果 |",
  "| --- | --- | --- | --- |",
  "| 一覧 1 | [NORI-57](https://example.atlassian.net/browse/NORI-57) | テストが緑 | （まだ） |",
  "| 範囲の外：自動録画 | [NORI-42](https://example.atlassian.net/browse/NORI-42) | NORI-42 の一覧で見る | （まだ） |",
  "| 範囲の外：360 px | 課題なし（NORI-38 の横向き） | 承認で閉じる | （承認で閉じる） |",
].join("\n");

const said = (text: string) => ({
  type: "assistant",
  message: { role: "assistant", content: [{ type: "text", text }] },
});
const call = (id: string, name: string, key: string) => ({
  type: "assistant",
  message: { role: "assistant", content: [{ type: "tool_use", id, name, input: { issueIdOrKey: key } }] },
});
const result = (id: string, text: string) => ({
  type: "user",
  message: {
    role: "user",
    content: [{ type: "tool_result", tool_use_id: id, content: [{ type: "text", text }] }],
  },
});
const jsonlOf = (entries: object[]) => entries.map((e) => JSON.stringify(e)).join("\n");

const POINTS = "完了条件：NORI-57 の一覧の刈り取りの表で、NORI-57 の行の結果がすべて埋まっていること";
const OLD = "完了条件：ゴールのあと、ボタン1つで再生する";

describe("Hook：承認のお願いの刈り取りの表に出てくる課題は、同じ回で Jira の完了条件を確かめる（2026-11-15）", () => {
  it("「課題」の列から課題キーを集める。「課題なし」の行は、中に NORI-xx があっても数えない", () => {
    expect(issuesInHarvestTables(request)).toEqual(["NORI-57", "NORI-42"]);
  });

  it("「承認のお願い」がない返答や、「課題」の列のない表では集めない", () => {
    expect(issuesInHarvestTables(request.replace("承認のお願い", "報告"))).toEqual([]);
    expect(
      issuesInHarvestTables("承認のお願い\n\n| 項目 | 結果 |\n| --- | --- |\n| NORI-57 | 済み |"),
    ).toEqual([]);
  });

  it("同じ回の getJiraIssue・editJiraIssue の結果に「刈り取りの表」があれば、確かめたとみなす", () => {
    const jsonl = jsonlOf([
      { type: "system", subtype: "stop_hook_summary" },
      call("a", "mcp__claude_ai_Atlassian_MCP__getJiraIssue", "NORI-57"),
      result("a", POINTS),
      call("b", "mcp__claude_ai_Atlassian_MCP__editJiraIssue", "NORI-42"),
      result("b", OLD),
    ]);
    const checks = jiraChecksOfThisTurn(jsonl);
    expect(checks.get("NORI-57")).toBe(true);
    expect(checks.get("NORI-42")).toBe(false);
  });

  it("前の回（stop_hook_summary より前）の確かめは数えない", () => {
    const jsonl = jsonlOf([
      call("a", "mcp__claude_ai_Atlassian_MCP__getJiraIssue", "NORI-57"),
      result("a", POINTS),
      { type: "system", subtype: "stop_hook_summary" },
      said(request),
    ]);
    expect(missingJira([request], jsonl)).toEqual(["NORI-57", "NORI-42"]);
  });

  it("どちらも同じ回で「刈り取りの表」を指していれば、足りないものはない", () => {
    const jsonl = jsonlOf([
      { type: "system", subtype: "stop_hook_summary" },
      call("a", "mcp__claude_ai_Atlassian_MCP__editJiraIssue", "NORI-57"),
      result("a", POINTS),
      call("b", "mcp__claude_ai_Atlassian_MCP__getJiraIssue", "NORI-42"),
      result("b", "NORI-57 の一覧の刈り取りの表で、課題が NORI-42 の行の結果"),
      said(request),
    ]);
    expect(missingJira([request], jsonl)).toEqual([]);
  });

  it("本物の Hook：足りない課題があれば止め（終了コード 2）、課題キーを知らせる。足りていれば通す", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "approval-jira-"));
    const run = (entries: object[]) => {
      const transcript = path.join(dir, `t${entries.length}.jsonl`);
      writeFileSync(transcript, jsonlOf(entries));
      try {
        execFileSync("node", [hook], {
          input: JSON.stringify({ transcript_path: transcript, last_assistant_message: request }),
          stdio: ["pipe", "pipe", "pipe"],
        });
        return { code: 0, stderr: "" };
      } catch (e) {
        const err = e as { status: number; stderr: Buffer };
        return { code: err.status, stderr: err.stderr.toString("utf8") };
      }
    };
    const blocked = run([{ type: "system", subtype: "stop_hook_summary" }, said(request)]);
    expect(blocked.code).toBe(2);
    expect(blocked.stderr).toContain("NORI-57");
    expect(blocked.stderr).toContain("NORI-42");

    const ok = run([
      { type: "system", subtype: "stop_hook_summary" },
      call("a", "mcp__claude_ai_Atlassian_MCP__getJiraIssue", "NORI-57"),
      result("a", POINTS),
      call("b", "mcp__claude_ai_Atlassian_MCP__getJiraIssue", "NORI-42"),
      result("b", "刈り取りの表で、課題が NORI-42 の行"),
      said(request),
    ]);
    expect(ok.code).toBe(0);
  });

  it("2回目（stop_hook_active）では止めない（止め続けないため）", () => {
    const out = execFileSync("node", [hook], { input: JSON.stringify({ stop_hook_active: true }) });
    expect(out.toString()).toBe("");
  });
});

// NORI-78 一覧 1〜3（docs/test-plans/NORI-78.md）：一覧の承認のお願いに、刈り取りの表がなければ止める（2026-11-16）
const ASK = [
  "## 承認のお願い：NORI-76 のテストの一覧（ハッシュ値 c630c0f5）",
  "",
  "変えた行：E1。おすすめ：承認。",
].join("\n");
const HARVEST = [
  "| 項目 | 課題 | その課題の完了条件に書いたこと | 結果 |",
  "| --- | --- | --- | --- |",
  "| E1 | NORI-76 | 一覧 E1 が CI で緑 | （まだ） |",
].join("\n");

describe("一覧 1：一覧の承認のお願いに、刈り取りの表がなければ止める（NORI-78）", () => {
  it("ハッシュ値があり、刈り取りの表がない：止めて、刈り取りの表を載せるよう知らせる", () => {
    const reason = missingHarvestTable([ASK], ASK);
    expect(reason).toContain("刈り取りの表");
  });

  it.each([
    ["ハッシュ値 c630c0f5"],
    ["ハッシュ値：c630c0f5"],
    ["ハッシュ値 `c630c0f5`"],
    ["ハッシュ値は c630c0f5"],
    ["ハッシュ値 C630C0F5"],
    ["`docs/test-plans/NORI-76.md` を直しました"],
    ["`docs\\test-plans\\NORI-76.md` を直しました"],
    ["テストの一覧を直しました"],
  ])("一覧の印「%s」があれば、表がないとき止める", (mark) => {
    const text = `## 承認のお願い

${mark}`;
    expect(missingHarvestTable([text], text)).not.toBeNull();
  });

  it("「課題」の列はあるが「項目」「結果」がない表（指摘の表など）だけなら止める", () => {
    const text = `${ASK}

| ID | 課題 | 仕分け |
| --- | --- | --- |
| R1 | NORI-76 | 直す |`;
    expect(missingHarvestTable([text], text)).not.toBeNull();
  });

  it("刈り取りの表が前の text、承認のお願いが最後の返答に分かれていても通す（R1-78-6・コードのレビュー 7）", () => {
    expect(missingHarvestTable([HARVEST, ASK], ASK)).toBeNull();
  });

  it("本物の Hook：表のない一覧の承認のお願いは止める（終了コード 2）", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "approval-jira-78-"));
    const transcript = path.join(dir, "t.jsonl");
    writeFileSync(transcript, jsonlOf([{ type: "system", subtype: "stop_hook_summary" }, said(ASK)]));
    let code = 0;
    let stderr = "";
    try {
      execFileSync("node", [hook], {
        input: JSON.stringify({ transcript_path: transcript, last_assistant_message: ASK }),
        stdio: ["pipe", "pipe", "pipe"],
      });
    } catch (e) {
      const err = e as { status: number; stderr: Buffer };
      code = err.status;
      stderr = err.stderr.toString("utf8");
    }
    expect(code).toBe(2);
    expect(stderr).toContain("刈り取りの表");
  });
});

describe("一覧 2：刈り取りの表があれば、今までどおり Jira の確かめに進む（NORI-78）", () => {
  it("刈り取りの表があれば、表の理由では止めない", () => {
    const text = `${ASK}

${HARVEST}`;
    expect(missingHarvestTable([text], text)).toBeNull();
  });

  it("表の行がすべて「課題なし」でも止めない（R1-78-15）", () => {
    const text = `${ASK}

| 項目 | 課題 | 完了条件 | 結果 |
| --- | --- | --- | --- |
| 7 の外 | 課題なし（人が見る） | — | （承認で閉じる） |`;
    expect(missingHarvestTable([text], text)).toBeNull();
    expect(issuesInHarvestTables(text)).toEqual([]);
  });

  it("Jira の確かめも、「項目・課題・結果」の表だけから課題を集める（R2-78-9）", () => {
    const text = `${ASK}

| ID | 課題 | 仕分け |
| --- | --- | --- |
| R1 | NORI-99 | 直す |

${HARVEST}`;
    expect(issuesInHarvestTables(text)).toEqual(["NORI-76"]);
  });
});

describe("一覧 3：一覧の承認のお願いでない返答は止めない（NORI-78）", () => {
  it.each([
    ["承認のお願いがない報告", "テストの一覧（ハッシュ値 c630c0f5）を直しました。"],
    ["一覧の印がない承認のお願い", "## 承認のお願い：NORI-80 をスプリント4に入れてよいか"],
    ["8 文字の 16 進でない", "## 承認のお願い\n\nハッシュ値 xxxxxxxx"],
    ["7 文字", "## 承認のお願い\n\nハッシュ値 c630c0f"],
    ["9 文字以上の 16 進（コミットの番号）", "## 承認のお願い\n\nハッシュ値 8628835897e1"],
  ])("%s", (_, text) => {
    expect(missingHarvestTable([text], text)).toBeNull();
  });

  it("途中の文の予告だけで、最後の返答が報告なら止めない（R2-78-2）", () => {
    const early = "テストの一覧を直してから、承認のお願いをします。";
    const last = "直しました。次に CI を見ます。";
    expect(missingHarvestTable([early, last], last)).toBeNull();
  });

  it("途中の文で一覧に触れ、最後の返答は一覧の印のない別の承認のお願いなら止めない（コードのレビュー 6）", () => {
    const early = "テストの一覧（`docs/test-plans/NORI-76.md`）を直しました。";
    const last = "## 承認のお願い：NORI-80 をスプリント4に入れてよいか";
    expect(missingHarvestTable([early, last], last)).toBeNull();
  });
});

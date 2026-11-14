// PreToolUse の Hook：Jira の課題を「完了」に移す前に、テストの一覧（docs/test-plans/*.md）の「刈り取り」の表を読み、
// その課題の行に「結果」が空か「まだ」の行が1つでもあれば止める（2026-11-14 にオーナーが決めた）。
// 理由：決まり（一覧の刈り取りの表と、課題の完了条件をつなぐ）はあったのに、11/14 に NORI-71 を完了条件を読み直さずに
// 完了にし、NORI-69 は未達の1か所をほかの課題に移して閉じるよう勧めた。守ることに頼らず、止める。
// 読むのは origin/main の一覧（マージしたあとに閉じるため）。古ければ「git fetch」してから閉じ直す。
// 止めたら、標準エラーの文が Claude に渡る（終了コード 2）。
import { execFileSync } from "node:child_process";

const BLOCK = 2;
const DONE_TRANSITION_ID = "31"; // docs/jira と /end-day：11＝未着手、21＝進行中、31＝完了
const DONE_NAME = "完了";

const cellsOf = (line) =>
  line
    .split("|")
    .slice(1, -1)
    .map((c) => c.trim());

/**
 * 一覧の「## 刈り取り」の表を読む。見出しの行の列名から「項目」「課題」「結果」の位置を決める。
 * 返す値：{ header, rows: [{ lineNo, item, issue, result }] }。節や表がなければ null
 */
export const harvestTable = (text) => {
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex((l) => /^## 刈り取り/.test(l));
  if (start < 0) return null;
  const headerAt = lines.findIndex((l, i) => i > start && l.startsWith("|"));
  if (headerAt < 0) return null;
  const header = cellsOf(lines[headerAt] ?? "");
  const issueCol = header.indexOf("課題");
  const resultCol = header.indexOf("結果");
  const rows = [];
  for (let j = headerAt + 2; (lines[j] ?? "").startsWith("|"); j++) {
    const cells = cellsOf(lines[j] ?? "");
    rows.push({
      lineNo: j + 1,
      item: cells[0] ?? "",
      issue: issueCol < 0 ? "" : (cells[issueCol] ?? ""),
      result: resultCol < 0 ? "" : (cells[resultCol] ?? ""),
    });
  }
  return { header, rows };
};

/** その課題で閉じる行か（「課題なし（…NORI-69…）」のように理由の中に出てくるだけのものは除く） */
const belongsTo = (issueCell, key) =>
  !issueCell.startsWith("課題なし") && new RegExp(`(^|[^0-9A-Z-])${key}(?![0-9])`).test(issueCell);

/** 結果が埋まっているか（空・「—」・「まだ」を含むものは埋まっていない） */
export const isFilled = (result) =>
  result !== "" && result !== "—" && result !== "-" && !result.includes("まだ");

/**
 * 止める理由（文字列の配列。空なら通す）。plans は [{ path, text }]
 * その課題の行が1つもないときは通す（テストの一覧を持たない課題。完了条件の確かめは CLAUDE.md の手順で行う）
 */
export const findUnharvested = (plans, key) => {
  const reasons = [];
  for (const { path, text } of plans) {
    const table = harvestTable(text);
    if (table === null) continue;
    for (const row of table.rows) {
      if (!belongsTo(row.issue, key)) continue;
      if (!isFilled(row.result))
        reasons.push(`${path}:${row.lineNo}「${row.item}」の結果が「${row.result || "空"}」`);
    }
  }
  return reasons;
};

/** 「完了」に移す操作か */
export const isDoneTransition = (toolInput) =>
  String(toolInput?.transitionId ?? "") === DONE_TRANSITION_ID ||
  String(toolInput?.transitionName ?? "") === DONE_NAME;

const readStdin = async () => {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
};

/** origin/main の docs/test-plans/*.md を読む（手元の作業中の変更ではなく、マージしたものを見る） */
const readPlansOnMain = (root) => {
  const git = (...args) => execFileSync("git", ["-C", root, ...args], { encoding: "utf8" });
  return git("ls-tree", "--name-only", "origin/main", "docs/test-plans/")
    .split("\n")
    .filter((p) => p.endsWith(".md"))
    .map((p) => ({ path: p, text: git("show", `origin/main:${p}`) }));
};

const main = async () => {
  const input = JSON.parse((await readStdin()) || "{}");
  if (!String(input.tool_name ?? "").endsWith("transitionJiraIssue")) return;
  if (!isDoneTransition(input.tool_input)) return;
  const key = String(input.tool_input?.issueIdOrKey ?? "").toUpperCase();
  if (!/^NORI-\d+$/.test(key)) return;
  const root = process.env.CLAUDE_PROJECT_DIR || process.cwd();
  const reasons = findUnharvested(readPlansOnMain(root), key);
  if (reasons.length === 0) return;
  process.stderr.write(
    `止めました：${key} の刈り取りの表に、結果が埋まっていない行があります（origin/main の一覧を読んだ）。\n` +
      reasons.map((r) => `- ${r}`).join("\n") +
      "\n結果を埋めた PR をマージしてから（古いときは git fetch してから）、完了に移してください。" +
      "未達の行をほかの課題に移すのは完了条件を書き換えることなので、オーナーに選択肢として出します。\n",
  );
  process.exit(BLOCK);
};

// テストから import したときは動かさない（guard-jira-fields.mjs と同じ書き方）
if (process.argv[1] && process.argv[1].replace(/\\/g, "/").endsWith("harvest-before-done.mjs")) {
  main().catch((error) => {
    // 読めないとき（origin/main がないなど）は止める：完了は取り消しにくい操作なので、確かめられないなら進めない
    process.stderr.write(
      `止めました：harvest-before-done で一覧を読めませんでした（${error.message}）。git fetch してからやり直してください。\n`,
    );
    process.exit(BLOCK);
  });
}

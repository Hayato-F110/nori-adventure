// Stop の Hook：この回の返答が「承認のお願い」で、刈り取りの表（「課題」の列がある表）を載せているなら、
// その列に出てくる課題（NORI-xx）ごとに、同じ回で Jira を読んだか直したかを確かめる。
// 確かめたとみなすのは、getJiraIssue・editJiraIssue の結果の文に「刈り取りの表」が入っているとき
// （Jira の完了条件が、リポジトリの刈り取りの表を指している）。足りなければ止める（終了コード 2）。
// 理由：2026-11-15、CLAUDE.md とメモリーに「Jira にそろえる」決まりがあったのに、NORI-57 の承認のお願いで
// Jira の完了条件を直していなかった。文章の決まりでは守れなかったので、機械で止める（オーナーの承認）。
// 見ないもの：Jira に書いた中身が正しいか（オーナーが承認のときにリンクで見る）。

import { readFileSync } from "node:fs";

const BLOCK = 2;
const KEY = /NORI-\d+/g;

const cellsOf = (line) =>
  line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((c) => c.trim());

/** 返答が「承認のお願い」なら、「課題」の列がある表から課題キーを集める（「課題なし」の行は除く） */
export const issuesInHarvestTables = (text) => {
  if (typeof text !== "string" || !text.includes("承認のお願い")) return [];
  const keys = [];
  let column = -1;
  for (const line of text.split("\n")) {
    if (!line.trim().startsWith("|")) {
      column = -1;
      continue;
    }
    const cells = cellsOf(line);
    if (column < 0) {
      column = cells.findIndex((c) => c === "課題");
      continue;
    }
    const cell = cells[column] ?? "";
    if (/^[-:\s]+$/.test(cell) || cell.startsWith("課題なし")) continue;
    for (const k of cell.match(KEY) ?? []) if (!keys.includes(k)) keys.push(k);
  }
  return keys;
};

const entriesOfThisTurn = (jsonl) => {
  const entries = [];
  for (const line of jsonl.split("\n").reverse()) {
    let entry;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }
    if (entry?.type === "system" && entry?.subtype === "stop_hook_summary") break;
    entries.push(entry);
  }
  return entries.reverse();
};

const textOf = (content) =>
  typeof content === "string"
    ? content
    : Array.isArray(content)
      ? content.map((c) => (typeof c?.text === "string" ? c.text : "")).join("\n")
      : "";

/** この回の getJiraIssue・editJiraIssue を、課題ごとに「結果に刈り取りの表があったか」でまとめる */
export const jiraChecksOfThisTurn = (jsonl) => {
  const calls = new Map(); // tool_use の id → 課題キー
  const checks = new Map();
  for (const entry of entriesOfThisTurn(jsonl)) {
    const content = entry?.message?.content;
    if (!Array.isArray(content)) continue;
    for (const c of content) {
      if (c?.type === "tool_use" && /(getJiraIssue|editJiraIssue)$/.test(c.name ?? "")) {
        const key = String(c.input?.issueIdOrKey ?? "").match(/NORI-\d+/)?.[0];
        if (key) calls.set(c.id, key);
      }
      if (c?.type === "tool_result" && calls.has(c.tool_use_id)) {
        const key = calls.get(c.tool_use_id);
        const ok = textOf(c.content).includes("刈り取りの表");
        checks.set(key, (checks.get(key) ?? false) || ok);
      }
    }
  }
  return checks;
};

/** 返答の刈り取りの表に出てくるのに、この回で Jira が表を指していると確かめていない課題 */
export const missingJira = (texts, jsonl) => {
  const keys = [...new Set(texts.flatMap(issuesInHarvestTables))];
  if (keys.length === 0) return [];
  const checks = jiraChecksOfThisTurn(jsonl);
  return keys.filter((k) => checks.get(k) !== true);
};

const readStdin = async () => {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
};

const main = async () => {
  const input = JSON.parse((await readStdin()) || "{}");
  if (input.stop_hook_active) return;
  let jsonl = "";
  if (typeof input.transcript_path === "string") {
    try {
      jsonl = readFileSync(input.transcript_path, "utf8");
    } catch {
      jsonl = "";
    }
  }
  const texts = entriesOfThisTurn(jsonl)
    .filter((e) => e?.type === "assistant")
    .flatMap((e) => (Array.isArray(e.message?.content) ? e.message.content : []))
    .filter((c) => c?.type === "text" && typeof c.text === "string")
    .map((c) => c.text);
  if (typeof input.last_assistant_message === "string") texts.push(input.last_assistant_message);
  const missing = missingJira(texts, jsonl);
  if (missing.length === 0) return;
  process.stderr.write(
    "止めました：承認のお願いの刈り取りの表に出てくる課題の Jira を、この回で確かめていません" +
      "（CLAUDE.md「刈り取りの節を書いてから承認を頼む」）。\n" +
      missing.map((k) => `- ${k}`).join("\n") +
      "\n各課題を getJiraIssue で読み、完了条件が「刈り取りの表で、この課題の行の結果がすべて埋まっていること」" +
      "（表へのリンク）でなければ editJiraIssue で直してから、承認のお願いを送り直してください。\n",
  );
  process.exit(BLOCK);
};

// テストから import したときは動かさない（ほかの Hook と同じ書き方）
if (process.argv[1] && process.argv[1].replace(/\\/g, "/").endsWith("approval-jira.mjs")) {
  main().catch((error) => {
    // 読めないときは通す（応答を止め続けないため）
    console.error(`approval-jira を実行できませんでした（通します）：${error.message}`);
  });
}

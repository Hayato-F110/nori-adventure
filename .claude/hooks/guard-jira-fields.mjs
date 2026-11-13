// PreToolUse の Hook：Jira（NORI）の課題を作るとき、ポイント・期限・開始日が入っていなければ、作る前に止める
// （スプリント2のふりかえりの改善③。2026-11-13 にオーナーが承認）。
// 理由：メモリー（jira-new-issue-fields）に書いても、11/13 に NORI-63・64 で開始日を入れ忘れた。文章の決まりでは止まらないので、仕組みで止める。
// 止めたら、標準エラーの文が Claude に渡る（終了コード 2）。

const BLOCK = 2;

// 欄の ID は Jira のサイトの設定（docs/jira/ とメモリー jira-new-issue-fields と同じ）
const REQUIRED = [
  ["customfield_10034", "ポイント（customfield_10034）"],
  ["duedate", "期限（duedate）"],
  ["customfield_10015", "開始日（customfield_10015。予定の日）"],
];
// 取り違えやすい欄（チームの管理のボードでは使われない）
const WRONG = [["customfield_10016", "customfield_10016 は使わない。ポイントは customfield_10034"]];
// ポイント・期限を付けない種類
const EXEMPT_TYPES = new Set(["epic", "エピック"]);

const isEmpty = (value) => value === undefined || value === null || value === "";

/** 止める理由（文字列の配列。空なら通す） */
export const findMissingJiraFields = (toolInput) => {
  if (!toolInput || String(toolInput.projectKey ?? "").toUpperCase() !== "NORI") return [];
  if (EXEMPT_TYPES.has(String(toolInput.issueType ?? "").toLowerCase())) return [];
  const fields = toolInput.additional_fields ?? {};
  const reasons = REQUIRED.filter(([key]) => isEmpty(fields[key])).map(([, label]) => `${label} がない`);
  for (const [key, label] of WRONG) {
    if (key in fields) reasons.push(label);
  }
  return reasons;
};

const readStdin = async () => {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
};

const main = async () => {
  const input = JSON.parse((await readStdin()) || "{}");
  if (!String(input.tool_name ?? "").endsWith("createJiraIssue")) return;
  const reasons = findMissingJiraFields(input.tool_input);
  if (reasons.length === 0) return;
  process.stderr.write(
    `止めました：Jira の課題に ${reasons.join("・")}。additional_fields に入れて作り直してください。` +
      "作ったあとは getJiraIssue で読み直して確かめます（スプリントはオーナーが入れる）。\n",
  );
  process.exit(BLOCK);
};

// テストから import したときは動かさない（guard-inline-backslash.mjs と同じ書き方）
if (process.argv[1] && process.argv[1].replace(/\\/g, "/").endsWith("guard-jira-fields.mjs")) {
  main().catch((error) => {
    // 入力を読めないときは通す（この Hook は進め方の決まりで、秘密を守るものではないため）
    console.error(`guard-jira-fields を実行できませんでした（通します）：${error.message}`);
  });
}

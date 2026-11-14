// Stop の Hook：応答を終える前に、この回に書いた文章を調べ、一般的でない用語（plain-terms.json の一覧）を
// 意味の説明なしで使っていたら止めて、言いかえるか、かっこで意味を添えるよう Claude に伝える（終了コード 2）。
// 理由：CLAUDE.md「一般的でない用語を使わない」を、止める仕組みがないまま破った（11/13「HUD」、11/14「掃引」）。
// 説明とみなすもの：用語のすぐあとの「（」「(」「とは」。この回の文章のどこか1か所にあればよい（初めて出す所に書く決まり）。
// 調べないもの：コードブロック・インラインのコード。止めたあとの再実行（stop_hook_active）では止めない。

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { textsOfThisTurn } from "./japanese-reply.mjs";

const BLOCK = 2;
const here = path.dirname(fileURLToPath(import.meta.url));

/** 一覧（plain-terms.json）の用語 */
export const loadTerms = () =>
  JSON.parse(readFileSync(path.join(here, "plain-terms.json"), "utf8")).terms.map((t) => t.term);

const withoutCode = (text) => text.replace(/```[\s\S]*?```/g, "").replace(/`[^`\n]*`/g, "");

/** 説明なしで使った用語（text はこの回の文章をつないだもの） */
export const findUndefinedTerms = (text, terms) => {
  const t = withoutCode(typeof text === "string" ? text : "");
  return terms.filter((term) => {
    if (!t.includes(term)) return false;
    const defined = ["（", "(", "とは"].some((mark) => t.includes(`${term}${mark}`));
    return !defined;
  });
};

const readStdin = async () => {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
};

const main = async () => {
  const input = JSON.parse((await readStdin()) || "{}");
  if (input.stop_hook_active) return;
  let texts = [];
  if (typeof input.transcript_path === "string") {
    try {
      texts = textsOfThisTurn(readFileSync(input.transcript_path, "utf8"));
    } catch {
      texts = [];
    }
  }
  if (typeof input.last_assistant_message === "string") texts.push(input.last_assistant_message);
  const found = findUndefinedTerms(texts.join("\n"), loadTerms());
  if (found.length === 0) return;
  process.stderr.write(
    `止めました：一般的でない用語を、意味の説明なしで使っています（${found.join("・")}）。\n` +
      "ふつうの言葉に言いかえるか、初めて出す所に「用語（一言の意味）」と書いてください。" +
      "途中の文は直せないので、最後の報告の中で、その用語の意味を一言で添えて、もう一度送ってください。\n",
  );
  process.exit(BLOCK);
};

// テストから import したときは動かさない（ほかの Hook と同じ書き方）
if (process.argv[1] && process.argv[1].replace(/\\/g, "/").endsWith("plain-terms.mjs")) {
  main().catch((error) => {
    // 読めないときは通す（応答を止め続けないため）
    console.error(`plain-terms を実行できませんでした（通します）：${error.message}`);
  });
}

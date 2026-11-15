// /start-day 用：.claude/agent-reports/ に自動で保存したサブエージェントの報告のうち、
// 指定した時間（既定 48 時間）の中に書いたものを、新しい順に一覧にする。
// 使い方：node tools/dev/agent-reports.mjs [時間]
// 一覧に出た報告は、中身が記録（docs/test-plans/reviews-*.md など）に写してあるかを確かめ、なければ写す。

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

/** 時間の中の報告を、新しい順に、種類と本文の1行目つきで返す */
export const recentReports = (dir, hours, now) => {
  if (!existsSync(dir)) return [];
  const since = now.getTime() - hours * 3600_000;
  return readdirSync(dir)
    .filter((f) => f.endsWith(".md"))
    .map((file) => ({ file, mtime: statSync(path.join(dir, file)).mtimeMs }))
    .filter((r) => r.mtime >= since && r.mtime <= now.getTime())
    .sort((a, b) => b.mtime - a.mtime)
    .map(({ file }) => {
      const text = readFileSync(path.join(dir, file), "utf8");
      const agentType = text.match(/^- 種類：(.*)$/m)?.[1] ?? "（不明）";
      const body = text.split("\n---\n").slice(1).join("\n---\n");
      const firstLine =
        body
          .split("\n")
          .find((l) => l.trim() !== "")
          ?.trim() ?? "";
      return { file, agentType, firstLine };
    });
};

if (process.argv[1] && process.argv[1].replace(/\\/g, "/").endsWith("agent-reports.mjs")) {
  const hours = Number(process.argv[2] ?? 48);
  const dir = path.join(process.cwd(), ".claude", "agent-reports");
  const list = recentReports(dir, hours, new Date());
  if (list.length === 0) console.info(`${hours} 時間の中に保存した報告はありません（${dir}）`);
  for (const r of list) console.info(`${r.file}｜${r.agentType}｜${r.firstLine.slice(0, 80)}`);
}

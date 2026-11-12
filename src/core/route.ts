// URL から開く画面を決める（NORI-30。docs/game-rules.md「タイトル画面・ステージ選び・クリアの演出」）。
// DOM に依存しない（location.search の文字列だけを受け取る）。
import { TITLE } from "../config";

export type StageNumber = (typeof TITLE.stages)[number];
export type Route = { kind: "title" } | { kind: "models" } | { kind: "stage"; stage: StageNumber };

const isStage = (n: number): n is StageNumber => (TITLE.stages as readonly number[]).includes(n);

/** ?models は確認用の画面、?stage=1〜4 はそのステージ、それ以外はタイトル */
export const parseRoute = (search: string): Route => {
  const params = new URLSearchParams(search);
  if (params.has("models")) return { kind: "models" };
  const raw = params.get("stage") ?? "";
  const n = /^\d+$/.test(raw) ? Number(raw) : Number.NaN;
  return isStage(n) ? { kind: "stage", stage: n } : { kind: "title" };
};

/** 「つぎ」のステージ。選べる最後のステージのあとはタイトル */
export const nextAfter = (stage: StageNumber): StageNumber | "title" => {
  const i = TITLE.stages.indexOf(stage);
  return TITLE.stages[i + 1] ?? "title";
};

/** ステージ・タイトルを開く URL（相対。GitHub Pages の /nori-adventure/ の下で開く） */
export const stageUrl = (to: StageNumber | "title"): string => (to === "title" ? "./" : `./?stage=${to}`);

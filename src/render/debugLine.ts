// NORI-34（docs/game-rules.md「実機の FPS」）：URL に debug を付けたときの上の表示の、FPS の部分。
// 実機（moto g64y 5G）で 60 秒遊んだあと、1 回読めば最小が分かるようにする。
import { PERF } from "../config";
import type { Quality } from "./quality";

/** 1 秒ごとの値の始めの PERF.skipSeconds 個（読み込み・覆い・画質の判定の間）を除いた最小。なければ null */
export const fpsMinAfterSkip = (samples: readonly number[]): number | null => {
  const counted = samples.slice(PERF.skipSeconds);
  return counted.length === 0 ? null : Math.min(...counted);
};

/**
 * 「45 fps · 最小 32 · 低」の文。今の FPS は四捨五入、最小は切り捨て（29.9 を「30」と見せない）、なければ「—」。
 * 各ステージは、このあとに「 · 」で今までの中身（速さ・深さなど）を続ける
 */
export const debugFpsLine = (fps: number, samples: readonly number[], quality: Quality): string => {
  const min = fpsMinAfterSkip(samples);
  return `${Math.round(fps)} fps · 最小 ${min === null ? "—" : Math.floor(min)} · ${quality === "low" ? "低" : "高"}`;
};

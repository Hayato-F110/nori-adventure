// ボスの見た目（docs/game-rules.md「ボスの見た目とエンディング」。NORI-29）。
// 届けた回数（0〜BOSS.calmPoints）から、体の色と口の形を決める。Three.js に依存しない（テストしやすく）。
import { BOSS } from "../config";

export type Mouth = "frown" | "flat" | "smile";

const channels = (hex: string) => {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255] as const;
};

/** 体の色：怒っている色 → 落ち着いた色を、回数に合わせて BOSS.calmPoints 段で混ぜる（sRGB の値で） */
export const bossColor = (calm: number): string => {
  const t = Math.min(1, Math.max(0, calm / BOSS.calmPoints));
  const a = channels(BOSS.angryColor);
  const b = channels(BOSS.calmColor);
  const mixed = a.map((v, i) => Math.round(v + ((b[i] ?? v) - v) * t));
  return `#${mixed.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
};

/** 口：0〜2 はへの字、3〜4 はまっすぐ、5（落ち着いた）は笑顔 */
export const bossMouth = (calm: number): Mouth =>
  calm >= BOSS.calmPoints ? "smile" : calm >= 3 ? "flat" : "frown";

/**
 * 落ち着いたあと（calmed）にボスがはねる高さ（m）：|sin(hopSpeed × 秒)| × hopHeight。落ち着く前と、動きを減らす設定では 0
 * （NORI-70：初見レビュー R2-70-2 で単体テストを足すため、描画の側から移した）
 */
export const bossHop = (seconds: number, calmed: boolean, reducedMotion: boolean): number =>
  calmed && !reducedMotion ? Math.abs(Math.sin(seconds * BOSS.hopSpeed)) * BOSS.hopHeight : 0;

/**
 * 岩を転がす前ぶれ（0〜1）：転がす rockWarnSeconds 前から 1 へふくらみ、転がしたら 0 に戻る。
 * 落ち着いたあと（calmed）は岩を転がさないので、ふくらまない（NORI-70：初見レビュー R2-29-35 で単体テストを足すため、描画の側から移した）
 */
export const bossPuff = (tick: number, fixedDt: number, calmed = false): number => {
  if (calmed) return 0;
  const interval = Math.round(BOSS.rockInterval / fixedDt);
  const warn = Math.round(BOSS.rockWarnSeconds / fixedDt);
  const untilNext = interval - (tick % interval);
  return untilNext <= warn && untilNext < interval ? 1 - untilNext / warn : 0;
};

// ステージ4の上の表示・見つけた印・▼ のヒントの動き（NORI-33。docs/game-rules.md「ステージ4」の NORI-33 の行）。
// 秒を受け取る純粋な関数と、「出た・増えた時刻」を覚える小さな時計。描画の時刻だけで動き、ゲームの状態は変えない。
import { STAGE4 } from "../config";

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/** 近づき具合（0〜1）→ 棒の幅（px） */
export const progressBarPx = (nearness: number): number => clamp01(nearness) * STAGE4.progressBarWidth;

/** 見つけた印の星の大きさ（0〜1）。見つけてからの秒。動きを減らす設定ではすぐ 1 */
export const foundStarScale = (seconds: number, reduced: boolean): number => {
  if (reduced) return 1;
  const t = clamp01(seconds / STAGE4.foundStarGrowSeconds);
  return 1 - (1 - t) * (1 - t); // はじめ速く、終わりはゆっくり
};

/** 見つけたときの上の表示の魚の絵の倍率。数が増えてからの秒。foundPopScale から 1 へ減っていく */
export const foundPopScale = (seconds: number, reduced: boolean): number => {
  if (reduced) return 1;
  const t = clamp01(seconds / STAGE4.foundPopSeconds);
  return 1 + (STAGE4.foundPopScale - 1) * (1 - t);
};

/**
 * ▼ のヒントの光の強さ（0〜1）。ヒントが出てからの秒。0 秒で 0、周期の半分で 1、周期で 0（ゆっくり。点滅しない）。
 * ▼ を押している間は 0、動きを減らす設定では 1 のまま
 */
export const diveHintGlow = (seconds: number, pressed: boolean, reduced: boolean): number => {
  if (pressed) return 0;
  if (reduced) return 1;
  return (1 - Math.cos((2 * Math.PI * seconds) / STAGE4.diveHintPeriod)) / 2;
};

/** 見つけた数が最後に増えた時刻からの秒（まだ増えていなければ null） */
export const createPopClock = () => {
  let lastCount = 0;
  let since: number | null = null;
  return {
    update(count: number, seconds: number): number | null {
      if (count > lastCount) since = seconds;
      lastCount = count;
      return since === null ? null : seconds - since;
    },
  };
};

/** ヒントが出た時刻からの秒。出していなければ null（消えたら忘れ、次に出たら 0 から） */
export const createHintClock = () => {
  let since: number | null = null;
  return {
    update(on: boolean, seconds: number): number | null {
      if (!on) {
        since = null;
        return null;
      }
      since ??= seconds;
      return seconds - since;
    },
  };
};

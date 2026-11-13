// ステージ1の雲とパトカー・消防車のランプ（NORI-61。docs/game-rules.md「街をにぎやかに」）。
// どちらも「ゲームを始めてからの刻みの数」だけで決まる（乱数・時刻を使わない。リプレイでも同じ見た目）。
import { SIM } from "../config";
import { hash01 } from "./stage1Layout";

export type CitySkyConfig = {
  readonly clouds: {
    readonly count: number;
    readonly minHeight: number;
    readonly maxHeight: number;
    readonly speed: number;
    readonly wrapX: number;
  };
};

export type CloudPosition = { readonly x: number; readonly y: number; readonly z: number };

/** hash01 の3つ目の値（ほかの使い道と重ならないように、この課題の番号） */
const SALT = 61;

/** tick 刻み目の雲の位置。+x へ流れ、x が wrapX を超えたら −wrapX へ戻る */
export const cloudPositions = (tick: number, config: CitySkyConfig): CloudPosition[] => {
  const { count, minHeight, maxHeight, speed, wrapX } = config.clouds;
  const width = 2 * wrapX;
  const moved = speed * tick * SIM.fixedDt;
  return Array.from({ length: count }, (_, i) => {
    const x0 = -wrapX + hash01(i, 1, SALT) * width;
    const shifted = (((x0 + wrapX + moved) % width) + width) % width; // 0 以上 width 未満
    return {
      x: shifted - wrapX,
      y: minHeight + hash01(i, 2, SALT) * (maxHeight - minHeight),
      z: -wrapX + hash01(i, 3, SALT) * width,
    };
  });
};

/** tick 刻み目に、赤・青のランプのどちらがつくか。reducedMotion（動きを減らす設定）なら両方つけたまま */
export const lampsOn = (
  tick: number,
  config: { readonly lampSwapSeconds: number },
  reducedMotion: boolean,
): { red: boolean; blue: boolean } => {
  if (reducedMotion) return { red: true, blue: true };
  const swapTicks = Math.round(config.lampSwapSeconds / SIM.fixedDt);
  const red = Math.floor(tick / swapTicks) % 2 === 0;
  return { red, blue: !red };
};

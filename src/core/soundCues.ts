// 鳴らす音を状態の変化から決める（NORI-31。docs/game-rules.md「効果音と BGM」）。
// 状態を読むだけで、音は出さない（音を出すのは src/render/sound.ts）。リプレイでも同じ結果になる。

/** 音を決めるのに使う状態（どのステージも同じ形にそろえて渡す） */
export type SoundSnapshot = {
  /** 取ったほし・くぐった輪・見つけた生きものの数 */
  collected: number;
  /** 通った旗・止まった駅の数 */
  checkpoints: number;
  finished: boolean;
  /** 乗り物が物に触れている */
  touching: boolean;
};

export type SoundCue = "collect" | "checkpoint" | "bump" | "goal";

/** MIDI の番号 → 周波数（Hz）。69 番が 440 Hz のラ */
export const noteFrequency = (note: number): number => 440 * 2 ** ((note - 69) / 12);

/** 前の状態と今の状態から、鳴らす音を決める（同じ刻みに2つ起きたら両方） */
export const soundCues = (prev: SoundSnapshot, curr: SoundSnapshot): SoundCue[] => {
  const cues: SoundCue[] = [];
  if (curr.collected > prev.collected) cues.push("collect");
  if (curr.checkpoints > prev.checkpoints) cues.push("checkpoint");
  if (curr.touching && !prev.touching) cues.push("bump");
  if (curr.finished && !prev.finished) cues.push("goal");
  return cues;
};

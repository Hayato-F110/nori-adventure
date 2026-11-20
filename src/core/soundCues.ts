// 鳴らす音を状態の変化から決める（NORI-31。docs/game-rules.md「効果音と BGM」）。
// 状態を読むだけで、音は出さない（音を出すのは src/render/sound.ts）。時間は刻みで数えるので、リプレイでも同じ結果になる。
import { SIM, SOUND } from "../config";

/** 音を決めるのに使う状態（どのステージも同じ形にそろえて渡す） */
export type SoundSnapshot = {
  /** ゲームの刻み（1/60 秒） */
  tick: number;
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

/**
 * 前の状態と今の状態から、鳴らす音を決める（同じ刻みに2つ起きたら両方）。ぶつかった音の間隔は見ない。
 * 「とった」は増えた数だけ返す（`SOUND.collectMaxRepeat` 回まで。NORI-85）
 */
export const soundCues = (prev: SoundSnapshot, curr: SoundSnapshot): SoundCue[] => {
  const cues: SoundCue[] = [];
  const gained = Math.min(curr.collected - prev.collected, SOUND.collectMaxRepeat);
  for (let k = 0; k < gained; k++) cues.push("collect");
  if (curr.checkpoints > prev.checkpoints) cues.push("checkpoint");
  if (curr.touching && !prev.touching) cues.push("bump");
  if (curr.finished && !prev.finished) cues.push("goal");
  return cues;
};

/**
 * 同じ刻みに返した音ごとの、鳴り始めを遅らせる秒（NORI-85）。
 * 同じ音の k 回目（0 から数える）は、1 回の長さ（音の数 × 1 音の秒）× k だけ遅らせる。ほかの音は遅らせない。
 * ずらすのは 1 回の呼び出しの中だけ（コマをまたぐ重なりは見ない。docs/game-rules.md の「一度に2つ以上とった」）
 */
export const cueOffsets = (cues: readonly SoundCue[]): number[] => {
  const seen = new Map<SoundCue, number>();
  return cues.map((cue) => {
    const k = seen.get(cue) ?? 0;
    seen.set(cue, k + 1);
    const e = SOUND.effects[cue];
    return k * e.notes.length * e.noteSeconds;
  });
};

/** ぶつかった音を鳴らしたら、この刻みの数は鳴らさない（0.5 秒 = 30 刻み） */
const BUMP_COOLDOWN_TICKS = Math.round(SOUND.bumpCooldownSeconds / SIM.fixedDt);

/** 状態を順に渡すと、鳴らす音を返す（ぶつかった音は、前に鳴らしてから 30 刻みたつまで鳴らさない） */
export const createSoundCueTracker = () => {
  let prev: SoundSnapshot | null = null;
  let lastBumpTick: number | null = null;
  return {
    next(curr: SoundSnapshot): SoundCue[] {
      const cues = prev === null ? [] : soundCues(prev, curr);
      prev = curr;
      return cues.filter((cue) => {
        if (cue !== "bump") return true;
        if (lastBumpTick !== null && curr.tick - lastBumpTick < BUMP_COOLDOWN_TICKS) return false;
        lastBumpTick = curr.tick;
        return true;
      });
    },
  };
};

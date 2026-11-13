import { describe, expect, it } from "vitest";
import { SIM, SOUND } from "../../src/config/index.ts";
import {
  createSoundCueTracker,
  noteFrequency,
  type SoundSnapshot,
  soundCues,
} from "../../src/core/soundCues.ts";

// docs/game-rules.md「効果音と BGM」（NORI-31）。テストの一覧の 1〜4
describe("音の高さ", () => {
  it("440 × 2^((n − 69) / 12) Hz", () => {
    expect(noteFrequency(69)).toBeCloseTo(440, 9);
    expect(noteFrequency(81)).toBeCloseTo(880, 9);
    expect(noteFrequency(88)).toBeCloseTo(1318.51, 2);
    expect(noteFrequency(45)).toBeCloseTo(110, 9);
  });

  const effectNotes = Object.values(SOUND.effects).flatMap((e) => [...e.notes]);
  const musicNotes = Object.values(SOUND.music).flatMap((m) => m.notes.filter((n) => n !== 0));

  it("全部の効果音と BGM の音が lowestNote〜highestNote（110〜1319 Hz）に入る", () => {
    for (const n of [...effectNotes, ...musicNotes]) {
      expect(n).toBeGreaterThanOrEqual(SOUND.lowestNote);
      expect(n).toBeLessThanOrEqual(SOUND.highestNote);
    }
    expect(noteFrequency(SOUND.highestNote)).toBeLessThan(1320);
  });

  it("波形はやわらかい正弦波・三角波だけ", () => {
    for (const e of Object.values(SOUND.effects)) expect(["sine", "triangle"]).toContain(e.wave);
  });

  it("BGM はステージごとに 16 音。速さは正", () => {
    for (const m of Object.values(SOUND.music)) {
      expect(m.notes).toHaveLength(16);
      expect(m.bpm).toBeGreaterThan(0);
    }
  });
});

describe("音の大きさ", () => {
  it("どの音量もゼロより大きく、効果音2つ＋BGM でも 1 未満（音が割れない）", () => {
    for (const g of [SOUND.effectGain, SOUND.bumpGain, SOUND.musicGain]) expect(g).toBeGreaterThan(0);
    expect(SOUND.effectGain * 2 + SOUND.musicGain).toBeLessThan(1);
  });

  it("BGM は効果音より 10 dB ほど小さい・ぶつかった音は 6 dB ほど小さい（20 × log10 の比）", () => {
    expect(20 * Math.log10(SOUND.effectGain / SOUND.musicGain)).toBeCloseTo(9.9, 1);
    expect(20 * Math.log10(SOUND.effectGain / SOUND.bumpGain)).toBeCloseTo(6.4, 1);
  });

  it("鳴り始めは 0 秒にしない（「プツッ」と鳴らさない）", () => {
    expect(SOUND.attackSeconds).toBeGreaterThan(0);
    expect(SOUND.musicAttackSeconds).toBeGreaterThan(0);
    expect(SOUND.muteRampSeconds).toBeGreaterThan(0);
  });
});

describe("鳴らす音の決め方（状態の変化から）", () => {
  const base: SoundSnapshot = { tick: 0, collected: 0, checkpoints: 0, finished: false, touching: false };

  it("何も変わらなければ鳴らさない", () => {
    expect(soundCues(base, base)).toEqual([]);
    const touching = { ...base, touching: true };
    expect(soundCues(touching, touching)).toEqual([]);
  });

  it("数が増えたら「とった」、旗・駅が増えたら「チェックポイント」", () => {
    expect(soundCues(base, { ...base, collected: 1 })).toEqual(["collect"]);
    expect(soundCues(base, { ...base, checkpoints: 1 })).toEqual(["checkpoint"]);
  });

  it("触れ始めの1回だけ「ぶつかった」。ゴールの1回だけ「ゴール」", () => {
    expect(soundCues(base, { ...base, touching: true })).toEqual(["bump"]);
    expect(soundCues({ ...base, touching: true }, base)).toEqual([]);
    expect(soundCues(base, { ...base, finished: true })).toEqual(["goal"]);
    expect(soundCues({ ...base, finished: true }, { ...base, finished: true })).toEqual([]);
  });

  it("同じ刻みに2つ起きたら両方", () => {
    expect(soundCues(base, { ...base, collected: 1, finished: true })).toEqual(["collect", "goal"]);
  });
});

describe("ぶつかった音の間隔（0.5 秒＝30 刻み。11/12 にオーナーが承認）", () => {
  const at = (tick: number, touching: boolean): SoundSnapshot => ({
    tick,
    collected: 0,
    checkpoints: 0,
    finished: false,
    touching,
  });
  const gap = Math.round(SOUND.bumpCooldownSeconds / SIM.fixedDt);

  it("間隔は 30 刻み", () => {
    expect(gap).toBe(30);
  });

  it("触れる・離れるをくり返しても、30 刻みの間は鳴らさない。30 刻みたてば鳴る", () => {
    const tracker = createSoundCueTracker();
    const bumps: number[] = [];
    // 10 刻みごとに触れる・離れるをくり返す
    for (let t = 0; t <= 100; t++) {
      const cues = tracker.next(at(t, Math.floor(t / 10) % 2 === 1));
      if (cues.includes("bump")) bumps.push(t);
    }
    expect(bumps).toEqual([10, 50, 90]);
  });

  it("ほかの音は間隔をあけない", () => {
    const tracker = createSoundCueTracker();
    tracker.next({ ...at(0, false) });
    expect(tracker.next({ ...at(1, false), collected: 1 })).toEqual(["collect"]);
    expect(tracker.next({ ...at(2, false), collected: 2 })).toEqual(["collect"]);
  });

  it("最初の状態では鳴らさない（前がないので比べない）", () => {
    expect(createSoundCueTracker().next(at(0, true))).toEqual([]);
  });
});

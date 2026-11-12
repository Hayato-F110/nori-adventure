// 効果音と BGM を Web Audio で鳴らす（NORI-31。docs/game-rules.md「効果音と BGM」）。
// 音のファイルは使わず、その場で正弦波・三角波を作る。状態は読むだけ（鳴らす音は src/core/soundCues.ts が決める）。
// ブラウザは最初の操作（キー・タッチ・クリック）まで音を出さないので、その時に AudioContext を作る。
import { SOUND } from "../config";
import { createSoundCueTracker, noteFrequency, type SoundCue, type SoundSnapshot } from "../core/soundCues";
import type { StageNumber } from "../core/route";
import { browserStorage } from "./progress";
import { loadSoundOn, saveSoundOn } from "./soundPrefs";

declare global {
  interface Window {
    /** E2E 用の読み取り口（音）：AudioContext の状態・鳴らした音・音ありか・全体の音量 */
    __noriSound?: {
      state: () => AudioContextState | "none";
      played: SoundCue[];
      on: () => boolean;
      masterGain: () => number;
    };
  }
}

/** 消音のボタン（#sound）を、覚えた設定に合わせてつなぐ。押すたびに onChange を呼ぶ */
const wireButton = (onChange: (on: boolean) => void): (() => boolean) => {
  let on = loadSoundOn(browserStorage());
  const button = document.getElementById("sound");
  const show = () => {
    button?.setAttribute("aria-pressed", String(on));
    button?.classList.toggle("muted", !on);
  };
  button?.addEventListener("click", () => {
    on = !on;
    saveSoundOn(browserStorage(), on);
    show();
    onChange(on);
    if (button instanceof HTMLElement) button.blur(); // スペースキーで押し続けないように
  });
  show();
  return () => on;
};

/** タイトル用：消音のボタンだけ（音は鳴らさない） */
export const startSoundButton = (): void => {
  const isOn = wireButton(() => undefined);
  window.__noriSound = { state: () => "none", played: [], on: isOn, masterGain: () => 0 };
};

/** ステージ用：ボタン・最初の操作で鳴らし始める・状態の変化で効果音・BGM */
export const startSound = (stage: StageNumber) => {
  const music = SOUND.music[`stage${stage}`];
  const played: SoundCue[] = [];
  let ctx: AudioContext | null = null;
  let master: GainNode | null = null;
  let musicBus: GainNode | null = null;
  let nextNoteTime = 0;
  let noteIndex = 0;
  let musicStopped = false;

  const isOn = wireButton((on) => {
    if (ctx === null || master === null) return;
    master.gain.setTargetAtTime(on ? 1 : 0, ctx.currentTime, SOUND.muteRampSeconds / 3);
  });

  /** 1つの音（立ち上がり attack 秒、長さ seconds 秒で 0 に戻る）を start 秒に鳴らす */
  const tone = (
    out: AudioNode,
    wave: OscillatorType,
    note: number,
    start: number,
    seconds: number,
    gain: number,
    attack: number,
  ) => {
    if (ctx === null) return;
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.type = wave;
    osc.frequency.value = noteFrequency(note);
    env.gain.setValueAtTime(0, start);
    env.gain.linearRampToValueAtTime(gain, start + attack);
    env.gain.linearRampToValueAtTime(0, start + seconds);
    osc.connect(env).connect(out);
    osc.start(start);
    osc.stop(start + seconds + 0.02);
  };

  const unlock = () => {
    if (ctx !== null) {
      void ctx.resume();
      return;
    }
    ctx = new AudioContext();
    master = ctx.createGain();
    master.gain.value = isOn() ? 1 : 0;
    master.connect(ctx.destination);
    musicBus = ctx.createGain();
    musicBus.gain.setValueAtTime(0, ctx.currentTime);
    musicBus.gain.linearRampToValueAtTime(SOUND.musicGain, ctx.currentTime + SOUND.musicFadeInSeconds);
    musicBus.connect(master);
    nextNoteTime = ctx.currentTime + SOUND.scheduleLeadSeconds;
    removeUnlock();
  };
  // 「操作」に当たる入力（HTML の仕様 user activation）：Esc 以外のキー・マウスの押し下げ・タッチの指を離す
  const onKey = (e: KeyboardEvent) => {
    if (e.key !== "Escape") unlock();
  };
  const onPointerUp = (e: PointerEvent) => {
    if (e.pointerType !== "mouse") unlock();
  };
  const removeUnlock = () => {
    window.removeEventListener("keydown", onKey, true);
    window.removeEventListener("mousedown", unlock, true);
    window.removeEventListener("pointerup", onPointerUp, true);
    window.removeEventListener("touchend", unlock, true);
  };
  window.addEventListener("keydown", onKey, true);
  window.addEventListener("mousedown", unlock, true);
  window.addEventListener("pointerup", onPointerUp, true);
  window.addEventListener("touchend", unlock, true);

  // 画面を隠したら止め、戻ったら続きから
  document.addEventListener("visibilitychange", () => {
    if (ctx === null) return;
    void (document.hidden ? ctx.suspend() : ctx.resume());
  });

  window.__noriSound = {
    state: () => ctx?.state ?? "none",
    played,
    on: isOn,
    masterGain: () => master?.gain.value ?? 0,
  };

  const noteSeconds = 30 / music.bpm; // 8 分音符 = 半拍
  const scheduleMusic = () => {
    if (ctx === null || musicBus === null || musicStopped || ctx.state !== "running") return;
    // 画面が止まって戻ったときに、過ぎた時刻の音をまとめて予約しない
    nextNoteTime = Math.max(nextNoteTime, ctx.currentTime + SOUND.scheduleLeadSeconds);
    // 少し先までの音を予約する（フレームが遅れても途切れない）
    while (nextNoteTime < ctx.currentTime + SOUND.scheduleAheadSeconds) {
      const note = music.notes[noteIndex % music.notes.length] ?? 0;
      if (note !== 0) {
        const length = noteSeconds * SOUND.musicNoteRatio;
        tone(musicBus, "triangle", note, nextNoteTime, length, 1, SOUND.musicAttackSeconds);
      }
      nextNoteTime += noteSeconds;
      noteIndex++;
    }
  };

  const tracker = createSoundCueTracker();
  return {
    /** 毎フレーム、今の状態を渡す */
    update(snapshot: SoundSnapshot) {
      const cues = tracker.next(snapshot);
      if (ctx !== null && master !== null) {
        for (const cue of cues) {
          played.push(cue);
          const e = SOUND.effects[cue];
          const gain = cue === "bump" ? SOUND.bumpGain : SOUND.effectGain;
          e.notes.forEach((note, i) => {
            if (ctx === null || master === null) return;
            const start = ctx.currentTime + i * e.noteSeconds;
            tone(master, e.wave, note, start, e.noteSeconds, gain, SOUND.attackSeconds);
          });
        }
        if (snapshot.finished && !musicStopped && musicBus !== null) {
          // ゴールしたら BGM を 2 秒で小さくして止める
          musicStopped = true;
          musicBus.gain.cancelScheduledValues(ctx.currentTime);
          musicBus.gain.setValueAtTime(musicBus.gain.value, ctx.currentTime);
          musicBus.gain.linearRampToValueAtTime(0, ctx.currentTime + SOUND.musicFadeOutSeconds);
        }
      }
      scheduleMusic();
    },
  };
};

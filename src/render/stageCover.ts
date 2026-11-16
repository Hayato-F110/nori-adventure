// ステージの始まりの覆いを、5 つのステージで同じようにつなぐ（NORI-76。docs/game-rules.md「ステージの始まりの待ちと、
// タイトルでの画質の判定」）。毎コマ update を呼び、false の間はゲームの刻みを進めない（描くことと FPS を数えることは続ける）。
// E2E が読む口（__nori.cover）に、外し始めたときの見た目・FPS の数・描画の番号を残す。
import type { LookState } from "./qualityControl";
import { type CoverState, createStartGate } from "./startGate";

export type QualitySource = "memory" | "measured" | "chosen";

export type CoverInfo = {
  state: CoverState;
  /** 外し始めたときの見た目 */
  look: LookState | null;
  /** 外し始めたときの FPS の数（1 秒ごとの数） */
  samples: number | null;
  /** 素材が読めた（または読めなかった）ときの FPS の数 */
  loadedSamples: number | null;
  /** 画質の出どころ：覚えた結果・ステージで測った・ボタンで選んだ */
  source: QualitySource;
  maxWaitSeconds: number;
  /** 外し始めた描画の番号と、最初に刻みが進んだ描画の番号 */
  fadeFrame: number | null;
  firstStepFrame: number | null;
};

export type StageCoverQuality = {
  readonly lookState: LookState;
  readonly source: QualitySource;
  readonly loadedSamples: number | null;
};

export const startStageCover = (quality: StageCoverQuality, onGone?: () => void) => {
  const element = document.getElementById("start-cover");
  const gate = createStartGate({
    reducedMotion: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    // E2E の口：運転役の holdCover が true の間は覆ったまま（入れていなければ何も変わらない）
    hold: () => globalThis.__noriDriver?.holdCover === true,
  });
  const info: CoverInfo = {
    state: "covered",
    look: null,
    samples: null,
    loadedSamples: null,
    source: quality.source,
    maxWaitSeconds: gate.maxWaitSeconds,
    fadeFrame: null,
    firstStepFrame: null,
  };
  if (element !== null) element.hidden = false;
  let goneNotified = false;
  return {
    info,
    /** 描画の番号（frames）と、今の FPS の数を渡す。ゲームの刻みを進めてよいなら true */
    update(frame: number, samples: number): boolean {
      const r = gate.update(quality.lookState);
      info.loadedSamples = quality.loadedSamples;
      if (r.startedNow) {
        info.look = quality.lookState;
        info.samples = samples;
        info.fadeFrame = frame;
        element?.classList.add("fading");
      }
      if (r.state === "gone" && !goneNotified) {
        goneNotified = true;
        if (element !== null) element.hidden = true;
        onGone?.();
      }
      info.state = r.state;
      return r.canStep;
    },
    /** 刻みを進めた描画の番号（最初の1回だけ残す） */
    stepped(frame: number, steps: number) {
      if (steps > 0 && info.firstStepFrame === null) info.firstStepFrame = frame;
    },
  };
};

export type StageCover = ReturnType<typeof startStageCover>;

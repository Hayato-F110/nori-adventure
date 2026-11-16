// ステージの始まりの覆い（NORI-76。docs/game-rules.md「ステージの始まりの待ちと、タイトルでの画質の判定」）。
// 素材を貼るか単色に決まるまで（look が loading の間）覆い、ゲームを進めない。上限はページを開いてから
// START.maxWaitSeconds 秒（performance.now の 0 から数える）。外し始めたら戻さない。描画だけの判断で、ゲームの状態には影響しない。
import { START } from "../config";
import type { LookState } from "./qualityControl";

export type CoverState = "covered" | "fading" | "gone";

export type StartGateOptions = {
  /** 今の時刻（ミリ秒。ページを開いた時が 0）。既定は performance.now */
  now?: () => number;
  maxWaitSeconds?: number;
  fadeSeconds?: number;
  /** 動きを減らす設定の端末では、外すとすぐ消す */
  reducedMotion?: boolean;
  /** E2E の口：true の間は覆ったまま（外し始める前だけ効く）。遅い CI で確かめの途中に外れないようにする */
  hold?: () => boolean;
};

export type StartGateResult = {
  state: CoverState;
  /** ゲームの刻みを進めてよい */
  canStep: boolean;
  /** この呼び出しで外し始めた */
  startedNow: boolean;
};

export const createStartGate = (options: StartGateOptions) => {
  const now = options.now ?? (() => performance.now());
  const maxWaitSeconds = options.maxWaitSeconds ?? START.maxWaitSeconds;
  const fadeMs = (options.fadeSeconds ?? START.fadeSeconds) * 1000;
  let state: CoverState = "covered";
  let fadeStart = 0;
  return {
    maxWaitSeconds,
    get state() {
      return state;
    },
    /** 毎コマ、今の見た目の状態を渡す */
    update(look: LookState): StartGateResult {
      const t = now();
      let startedNow = false;
      const held = state === "covered" && options.hold?.() === true;
      if (!held && state === "covered" && (look !== "loading" || t >= maxWaitSeconds * 1000)) {
        state = options.reducedMotion === true ? "gone" : "fading";
        fadeStart = t;
        startedNow = true;
      } else if (state === "fading" && t - fadeStart >= fadeMs) {
        state = "gone";
      }
      return { state, canStep: state !== "covered", startedNow };
    },
  };
};

export type StartGate = ReturnType<typeof createStartGate>;

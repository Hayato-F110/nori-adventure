// タイトルでの画質の判定（NORI-76。docs/game-rules.md「ステージの始まりの待ちと、タイトルでの画質の判定」）。
// 素材を貼った絵を描き始めた知らせ（start）のあとから、1 秒ごとの平均 FPS を数える。最初の settleSeconds 秒は数えず、
// 続く lowFpsSeconds 秒が全部 lowFps 未満なら "low"、1 回でも以上なら "high"。素材が読めなければ（skip）判定しない。
import type { Quality } from "./quality";

export type TitleJudgeConfig = {
  readonly settleSeconds: number;
  readonly lowFps: number;
  readonly lowFpsSeconds: number;
};

export type TitleJudgeState = "waiting" | "measuring" | "done" | "skipped";

export const createTitleJudge = (config: TitleJudgeConfig) => {
  let state: TitleJudgeState = "waiting";
  let result: Quality | null = null;
  let counted = 0;
  let slow = 0;
  return {
    get state() {
      return state;
    },
    get result() {
      return result;
    },
    /** 素材を貼った絵を描き始めた */
    start() {
      if (state === "waiting") state = "measuring";
    },
    /** 素材が読めなかった：判定しない */
    skip() {
      if (state === "waiting" || state === "measuring") state = "skipped";
    },
    /** 1 秒ごとの平均 FPS */
    sample(fps: number) {
      if (state !== "measuring") return;
      counted++;
      if (counted <= config.settleSeconds) return;
      if (fps < config.lowFps) slow++;
      if (counted >= config.settleSeconds + config.lowFpsSeconds) {
        result = slow >= config.lowFpsSeconds ? "low" : "high";
        state = "done";
      }
    },
  };
};

export type TitleJudge = ReturnType<typeof createTitleJudge>;

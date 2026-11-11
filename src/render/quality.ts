// 画質の自動切り替え（NORI-56。docs/game-rules.md「見た目」）。描画だけの判断で、ゲームの状態には影響しない。
// 1 秒ごとの平均 FPS を受け取り、lowFps 未満が lowFpsSeconds 回続いたら "low" にする。一度 "low" にしたら戻さない。

export type Quality = "high" | "low";

export type QualityConfig = {
  readonly lowFps: number;
  readonly lowFpsSeconds: number;
};

export const createQualityGovernor = (config: QualityConfig) => {
  let quality: Quality = "high";
  let slowSeconds = 0;
  return {
    get quality() {
      return quality;
    },
    /** 1 秒ごとの平均 FPS を渡す。今の画質を返す */
    push(fps: number): Quality {
      if (quality === "low") return quality;
      slowSeconds = fps < config.lowFps ? slowSeconds + 1 : 0;
      if (slowSeconds >= config.lowFpsSeconds) quality = "low";
      return quality;
    },
  };
};

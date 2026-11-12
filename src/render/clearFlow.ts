// クリアの演出（NORI-30。docs/game-rules.md「タイトル画面・ステージ選び・クリアの演出」）。
// ゴールしたら記録 → 紙ふぶき（動きを減らす設定では出さない）→ 3 秒後に「もう一回・つぎ・タイトル」のボタン。
// 状態は読むだけ（ゴールしたかどうかを毎フレーム受け取る）。
import { CLEAR } from "../config";
import { nextAfter, type StageNumber, stageUrl } from "../core/route";
import { browserStorage, saveCleared } from "./progress";

const COLORS = ["#ffd23f", "#ff6f59", "#1fa88e", "#6fc8ff", "#b48cff"] as const;

export type ConfettiPiece = {
  leftPercent: number;
  delaySeconds: number;
  fallSeconds: number;
  color: string;
  turns: number;
};

/** 紙ふぶきの並び（乱数を使わない）。画面の幅を等分した真ん中から、少しずつ遅れて落ちる */
export const confettiLayout = (count: number, seconds: number = CLEAR.confettiSeconds): ConfettiPiece[] => {
  const maxDelay = seconds / 3;
  return Array.from({ length: count }, (_, i) => {
    // 隣どうしが同時に落ちないよう、7 とびの順で遅らせる（7 と枚数が割り切れなくても範囲に収まる）
    const delaySeconds = (((i * 7) % count) / count) * maxDelay;
    return {
      leftPercent: ((i + 0.5) / count) * 100,
      delaySeconds,
      fallSeconds: seconds - delaySeconds,
      color: COLORS[i % COLORS.length] ?? COLORS[0],
      turns: 1 + (i % 3),
    };
  });
};

export type ClearFlowDeps = {
  stage: StageNumber;
  reducedMotion: () => boolean;
  record: (stage: StageNumber) => void;
  showConfetti: () => void;
  showButtons: () => void;
};

/** ゴールしたかどうかと今の秒（performance.now / 1000）を毎フレーム渡す */
export const createClearFlow = (deps: ClearFlowDeps) => {
  let finishedAt: number | null = null;
  const flow = {
    buttonsShown: false,
    update(finished: boolean, nowSeconds: number) {
      if (!finished) return;
      if (finishedAt === null) {
        finishedAt = nowSeconds;
        deps.record(deps.stage);
        if (!deps.reducedMotion()) deps.showConfetti();
      }
      if (!flow.buttonsShown && nowSeconds - finishedAt >= CLEAR.buttonsDelaySeconds) {
        flow.buttonsShown = true;
        deps.showButtons();
      }
    },
  };
  return flow;
};

/** 各ステージの起動で使う：index.html の #clear・#confetti につないだクリアの演出を作る */
export const startClearFlow = (stage: StageNumber) => {
  const panel = document.getElementById("clear");
  const confetti = document.getElementById("confetti");
  const link = (id: string, href: string) => {
    const a = document.getElementById(id);
    if (a instanceof HTMLAnchorElement) a.href = href;
  };
  link("clear-again", stageUrl(stage));
  link("clear-next", stageUrl(nextAfter(stage)));
  link("clear-home", stageUrl("title"));
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
  return createClearFlow({
    stage,
    reducedMotion: () => reduced.matches,
    record: (n) => saveCleared(browserStorage(), n),
    showConfetti: () => {
      if (confetti === null) return;
      for (const p of confettiLayout(CLEAR.confettiPieces)) {
        const piece = document.createElement("span");
        piece.className = "confetti-piece";
        piece.style.left = `${p.leftPercent}%`;
        piece.style.background = p.color;
        piece.style.animationDelay = `${p.delaySeconds}s`;
        piece.style.animationDuration = `${p.fallSeconds}s`;
        piece.style.setProperty("--turns", String(p.turns));
        confetti.append(piece);
      }
      confetti.hidden = false;
      window.setTimeout(() => {
        confetti.hidden = true;
        confetti.replaceChildren();
      }, CLEAR.confettiSeconds * 1000);
    },
    showButtons: () => {
      if (panel === null) return;
      panel.hidden = false;
      panel.querySelector<HTMLElement>("a")?.focus();
    },
  });
};

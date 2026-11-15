// タイトルの裏で、画質を前もって1回だけ判定する（NORI-76。docs/game-rules.md「ステージの始まりの待ちと、
// タイトルでの画質の判定」）。画質が「自動」で、結果をまだ覚えていないときだけ、ステージ1のページを判定の形
// （?stage=1&judge）で、タイトルの不透明な画面の裏の枠（iframe）に開く。済んだら結果を sessionStorage に書き、
// 描画の準備を捨ててから枠を外す。判定の途中でステージを選んだら、ページごと離れるので何も書かない。
import { loadJudged, loadQualityChoice, saveJudged } from "./quality";
import { sessionStorageOrNull } from "./qualityControl";

export type TitleJudgeInfo = {
  state: "measuring" | "done" | "skipped";
  /** 判定しなかった理由（skipped のとき） */
  reason: "chosen" | "remembered" | "no-storage" | "no-texture" | null;
  look: string | null;
  shadow: boolean | null;
  pixelRatio: number | null;
  /** 判定の枠で描いた数 */
  drawn: number;
};

/** 判定の枠のページが出す口（src/main.ts の __noriJudge と同じ形） */
type JudgeWindow = Window & {
  __noriJudge?: {
    readonly state: "waiting" | "measuring" | "done" | "skipped";
    readonly result: "high" | "low" | null;
    info: () => { look: string; shadow: boolean; pixelRatio: number; drawn: number };
    dispose: () => void;
  };
};

const POLL_MS = 250;

const localStorageOrNull = (): Storage | null => {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
};

/** 判定を始める（条件に合わなければ skipped で返す）。返した info を E2E が読む */
export const startTitleJudge = (base: string): TitleJudgeInfo => {
  const info: TitleJudgeInfo = {
    state: "measuring",
    reason: null,
    look: null,
    shadow: null,
    pixelRatio: null,
    drawn: 0,
  };
  const skip = (reason: TitleJudgeInfo["reason"]) => {
    info.state = "skipped";
    info.reason = reason;
    return info;
  };
  if (loadQualityChoice(localStorageOrNull()) !== "auto") return skip("chosen");
  const session = sessionStorageOrNull();
  if (session === null) return skip("no-storage");
  try {
    // 読み書きできるか（プライベートブラウズなどで例外になるときは、ステージごとに判定する）
    session.getItem("nori-adventure.judged");
  } catch {
    return skip("no-storage");
  }
  if (loadJudged(session) !== null) return skip("remembered");

  const frame = document.createElement("iframe");
  frame.id = "title-judge";
  frame.src = `${base}?stage=1&judge`;
  frame.setAttribute("aria-hidden", "true");
  frame.tabIndex = -1;
  frame.title = "";
  Object.assign(frame.style, {
    position: "fixed",
    inset: "0",
    width: "100%",
    height: "100%",
    border: "0",
    pointerEvents: "none",
  });
  // タイトル（不透明な画面）の前に入れて、タイトルの裏に描く
  const title = document.getElementById("title");
  document.body.insertBefore(frame, title);

  const finish = (judge: NonNullable<JudgeWindow["__noriJudge"]> | undefined) => {
    clearInterval(timer);
    try {
      judge?.dispose();
    } catch {
      // 片付けに失敗しても、枠は外す
    }
    frame.remove();
  };
  const timer = setInterval(() => {
    const judge = (frame.contentWindow as JudgeWindow | null)?.__noriJudge;
    if (judge === undefined) return;
    const now = judge.info();
    info.look = now.look;
    info.shadow = now.shadow;
    info.pixelRatio = now.pixelRatio;
    info.drawn = now.drawn;
    if (judge.state === "done" && judge.result !== null) {
      saveJudged(session, judge.result);
      info.state = "done";
      finish(judge);
    } else if (judge.state === "skipped") {
      skip("no-texture");
      finish(judge);
    }
  }, POLL_MS);
  return info;
};

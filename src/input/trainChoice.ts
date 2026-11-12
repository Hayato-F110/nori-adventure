// ステージ2の始めに、乗る列車を選ぶ（NORI-59。docs/game-rules.md「景色と列車を増やす」）。
// index.html の #train-choice（絵のボタン3つ）を出し、押されたら1回だけ知らせて隠す。
// 速さ・操作は3つとも同じ（見た目だけ）。ここではモデルの名前を返すだけ。
import { STAGE2 } from "../config";
import { focusFirstOnKey } from "./keyFocus";

export type TrainChoice = (typeof STAGE2.trainChoices)[number];

export const isTrainChoice = (name: string | undefined): name is TrainChoice =>
  (STAGE2.trainChoices as readonly string[]).includes(name ?? "");

export type TrainChooser = {
  /** 選んだ列車（まだなら null） */
  readonly chosen: TrainChoice | null;
};

export const createTrainChoice = (root: HTMLElement, onChoose: (name: TrainChoice) => void): TrainChooser => {
  let chosen: TrainChoice | null = null;
  const buttons = [...root.querySelectorAll<HTMLButtonElement>("button[data-train]")];
  for (const button of buttons) {
    button.addEventListener("click", () => {
      const name = button.dataset["train"];
      if (chosen !== null || !isTrainChoice(name)) return;
      chosen = name;
      root.hidden = true;
      onChoose(name);
    });
  }
  root.hidden = false;
  // キーボードでも選べるように、最初のキー入力で最初のボタンに合わせる（開いたときは枠を出さない。NORI-30）
  focusFirstOnKey(window, buttons);
  return {
    get chosen() {
      return chosen;
    },
  };
};

// 画面の上の表示：取ったほしの数・通ったチェックポイントの旗・かかった時間（秒）。ゴールで大きなほし（NORI-25）。
// 状態を読むだけ。文字は使わない（数字と絵だけ）。変わったときだけ DOM を書き換える。
import type { CourseState } from "../core/course";

export type StatusElements = {
  starCount: HTMLElement;
  flags: readonly Element[];
  time: HTMLElement;
  goal: HTMLElement;
};

/** 表示する秒（ゴールしたら、ゴールの刻みで止める） */
export const elapsedSeconds = (tick: number, course: CourseState, fixedDt: number): number =>
  Math.floor((course.finishTick ?? tick) * fixedDt);

export const createStatusView = (el: StatusElements, fixedDt: number) => {
  let last = "";
  return {
    update(tick: number, course: CourseState) {
      const stars = course.stars.filter(Boolean).length;
      const seconds = elapsedSeconds(tick, course, fixedDt);
      const key = `${stars}|${course.nextCheckpoint}|${seconds}|${course.finishTick !== null}`;
      if (key === last) return;
      last = key;
      el.starCount.textContent = String(stars);
      el.time.textContent = String(seconds);
      el.flags.forEach((flag, i) => flag.classList.toggle("passed", i < course.nextCheckpoint));
      el.goal.hidden = course.finishTick === null;
    },
  };
};

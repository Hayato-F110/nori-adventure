// ゲームパッド → InputFrame。W3C Gamepad の standard mapping（A=0、B=1、LT=6、RT=7、左スティック=axes[0]）。
// 出典：https://w3c.github.io/gamepad/#remapping
import { INPUT } from "../config";
import type { InputFrame } from "../core/types";
import { scaleWithDeadzone } from "./merge";

/** navigator.getGamepads() の1台分から、使う部分だけ（テストで作りやすい形） */
export type PadSnapshot = {
  connected: boolean;
  mapping: string;
  axes: readonly number[];
  buttons: readonly { value: number }[];
};

const BUTTON_A = 0;
const BUTTON_B = 1;
const TRIGGER_LEFT = 6;
const TRIGGER_RIGHT = 7;
const NONE: InputFrame = { throttle: 0, steer: 0 };

export const gamepadToFrame = (pad: PadSnapshot | null | undefined): InputFrame => {
  // 割り当てが分からないパッドは、ボタンの意味が分からないので使わない
  if (!pad?.connected || pad.mapping !== "standard") return NONE;
  const value = (i: number) => pad.buttons[i]?.value ?? 0;
  const forward = Math.max(value(BUTTON_A), value(TRIGGER_RIGHT));
  const backward = Math.max(value(BUTTON_B), value(TRIGGER_LEFT));
  return {
    throttle: forward - backward,
    steer: scaleWithDeadzone(pad.axes[0] ?? 0, INPUT.stickDeadzone, 1),
  };
};

/** つながっているゲームパッドをすべて読む（毎フレーム） */
export const createGamepadInput = (nav: Pick<Navigator, "getGamepads"> = navigator) => ({
  read(): InputFrame[] {
    try {
      return [...nav.getGamepads()].filter((p): p is Gamepad => p !== null).map((p) => gamepadToFrame(p));
    } catch {
      return []; // 使えない環境（権限・古いブラウザ）でも止まらない
    }
  },
});

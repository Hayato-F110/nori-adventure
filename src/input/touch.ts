// タッチ（タブレット）→ InputFrame。右下に ▶（すすむ）と ◀（さがる）、左下にハンドル（左右にスライド）。
// 指は何本でも同時に使える（Pointer Events の pointerId ごとに追う）。文字は使わない。
import { INPUT } from "../config";
import type { InputFrame } from "../core/types";
import { scaleWithDeadzone } from "./merge";

/** ハンドルの中心からの横のずれ（px）→ -1〜1 */
export const steerFromOffset = (dx: number): number =>
  scaleWithDeadzone(dx, INPUT.touchSteerDeadzone, INPUT.touchSteerRange);

/**
 * ボタンの並べ方（docs/game-rules.md「入力」の「上下のボタン」。NORI-62）。
 * drive：右下に ▶（すすむ）◀（さがる）。updown：右に ▲（うえ）▼（した）を縦に。中の値は同じ（▲ ＝ すすむ ＋1）
 */
export type TouchLayout = "drive" | "updown";

/** いつも前へ進む乗り物（ステージ3 飛行機・ステージ4 潜水艇）は、▶ ◀ を上下に使うので ▲▼ にする */
export const touchLayoutFor = (stage: number): TouchLayout =>
  stage === 3 || stage === 4 ? "updown" : "drive";

/** 上下のボタンの絵（三角。viewBox 0〜100）と読み上げ */
export const UP_DOWN_BUTTONS = {
  up: { path: "M18 68 L50 26 L82 68 Z", label: "うえ" },
  down: { path: "M18 32 L50 74 L82 32 Z", label: "した" },
} as const;

export type TouchControls = {
  forward: HTMLElement;
  backward: HTMLElement;
  wheel: HTMLElement;
  knob: HTMLElement;
  /** タッチの画面か、最初に触ったときに付ける（CSS でボタンを出す） */
  root: HTMLElement;
};

export const createTouchInput = (el: TouchControls, win: Window = window, layout: TouchLayout = "drive") => {
  if (layout === "updown") {
    // 見た目と読み上げだけを替える（並べ方は CSS の .touch-updown）
    el.root.classList.add("touch-updown");
    const set = (button: HTMLElement, b: { path: string; label: string }) => {
      button.setAttribute("aria-label", b.label);
      button.querySelector("path")?.setAttribute("d", b.path);
    };
    set(el.forward, UP_DOWN_BUTTONS.up);
    set(el.backward, UP_DOWN_BUTTONS.down);
  }
  const forwardIds = new Set<number>();
  const backwardIds = new Set<number>();
  let wheelId: number | null = null;
  let wheelCenterX = 0;
  let steer = 0;

  const showControls = () => el.root.classList.add("touch-on");
  if (win.matchMedia("(any-pointer: coarse)").matches) showControls();
  win.addEventListener("pointerdown", (e) => {
    if (e.pointerType === "touch") showControls();
  });

  const hold = (button: HTMLElement, ids: Set<number>) => {
    const release = (e: PointerEvent) => {
      ids.delete(e.pointerId);
      button.classList.toggle("pressed", ids.size > 0);
    };
    button.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      button.setPointerCapture(e.pointerId); // 指が少しずれても押したままにする
      ids.add(e.pointerId);
      button.classList.add("pressed");
    });
    for (const type of ["pointerup", "pointercancel", "lostpointercapture"] as const) {
      button.addEventListener(type, release);
    }
  };
  hold(el.forward, forwardIds);
  hold(el.backward, backwardIds);

  const moveKnob = () => {
    // 見た目だけ：つまみを、切った量だけ横に動かす（CSS の変数。style 属性は使わない）
    el.knob.style.setProperty("--steer", String(steer));
    el.wheel.classList.toggle("active", wheelId !== null);
    el.wheel.setAttribute("aria-valuenow", steer.toFixed(2));
  };
  el.wheel.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    if (wheelId !== null) return;
    el.wheel.setPointerCapture(e.pointerId);
    wheelId = e.pointerId;
    const rect = el.wheel.getBoundingClientRect();
    wheelCenterX = rect.left + rect.width / 2;
    steer = steerFromOffset(e.clientX - wheelCenterX);
    moveKnob();
  });
  el.wheel.addEventListener("pointermove", (e) => {
    if (e.pointerId !== wheelId) return;
    steer = steerFromOffset(e.clientX - wheelCenterX);
    moveKnob();
  });
  const releaseWheel = (e: PointerEvent) => {
    if (e.pointerId !== wheelId) return;
    wheelId = null;
    steer = 0; // 指を離すと、まっすぐに戻る
    moveKnob();
  };
  for (const type of ["pointerup", "pointercancel", "lostpointercapture"] as const) {
    el.wheel.addEventListener(type, releaseWheel);
  }

  // 別のアプリ・タブに切りかえると、指を離した知らせが届かないことがある。押したままの扱いにしない
  const releaseAll = () => {
    forwardIds.clear();
    backwardIds.clear();
    el.forward.classList.remove("pressed");
    el.backward.classList.remove("pressed");
    wheelId = null;
    steer = 0;
    moveKnob();
  };
  win.addEventListener("blur", releaseAll);
  win.document.addEventListener("visibilitychange", () => {
    if (win.document.visibilityState === "hidden") releaseAll();
  });
  // 長押しのメニューを出さない（子どもはボタンを押しっぱなしにする）
  el.root.addEventListener("contextmenu", (e) => e.preventDefault());

  return {
    read(): InputFrame {
      return { throttle: Number(forwardIds.size > 0) - Number(backwardIds.size > 0), steer };
    },
  };
};

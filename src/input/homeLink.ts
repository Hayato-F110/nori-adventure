// 遊んでいる途中でタイトルに戻る家のボタン（NORI-33 の K33-1。docs/game-rules.md「遊んでいる途中でタイトルに戻る」）。
// HOME.holdSeconds 押し続けて輪がいっぱいになったら、すぐタイトルへ戻る（同じタブなので、指を離すのを待たない）。
// うっかりのタップでは戻らない：ふつうのクリックは止め、途中で離す・外へずらす・取り消しで輪を 0 に戻す。
// 作りは保護者の入口（parentLink.ts）と同じ。
import { HOME } from "../config";

/** 押し続けた時間（ミリ秒）→ 輪の進み（0〜1）。1 になったら戻る */
export const homeHoldProgress = (elapsedMs: number): number =>
  Math.min(1, Math.max(0, elapsedMs / (HOME.holdSeconds * 1000)));

/** go：タイトルへ戻る（本番は location の書きかえ。テストでは差しかえる） */
export const createHomeLink = (link: HTMLAnchorElement, win: Window, go: () => void): void => {
  let pressedAt: number | null = null;
  let frame = 0;
  const show = (p: number) => link.style.setProperty("--hold", String(p));
  const reset = () => {
    pressedAt = null;
    win.cancelAnimationFrame(frame);
    show(0);
  };
  const tick = (now: number) => {
    if (pressedAt === null) return;
    const p = homeHoldProgress(now - pressedAt);
    show(p);
    if (p >= 1) {
      // 輪を 0 に戻してから戻る（ブラウザの「戻る」でこの画面に戻ったとき、輪がいっぱいのまま残らない）
      reset();
      go();
      return;
    }
    frame = win.requestAnimationFrame(tick);
  };

  link.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    // 指・ペン・マウスの左ボタンだけ（右ボタンは右クリックの画面を止めているので、押していることが見えない）
    if ((e as PointerEvent).button !== 0) return;
    link.setPointerCapture((e as PointerEvent).pointerId);
    pressedAt = win.performance.now();
    frame = win.requestAnimationFrame(tick);
  });
  for (const type of ["pointerup", "pointercancel", "lostpointercapture"] as const) {
    link.addEventListener(type, reset);
  }
  // 指を外へずらしたら取りやめる
  link.addEventListener("pointermove", (e) => {
    if (pressedAt === null) return;
    const { clientX: x, clientY: y } = e as PointerEvent;
    const r = link.getBoundingClientRect();
    if (x < r.left || x > r.right || y < r.top || y > r.bottom) reset();
  });
  // ふつうのクリック（タップ）では戻らない。キーボード（Enter・スペース）だけはすぐ戻る
  link.addEventListener("click", (e) => e.preventDefault());
  link.addEventListener("keydown", (e) => {
    const { key } = e as KeyboardEvent;
    if (key === "Enter" || key === " ") {
      e.preventDefault();
      go();
    }
  });
  link.addEventListener("contextmenu", (e) => e.preventDefault());
};

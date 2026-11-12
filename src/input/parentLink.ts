// 保護者の方への入口（NORI-54。docs/game-rules.md「保護者の方への入口」）。
// 左上の小さな「親子」の印を PARENT.holdSeconds 押し続けて、輪がいっぱいになってから指を離すと、
// プライバシーポリシーを新しいタブで開く。タップ（子どものうっかり）では何も起きない。
// 押している間は輪が増え（CSS の変数 --hold）、途中で離す・外へずらすと 0 に戻る。
import { PARENT } from "../config";

/** 押し続けた時間（ミリ秒）→ 輪の進み（0〜1）。1 になったら開く */
export const holdProgress = (elapsedMs: number): number =>
  Math.min(1, Math.max(0, elapsedMs / (PARENT.holdSeconds * 1000)));

export const createParentLink = (link: HTMLAnchorElement, win: Window = window) => {
  let pressedAt: number | null = null;
  let frame = 0;
  const show = (p: number) => link.style.setProperty("--hold", String(p));
  const open = () => win.open(link.href, "_blank", "noopener,noreferrer");
  const reset = () => {
    pressedAt = null;
    win.cancelAnimationFrame(frame);
    show(0);
  };
  // 輪を増やすだけ（開くのは指を離したとき）。新しいタブは「ユーザーの操作の直後」でないと開けないため、
  // 時間がたったところで開くと、ブラウザに止められることがある（HTML の仕様「user activation」。
  // タッチの pointerup はそれ自体が操作に当たる）
  const tick = (now: number) => {
    if (pressedAt === null) return;
    show(holdProgress(now - pressedAt));
    frame = win.requestAnimationFrame(tick);
  };

  link.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    link.setPointerCapture(e.pointerId);
    pressedAt = win.performance.now();
    frame = win.requestAnimationFrame(tick);
  });
  link.addEventListener("pointerup", () => {
    const ready = pressedAt !== null && holdProgress(win.performance.now() - pressedAt) >= 1;
    reset();
    if (ready) open();
  });
  for (const type of ["pointercancel", "lostpointercapture"] as const) {
    link.addEventListener(type, reset);
  }
  // 指を外へずらしたら取りやめる
  link.addEventListener("pointermove", (e) => {
    if (pressedAt === null) return;
    const r = link.getBoundingClientRect();
    if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) reset();
  });
  // ふつうのクリック（タップ）では開かない。キーボード（Enter・スペース）だけはすぐ開く（Tab で選んだ保護者向け）
  link.addEventListener("click", (e) => e.preventDefault());
  link.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      open();
    }
  });
  link.addEventListener("contextmenu", (e) => e.preventDefault());
};

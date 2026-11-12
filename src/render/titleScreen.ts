// タイトル画面（NORI-30。docs/game-rules.md「タイトル画面・ステージ選び・クリアの演出」）。
// 3D は描かず、index.html の #title（乗り物の絵のリンク）を出すだけ。クリアしたステージには星を付ける。
import { focusFirstOnKey } from "../input/keyFocus";
import { browserStorage, loadCleared } from "./progress";

/** ゲームの画面の部品を隠して、タイトルを出す。出した星の番号を返す（E2E の確かめ用） */
export const startTitle = (): number[] => {
  // 保護者の方への入口（#parent）は隠さない（タイトルからもポリシーへ行ける）
  for (const id of ["game", "hud", "status", "touch", "quality", "goal", "rotate", "train-choice"]) {
    document.getElementById(id)?.setAttribute("hidden", "");
  }
  const title = document.getElementById("title");
  if (title === null) throw new Error("index.html に #title が必要です");
  const cleared = loadCleared(browserStorage());
  for (const a of title.querySelectorAll<HTMLAnchorElement>("a[data-stage]")) {
    const done = cleared.includes(Number(a.dataset.stage));
    a.querySelector(".title-star")?.toggleAttribute("hidden", !done);
    a.classList.toggle("cleared", done);
    const name = a.getAttribute("aria-label")?.replace(/（くりあ）$/, "") ?? "";
    a.setAttribute("aria-label", done ? `${name}（くりあ）` : name);
  }
  title.hidden = false;
  // 開いたときは枠を出さない（車へ誘導しない）。キーボードの人は最初のキーで車のボタンへ
  focusFirstOnKey(window, [...title.querySelectorAll<HTMLElement>("a[data-stage]")]);
  return cleared;
};

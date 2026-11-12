// 絵のボタンの並び（タイトル・クリア・列車を選ぶ）を、キーボードでも押せるようにする（NORI-30）。
// 画面を開いたときに focus() すると、タッチで遊ぶ子にも黄色い枠が出て「これを押して」と誘導してしまう
// （kids-ui-reviewer の指摘）。そこで、最初のキー入力があったときだけ、最初のボタンに合わせる。

/** 何も選ばれていないときに押すと、最初のボタンに合わせるキー */
export const FOCUS_KEYS = ["Tab", "Enter", " ", "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"] as const;

/** 最初のキー入力で buttons[0] にフォーカスする。外すための関数を返す */
export const focusFirstOnKey = (target: Window, buttons: readonly HTMLElement[]): (() => void) => {
  const onKey = (e: KeyboardEvent) => {
    const first = buttons[0];
    if (first === undefined || !(FOCUS_KEYS as readonly string[]).includes(e.key)) return;
    const active = target.document.activeElement;
    if (active !== null && active !== target.document.body) return;
    e.preventDefault(); // Enter で、合わせた直後に押してしまわないように
    first.focus();
    target.removeEventListener("keydown", onKey);
  };
  target.addEventListener("keydown", onKey);
  return () => target.removeEventListener("keydown", onKey);
};

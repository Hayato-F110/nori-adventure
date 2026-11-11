// 画質（NORI-56・NORI-58。docs/game-rules.md「見た目」「画質を選ぶ」）。描画だけの判断で、ゲームの状態には影響しない。
// 「自動」のときだけ、1 秒ごとの平均 FPS が lowFps 未満で lowFpsSeconds 回続いたら "low" にする。自動では上げ直さない。
// ボタンで高・低を選んだら（select）その画質にして、それからは自動で変えない。「自動」にも戻せる。

export type Quality = "high" | "low";
/** "auto"＝選んでいない（最初は高。遅いときだけ自動で低へ） */
export type QualityChoice = "auto" | Quality;

export type QualityConfig = {
  readonly lowFps: number;
  readonly lowFpsSeconds: number;
};

export const createQualityGovernor = (config: QualityConfig, initial: QualityChoice = "auto") => {
  let choice: QualityChoice = initial;
  let quality: Quality = initial === "low" ? "low" : "high";
  let slowSeconds = 0;
  return {
    get quality() {
      return quality;
    },
    get choice() {
      return choice;
    },
    /** 1 秒ごとの平均 FPS を渡す。今の画質を返す */
    push(fps: number): Quality {
      if (choice !== "auto" || quality === "low") return quality;
      slowSeconds = fps < config.lowFps ? slowSeconds + 1 : 0;
      if (slowSeconds >= config.lowFpsSeconds) quality = "low";
      return quality;
    },
    /** ボタンで選んだ。高・低ならその画質にして自動では変えない。"auto" なら今の画質のまま数え直す */
    select(next: QualityChoice): Quality {
      choice = next;
      if (next !== "auto") quality = next;
      slowSeconds = 0;
      return quality;
    },
  };
};

export type QualityGovernor = ReturnType<typeof createQualityGovernor>;

/**
 * ボタンを押したときの次の選び方（今の状態だけで決まる）：自動 → 今と反対の画質、低 → 高、高 → 自動。
 * 押すたびに見た目（画質か、自動の印）が変わり、どこからでも 3 回以内で自動に戻る
 */
export const nextQualityChoice = (choice: QualityChoice, quality: Quality): QualityChoice => {
  if (choice === "auto") return quality === "high" ? "low" : "high";
  return choice === "low" ? "high" : "auto";
};

/** 選んだ画質を覚える場所（ブラウザの localStorage の名前。この端末の中だけ） */
export const QUALITY_STORAGE_KEY = "nori-adventure.quality";

type StorageLike = { getItem(key: string): string | null; setItem(key: string, value: string): void };

/** 覚えた画質を読む。何もない・知らない値・読めない（プライベートブラウズなど）ときは "auto" */
export const loadQualityChoice = (storage: StorageLike | null): QualityChoice => {
  try {
    const v = storage?.getItem(QUALITY_STORAGE_KEY);
    return v === "high" || v === "low" ? v : "auto";
  } catch {
    return "auto";
  }
};

/** 選んだ画質を覚える。覚えられなくても止まらない */
export const saveQualityChoice = (storage: StorageLike | null, choice: QualityChoice): void => {
  try {
    storage?.setItem(QUALITY_STORAGE_KEY, choice);
  } catch {
    // 覚えられないときは、次に開いたとき「自動」になるだけ
  }
};

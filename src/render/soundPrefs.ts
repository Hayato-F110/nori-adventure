// 消音にしたことを、この端末のブラウザの保存場所（localStorage）に覚える（NORI-31）。
// 外へは送らない（public/privacy.html「端末の中に残すもの」）。読めないときは「音あり」。

/** 覚える場所の名前（画質・クリアと同じ形） */
export const SOUND_STORAGE_KEY = "nori-adventure.sound";

type StorageLike = { getItem(key: string): string | null; setItem(key: string, value: string): void };

/** 音ありなら true。何もない・知らない値・読めないときは true（最初は音あり） */
export const loadSoundOn = (storage: StorageLike | null): boolean => {
  try {
    return storage?.getItem(SOUND_STORAGE_KEY) !== "off";
  } catch {
    return true;
  }
};

/** 覚える。覚えられなくても止まらない */
export const saveSoundOn = (storage: StorageLike | null, on: boolean): void => {
  try {
    storage?.setItem(SOUND_STORAGE_KEY, on ? "on" : "off");
  } catch {
    // 覚えられないときは、次に開いたとき音ありになるだけ
  }
};

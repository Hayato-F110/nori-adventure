// クリアしたステージを、この端末のブラウザの保存場所（localStorage）に覚える（NORI-30）。
// 外へは送らない（public/privacy.html「端末の中に残すもの」）。読めないときは「なし」にするだけ。
import { TITLE } from "../config";

/** 覚える場所の名前（画質の nori-adventure.quality と同じ形） */
export const CLEARED_STORAGE_KEY = "nori-adventure.cleared";

type StorageLike = { getItem(key: string): string | null; setItem(key: string, value: string): void };

/** クリアしたステージの番号（小さい順）。何もない・壊れた値・知らない番号は除く */
export const loadCleared = (storage: StorageLike | null): number[] => {
  try {
    const parsed: unknown = JSON.parse(storage?.getItem(CLEARED_STORAGE_KEY) ?? "[]");
    if (!Array.isArray(parsed)) return [];
    const known = new Set<number>(TITLE.stages);
    return [...new Set(parsed.filter((n): n is number => typeof n === "number" && known.has(n)))].sort(
      (a, b) => a - b,
    );
  } catch {
    return [];
  }
};

/** クリアしたステージを足す。覚えられなくても止まらない */
export const saveCleared = (storage: StorageLike | null, stage: number): void => {
  try {
    const next = [...new Set([...loadCleared(storage), stage])].sort((a, b) => a - b);
    storage?.setItem(CLEARED_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // 覚えられないときは、タイトルに星が付かないだけ
  }
};

/** ブラウザの localStorage。使えない（プライベートブラウズ・設定で止めている）ときは null */
export const browserStorage = (): Storage | null => {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
};

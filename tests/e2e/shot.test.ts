// NORI-73（一覧 4）：撮影の部品 shotOrNote（e2e/shot.ts）と、privacy.spec.ts の全画面の撮影がそれを使っていること
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { type ShotOptions, shotOrNote } from "../../e2e/shot";

type Annotation = { type: string; description?: string };

/** 決めた回数だけ例外を投げてから撮れる、偽のページ */
const fakePage = (failures: number) => {
  const calls: ShotOptions[] = [];
  let n = 0;
  return {
    calls,
    page: {
      screenshot: async (options: ShotOptions) => {
        calls.push(options);
        n++;
        if (n <= failures) throw new Error(`撮れない ${n} 回目`);
        return Buffer.from("画像");
      },
    },
  };
};

const fakeInfo = () => ({ annotations: [] as Annotation[] });
const OPTIONS: ShotOptions = { path: "x/privacy.png", fullPage: true };

describe("shotOrNote：撮れなくてもテストを落とさない（1 回撮り直し、だめなら記録）", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("(a) 1 回目で撮れたら、呼ぶのは 1 回、注記なし、画像を返す", async () => {
    const { page, calls } = fakePage(0);
    const info = fakeInfo();
    const image = await shotOrNote(page as never, info as never, OPTIONS);
    expect(calls).toHaveLength(1);
    expect(info.annotations).toEqual([]);
    expect(image?.toString()).toBe("画像");
  });

  it("(b) 1 回目だけ失敗したら、待たずに 2 回目を呼び、「撮り直した」を残して画像を返す", async () => {
    vi.useFakeTimers(); // 時間を進めない。撮り直しの前に待つと、ここで終わらない
    const { page, calls } = fakePage(1);
    const info = fakeInfo();
    const image = await shotOrNote(page as never, info as never, OPTIONS);
    expect(calls).toHaveLength(2);
    expect(calls[0]).toEqual(OPTIONS);
    expect(calls[1]).toEqual(OPTIONS);
    expect(info.annotations).toHaveLength(1);
    expect(info.annotations[0]?.type).toBe("撮り直した");
    expect(info.annotations[0]?.description).toContain("撮れない 1 回目");
    expect(image?.toString()).toBe("画像");
  });

  it("(c) 2 回とも失敗したら 2 回で止め、「撮れなかった」を残し、例外を投げずに null を返す", async () => {
    vi.useFakeTimers();
    const { page, calls } = fakePage(5);
    const info = fakeInfo();
    const image = await shotOrNote(page as never, info as never, OPTIONS);
    expect(calls).toHaveLength(2);
    expect(calls[0]).toEqual(OPTIONS);
    expect(calls[1]).toEqual(OPTIONS);
    expect(info.annotations).toHaveLength(1);
    expect(info.annotations[0]?.type).toBe("撮れなかった");
    expect(info.annotations[0]?.description).toContain("撮れない 2 回目");
    expect(image).toBeNull();
  });
});

describe("privacy.spec.ts の全画面の撮影は shotOrNote を使う", () => {
  const src = readFileSync(new URL("../../e2e/privacy.spec.ts", import.meta.url), "utf8");

  it("fullPage を含む page.screenshot( の呼び出しがない（タブレットの撮影 page.screenshot({ path }) は残ってよい）", () => {
    expect(src).not.toMatch(/page\.screenshot\(\{[^}]*fullPage/);
  });

  it("shotOrNote( を fullPage: true つきで呼んでいる", () => {
    // 引数の中に outputPath(...) の「)」があるので、文の終わり「;」までを見る
    expect(src).toMatch(/shotOrNote\([^;]*fullPage: true[^;]*\);/);
  });
});

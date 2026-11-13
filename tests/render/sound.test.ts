import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { SOUND } from "../../src/config/index.ts";
import { loadSoundOn, SOUND_STORAGE_KEY, saveSoundOn } from "../../src/render/soundPrefs.ts";

// docs/game-rules.md「効果音と BGM」（NORI-31）。テストの一覧の 5〜7
const memory = (initial?: string) => {
  const data = new Map<string, string>();
  if (initial !== undefined) data.set(SOUND_STORAGE_KEY, initial);
  return {
    data,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
  };
};

describe("消音を覚える", () => {
  it("名前は nori-adventure.sound。最初は音あり", () => {
    expect(SOUND_STORAGE_KEY).toBe("nori-adventure.sound");
    expect(loadSoundOn(memory())).toBe(true);
    expect(loadSoundOn(null)).toBe(true);
  });

  it("off を覚えたら消音。知らない値は音あり", () => {
    expect(loadSoundOn(memory("off"))).toBe(false);
    expect(loadSoundOn(memory("on"))).toBe(true);
    expect(loadSoundOn(memory("loud"))).toBe(true);
  });

  it("保存して読み直せる。保存場所が使えなくても止まらない", () => {
    const s = memory();
    saveSoundOn(s, false);
    expect(s.data.get(SOUND_STORAGE_KEY)).toBe("off");
    expect(loadSoundOn(s)).toBe(false);
    const broken = {
      getItem: () => {
        throw new Error("denied");
      },
      setItem: () => {
        throw new Error("denied");
      },
    };
    expect(loadSoundOn(broken)).toBe(true);
    expect(() => saveSoundOn(broken, false)).not.toThrow();
  });
});

const root = path.resolve(import.meta.dirname, "../..");
const read = (file: string) => readFileSync(path.join(root, file), "utf8");

describe("消音のボタン", () => {
  const html = read("index.html");
  const button = /<button[^>]*id="sound"[\s\S]*?<\/button>/.exec(html)?.[0] ?? "";

  it("文字を出さず、絵と読み上げの名前だけ。押した状態を aria-pressed で伝える", () => {
    expect(button).toMatch(/aria-label="[^"]+"/);
    expect(button).toMatch(/aria-pressed="(true|false)"/);
    expect(button).toMatch(/<svg[^>]*aria-hidden="true"/);
    const text = [...button.matchAll(/>([^<]*)</g)].map((m) => (m[1] ?? "").trim()).filter((s) => s !== "");
    expect(text).toEqual([]);
  });

  it("大きさは SOUND.buttonSize（64 px 以上）", () => {
    expect(SOUND.buttonSize).toBeGreaterThanOrEqual(64);
    expect(read("src/style.css")).toContain(`--sound-button: ${SOUND.buttonSize}px;`);
  });
});

describe("プライバシーポリシー", () => {
  it("日本語・英語の両方に、消音を残す名前が書いてある", () => {
    const [ja = "", en = ""] = read("public/privacy.html").split(/<h2>What is stored on your device<\/h2>/);
    expect(ja).toContain(SOUND_STORAGE_KEY);
    expect(en).toContain(SOUND_STORAGE_KEY);
  });
});

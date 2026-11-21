import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { STAGE4 } from "../../src/config";
import { diveHintGlow, foundPopScale, foundStarScale, progressBarPx } from "../../src/render/stage4Hud";

// docs/game-rules.md「ステージ4」の NORI-33 の行（上の表示・見つけた印・▼ のヒント）
// テストの一覧 docs/test-plans/NORI-33.md の 6・7・8・9（秒を受け取る純粋な関数。描画の 1 行は画面で見る）
const root = path.resolve(import.meta.dirname, "../..");
const html = readFileSync(path.join(root, "index.html"), "utf8");
const css = readFileSync(path.join(root, "src/style.css"), "utf8");

describe("6. 上の表示：たからばこの絵と近づき具合の棒", () => {
  it("index.html に #treasure-progress があり、ふだんは隠れている（ステージ4だけが出す）", () => {
    const el = /<div\s+id="treasure-progress"[^>]*>/.exec(html)?.[0] ?? "";
    expect(el).not.toBe("");
    expect(el).toMatch(/\shidden[\s>]/);
    expect(html).toMatch(/id="treasure-progress-fill"/);
    for (const f of ["src/main.ts", "src/stage2Main.ts", "src/stage3Main.ts", "src/stage5Main.ts"]) {
      expect(readFileSync(path.join(root, f), "utf8"), f).not.toMatch(/treasure-progress/);
    }
    expect(readFileSync(path.join(root, "src/stage4Main.ts"), "utf8")).toMatch(/treasure-progress/);
  });

  it("棒の幅：0 → 0 px、1 → STAGE4.progressBarWidth、0.5 → 半分、範囲の外は収める", () => {
    const w = STAGE4.progressBarWidth;
    expect(progressBarPx(0)).toBe(0);
    expect(progressBarPx(1)).toBe(w);
    expect(progressBarPx(0.5)).toBeCloseTo(w / 2, 9);
    expect(progressBarPx(-0.2)).toBe(0);
    expect(progressBarPx(1.3)).toBe(w);
  });

  it("棒の入れ物の幅の CSS の変数は STAGE4.progressBarWidth", () => {
    expect(Number(/--progress-bar:\s*(\d+)px/.exec(css)?.[1])).toBe(STAGE4.progressBarWidth);
  });
});

describe("7. 見つけた印が出るときの大きさ", () => {
  const g = STAGE4.foundStarGrowSeconds;
  it("0 秒で 0、半分で 0〜1 の間、foundStarGrowSeconds 以上で 1", () => {
    expect(foundStarScale(0, false)).toBe(0);
    const mid = foundStarScale(g / 2, false);
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(1);
    expect(foundStarScale(g, false)).toBe(1);
    expect(foundStarScale(g * 5, false)).toBe(1);
  });
  it("動きを減らす設定では 0 秒でも 1", () => {
    expect(foundStarScale(0, true)).toBe(1);
  });
});

describe("8. 見つけたときの上の表示の魚の絵", () => {
  const p = STAGE4.foundPopSeconds;
  it("0 秒で foundPopScale、foundPopSeconds 以上で 1、その間は減り続ける（点滅しない）", () => {
    expect(foundPopScale(0, false)).toBeCloseTo(STAGE4.foundPopScale, 9);
    expect(foundPopScale(p, false)).toBe(1);
    expect(foundPopScale(p * 3, false)).toBe(1);
    let last = Infinity;
    for (let k = 0; k <= 20; k++) {
      const v = foundPopScale((p * k) / 20, false);
      expect(v).toBeLessThanOrEqual(last);
      last = v;
    }
  });
  it("動きを減らす設定では 0 秒でも 1", () => {
    expect(foundPopScale(0, true)).toBe(1);
  });
});

describe("9. ▼ のヒントの光り方", () => {
  const T = STAGE4.diveHintPeriod;
  it("▼ を押している間は 0。動きを減らす設定では 1 のまま", () => {
    for (const s of [0, T / 4, T / 2]) {
      expect(diveHintGlow(s, true, false)).toBe(0);
      expect(diveHintGlow(s, false, true)).toBe(1);
    }
  });
  it("ふつうは 0 秒で 0、周期の半分で 1、周期で 0 に戻る", () => {
    expect(diveHintGlow(0, false, false)).toBeCloseTo(0, 9);
    expect(diveHintGlow(T / 2, false, false)).toBeCloseTo(1, 9);
    expect(diveHintGlow(T, false, false)).toBeCloseTo(0, 9);
  });
  it("0.05 秒ごとの変わり方が 0.2 より小さい（急に変わらない＝点滅しない）", () => {
    for (let s = 0; s < T * 2; s += 0.05) {
      const d = Math.abs(diveHintGlow(s + 0.05, false, false) - diveHintGlow(s, false, false));
      expect(d).toBeLessThan(0.2);
    }
  });
});

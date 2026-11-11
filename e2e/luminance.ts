// E2E で、スクリーンショットの明るさを測る（ステージ1・2の見た目のテストで共通）。
import type { Page } from "@playwright/test";

/** スクリーンショットの、画面の点のまわり（5×5 px）の平均の相対輝度（WCAG の式） */
export const luminanceAt = async (page: Page, points: { x: number; y: number }[]) => {
  const png = (await page.screenshot()).toString("base64");
  return page.evaluate(
    async ({ png, points }) => {
      const img = new Image();
      img.src = `data:image/png;base64,${png}`;
      await img.decode();
      const c = document.createElement("canvas");
      c.width = img.width;
      c.height = img.height;
      const ctx = c.getContext("2d");
      if (ctx === null) throw new Error("2d がない");
      ctx.drawImage(img, 0, 0);
      const lin = (v: number) => {
        const s = v / 255;
        return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      };
      return points.map((p) => {
        const d = ctx.getImageData(Math.round(p.x) - 2, Math.round(p.y) - 2, 5, 5).data;
        let sum = 0;
        for (let i = 0; i < d.length; i += 4) {
          sum += 0.2126 * lin(d[i] ?? 0) + 0.7152 * lin(d[i + 1] ?? 0) + 0.0722 * lin(d[i + 2] ?? 0);
        }
        return sum / (d.length / 4);
      });
    },
    { png, points },
  );
};
/** 明るさの比（WCAG のコントラスト比） */
export const ratio = (a: number, b: number) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);

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

/**
 * 画面の点のまわり（半径 radius px）で、3×3 px の平均の相対輝度がいちばん高いところの値（NORI-62）。
 * 小さく動く印（きらきら）を測る。位置を読んでから撮るまでに少しずれても外さない
 */
export const peakLuminanceAt = async (page: Page, point: { x: number; y: number }, radius: number) => {
  const png = (await page.screenshot()).toString("base64");
  return page.evaluate(
    async ({ png, point, radius }) => {
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
      const size = radius * 2 + 3;
      const x0 = Math.round(point.x) - radius - 1;
      const y0 = Math.round(point.y) - radius - 1;
      const d = ctx.getImageData(x0, y0, size, size).data;
      const lum = (x: number, y: number) => {
        const i = (y * size + x) * 4;
        return 0.2126 * lin(d[i] ?? 0) + 0.7152 * lin(d[i + 1] ?? 0) + 0.0722 * lin(d[i + 2] ?? 0);
      };
      let best = 0;
      for (let y = 1; y < size - 1; y++) {
        for (let x = 1; x < size - 1; x++) {
          let sum = 0;
          for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) sum += lum(x + dx, y + dy);
          best = Math.max(best, sum / 9);
        }
      }
      return best;
    },
    { png, point, radius },
  );
};

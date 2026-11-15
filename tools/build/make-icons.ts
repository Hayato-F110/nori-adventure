import { readFileSync } from "node:fs";
import path from "node:path";
import { chromium } from "@playwright/test";
import { PWA } from "../../src/config/index.ts";

// NORI-38：ホーム画面のアイコン（PNG 4 つ）を、タイトルの車の絵（index.html の自作の SVG）から作る。
// 今ある Playwright の Chromium で写すだけで、新しい部品は入れない。作り直すとき：node tools/build/make-icons.ts
// ルール：docs/game-rules.md「ホーム画面に追加・通信なしで遊ぶ（PWA）」の「アイコン」「アイコンの背景の色」。
// 絵は、どのアイコンでも maskable の安全な円（中心から半径 40%）の中に収める（端末が丸く切り抜いても欠けない）

const root = path.resolve(import.meta.dirname, "../..");

/** タイトルの車のボタンの中の、最初の SVG（車の絵）を取り出す */
const carSvg = (): string => {
  const html = readFileSync(path.join(root, "index.html"), "utf8");
  const button = html.slice(html.indexOf('data-stage="1"'));
  const match = /<svg viewBox="0 0 120 80"[\s\S]*?<\/svg>/.exec(button);
  if (match === null) throw new Error("index.html にタイトルの車の絵が見つかりません");
  return match[0].replace(' aria-hidden="true"', "");
};

// 車の絵の外枠（SVG の座標）：x 10〜110、y 16〜65。外枠の対角の半分 ≒ 55.7。
// 安全な円の半径（大きさの 40%）より、5% 内側に収める倍率：0.35 × 大きさ ÷ 55.7
const BOX = { x: 10, y: 16, width: 100, height: 49 };
const HALF_DIAGONAL = Math.hypot(BOX.width / 2, BOX.height / 2);

const ICONS = [
  ["icon-192.png", 192],
  ["icon-512.png", 512],
  ["icon-maskable-512.png", 512],
  ["apple-touch-icon.png", 180],
] as const;

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ deviceScaleFactor: 1 });
  for (const [file, size] of ICONS) {
    const scale = (0.35 * size) / HALF_DIAGONAL;
    const width = 120 * scale;
    const height = 80 * scale;
    // 絵の外枠の真ん中を、アイコンの真ん中に合わせる
    const left = size / 2 - (BOX.x + BOX.width / 2) * scale;
    const top = size / 2 - (BOX.y + BOX.height / 2) * scale;
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(
      `<!doctype html><html><body style="margin:0;background:${PWA.iconBackground};width:${size}px;height:${size}px;overflow:hidden">` +
        `<div style="position:absolute;left:${left}px;top:${top}px;width:${width}px;height:${height}px">` +
        carSvg().replace("<svg ", '<svg width="100%" height="100%" ') +
        "</div></body></html>",
    );
    await page.screenshot({ path: path.join(root, "public", file), omitBackground: false });
    console.info(`${file}：${size} px`);
  }
} finally {
  await browser.close();
}

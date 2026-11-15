import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { PWA } from "../../src/config";
import { decodePng, pngSize } from "../helpers/png";

// NORI-38 一覧 1・2・8・9（docs/test-plans/NORI-38.md）。ルール：docs/game-rules.md「ホーム画面に追加・通信なしで遊ぶ（PWA）」
const root = path.resolve(import.meta.dirname, "../..");
const read = (file: string): string => readFileSync(path.join(root, file), "utf8");
const MANIFEST_URL = "https://example.test/nori-adventure/manifest.webmanifest";

type Icon = { src: string; sizes: string; type: string; purpose?: string };
type Manifest = Record<string, unknown> & { icons: Icon[] };
const manifest = (): Manifest => JSON.parse(read("public/manifest.webmanifest")) as Manifest;

describe("NORI-38 一覧 1：マニフェスト", () => {
  it("名前・短い名前・display・orientation がルールの表と同じ", () => {
    const m = manifest();
    expect(m["name"]).toBe("のりものアドベンチャー");
    expect(m["short_name"]).toBe("のりもの");
    expect(m["display"]).toBe("fullscreen");
    expect(m["orientation"]).toBe("landscape");
  });

  it("start_url と scope は ./ で、マニフェストの URL から解決すると /nori-adventure/（末尾の / つき）", () => {
    const m = manifest();
    expect(m["start_url"]).toBe("./");
    expect(m["scope"]).toBe("./");
    expect(new URL(String(m["start_url"]), MANIFEST_URL).pathname).toBe("/nori-adventure/");
    expect(new URL(String(m["scope"]), MANIFEST_URL).pathname).toBe("/nori-adventure/");
  });

  it("アイコンは 192・512・512（maskable）の3つで、ファイルがある", () => {
    const icons = manifest().icons;
    expect(icons).toEqual([
      { src: "icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ]);
    for (const icon of icons) expect(existsSync(path.join(root, "public", icon.src)), icon.src).toBe(true);
  });
});

describe("NORI-38 一覧 2：アイコンの PNG と、index.html の参照", () => {
  it.each([
    ["icon-192.png", 192],
    ["icon-512.png", 512],
    ["icon-maskable-512.png", 512],
    ["apple-touch-icon.png", 180],
  ])("%s は %i px の正方形", (file, size) => {
    expect(pngSize(readFileSync(path.join(root, "public", file)))).toEqual({ width: size, height: size });
  });

  it("maskable は、中心から半径 40%（安全な円）の外の画素がすべて背景の色", () => {
    const png = decodePng(readFileSync(path.join(root, "public/icon-maskable-512.png")));
    const hex = PWA.iconBackground.replace("#", "");
    const want = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16));
    const center = png.width / 2;
    const safe = png.width * 0.4;
    const wrong: string[] = [];
    for (let y = 0; y < png.height; y += 1) {
      for (let x = 0; x < png.width; x += 1) {
        if (Math.hypot(x + 0.5 - center, y + 0.5 - center) <= safe) continue;
        const [r, g, b, a] = png.pixel(x, y);
        if (r !== want[0] || g !== want[1] || b !== want[2] || a !== 255)
          wrong.push(`(${x},${y})=${r},${g},${b},${a}`);
      }
    }
    expect(wrong.slice(0, 5), `違う画素 ${wrong.length} 個`).toEqual([]);
  });

  it("元の index.html に、マニフェストと iOS 用のアイコンがルートからの絶対パスで書いてある", () => {
    const html = read("index.html");
    expect(html).toMatch(/<link rel="manifest" href="\/manifest\.webmanifest"\s*\/?>/);
    expect(html).toMatch(/<link rel="apple-touch-icon" href="\/apple-touch-icon\.png"\s*\/?>/);
  });
});

describe("NORI-38 一覧 8：依存を増やさない", () => {
  it("package.json に workbox・vite-plugin-pwa・pngjs がない", () => {
    const pkg = JSON.parse(read("package.json")) as Record<string, Record<string, string> | undefined>;
    const names = [...Object.keys(pkg["dependencies"] ?? {}), ...Object.keys(pkg["devDependencies"] ?? {})];
    expect(names.filter((n) => /workbox|vite-plugin-pwa|pngjs/.test(n))).toEqual([]);
  });
});

describe("NORI-38 一覧 9：ほかの E2E は Service Worker を登録しない", () => {
  it('playwright.config.ts の use に serviceWorkers: "block" がある', () => {
    // 全体の use（"  use: {"）から projects の前までの中にあること（ステージごとの projects の use ではない）
    const config = read("playwright.config.ts");
    const use = config.indexOf("\n  use: {");
    const projects = config.indexOf("\n  projects:");
    const block = config.search(/serviceWorkers:\s*"block"/);
    expect(use, "全体の use がない").toBeGreaterThan(-1);
    expect(block).toBeGreaterThan(use);
    expect(block).toBeLessThan(projects);
  });

  it('serviceWorkers: "allow" を持つのは e2e/offline.spec.ts だけ', () => {
    const specs = readdirSync(path.join(root, "e2e")).filter((f) => f.endsWith(".spec.ts"));
    const allowing = specs.filter((f) => /serviceWorkers:\s*"allow"/.test(read(`e2e/${f}`)));
    expect(allowing).toEqual(["offline.spec.ts"]);
  });
});

import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

// NORI-38：ビルドのあとに、通信なしで持つファイルの一覧と版（中身のハッシュ）を書いた sw.js を作る。
// ルール：docs/game-rules.md「ホーム画面に追加・通信なしで遊ぶ（PWA）」の「通信なしで持つもの」「キャッシュの上限」「作り方」

/** フォルダの中のファイルを、フォルダからの相対のパス（/ 区切り）で全部返す */
const walk = (dir: string, prefix = ""): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const rel = prefix === "" ? entry.name : `${prefix}/${entry.name}`;
    return entry.isDirectory() ? walk(path.join(dir, entry.name), rel) : [rel];
  });

/** 持たないもの：開発用のソースマップと、sw.js 自身（中に自分のハッシュを書けず、ブラウザが別に持つ） */
const excluded = (rel: string): boolean => rel.endsWith(".map") || rel === "sw.js";

/**
 * 通信なしで持つファイルの一覧（base からの相対の URL）と合計の大きさ。合計が上限を超えたら止める
 */
export const precacheList = (dir: string, maxBytes: number): { urls: string[]; totalBytes: number } => {
  const urls = walk(dir)
    .filter((rel) => !excluded(rel))
    .sort();
  const totalBytes = urls.reduce((sum, rel) => sum + statSync(path.join(dir, rel)).size, 0);
  if (totalBytes > maxBytes) {
    throw new Error(
      `通信なしで持つファイルの合計 ${totalBytes} B が、上限 ${maxBytes} B（PWA.maxPrecacheBytes）を超えました`,
    );
  }
  return { urls, totalBytes };
};

/** 版：名前と中身のハッシュ（SHA-256 の頭 16 文字）。読む順によらない */
export const precacheVersion = (files: readonly { url: string; content: Buffer }[]): string => {
  const hash = createHash("sha256");
  for (const file of [...files].sort((a, b) => (a.url < b.url ? -1 : a.url > b.url ? 1 : 0))) {
    hash.update(file.url);
    hash.update("\0");
    hash.update(createHash("sha256").update(file.content).digest("hex"));
    hash.update("\n");
  }
  return hash.digest("hex").slice(0, 16);
};

/** sw.js の文：版と一覧を頭に書き、swCore.js の `export ` を外し、イベントを受ける行を足す */
export const buildServiceWorker = (urls: readonly string[], version: string, coreSource: string): string =>
  [
    "// NORI-38：ビルドのときに tools/build/pwa.ts が作る。手で直さない",
    `const VERSION = ${JSON.stringify(version)};`,
    `const PRECACHE = ${JSON.stringify(urls)};`,
    coreSource.replace(/^export /gm, ""),
    'self.addEventListener("install", (event) => {',
    "  const urls = PRECACHE.map((url) => new URL(url, self.registration.scope).href);",
    "  event.waitUntil(installAll(caches, VERSION, urls));",
    "});",
    'self.addEventListener("fetch", (event) => {',
    "  const key = planFetch(event.request, self.registration.scope);",
    "  if (key === null) return;",
    "  event.respondWith(respond(caches, VERSION, key, event.request, fetch));",
    "});",
    'self.addEventListener("activate", (event) => {',
    "  event.waitUntil(caches.keys().then((keys) => Promise.all(keysToDelete(keys, VERSION).map((key) => caches.delete(key)))));",
    "});",
    "",
  ].join("\n");

/** dist に sw.js を書く（vite.config.ts のプラグインから、ビルドの最後に呼ぶ） */
export const writeServiceWorker = (
  outDir: string,
  maxBytes: number,
  coreFile: string,
): { count: number; totalBytes: number } => {
  const { urls, totalBytes } = precacheList(outDir, maxBytes);
  const version = precacheVersion(
    urls.map((url) => ({ url, content: readFileSync(path.join(outDir, url)) })),
  );
  writeFileSync(
    path.join(outDir, "sw.js"),
    buildServiceWorker(urls, version, readFileSync(coreFile, "utf8")),
  );
  return { count: urls.length, totalBytes };
};

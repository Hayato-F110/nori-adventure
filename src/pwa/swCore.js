// NORI-38：Service Worker（通信なしでもページを出すための、ブラウザの裏で動く仕組み）の中身。
// ルール：docs/game-rules.md「ホーム画面に追加・通信なしで遊ぶ（PWA）」の「読み方」「新しい版にするとき」。
// ビルドのとき tools/build/pwa.ts が、この文の頭に版と一覧を足し、`export ` を外して dist/sw.js にする
// （Service Worker は import を使わない、ふつうのスクリプトとして読ませる）。テストはこのファイルを直接読む。
// 外の部品を使わず、ここに出てくる名前だけで動く（caches・fetch は呼ぶ側から渡す）。

/** キャッシュの名前の頭。消すのは、この頭で始まるものだけ（同じオリジンのほかのアプリに触れない） */
export const CACHE_PREFIX = "nori-adventure-";

/** 版からキャッシュの名前を作る */
export function cacheName(version) {
  return CACHE_PREFIX + version;
}

/**
 * install：一覧の全部をキャッシュに入れる。addAll は1つでも取れなければ何も入れずに失敗するので、
 * 途中までのキャッシュで新しい版に切り替わらない
 */
export async function installAll(cacheStorage, version, urls) {
  const cache = await cacheStorage.open(cacheName(version));
  await cache.addAll(urls);
}

/**
 * fetch：この要求に何を返すか。キャッシュを見るときの URL を返す。null なら触れない（ブラウザに任せる）。
 * - GET 以外・ほかのオリジンは触れない
 * - パスがちょうど scope（/nori-adventure/）のページを開く要求は、? のあとを無視して index.html
 * - privacy.html を開く要求は、? のあとを無視して privacy.html
 * - そのほかは、その URL のまま
 */
export function planFetch(request, scope) {
  if (request.method !== "GET") return null;
  const url = new URL(request.url);
  const base = new URL(scope);
  if (url.origin !== base.origin) return null;
  if (request.mode === "navigate") {
    if (url.pathname === base.pathname) return new URL("index.html", base).href;
    if (url.pathname === new URL("privacy.html", base).pathname) return new URL("privacy.html", base).href;
  }
  return request.url;
}

/** fetch：キャッシュにあれば返す。なければ通信する（キャッシュには足さない） */
export async function respond(cacheStorage, version, key, request, fetchFn) {
  const cache = await cacheStorage.open(cacheName(version));
  const hit = await cache.match(key);
  return hit === undefined ? fetchFn(request) : hit;
}

/**
 * activate：消すキャッシュの名前。自分の頭＋版の形（16 進の小文字 16 文字）にちょうど合い、今の版でないもの。
 * 同じ公開の場所（hayato-f110.github.io）に、名前が nori-adventure- で始まる別のアプリを置いても、そのキャッシュは消さない
 */
export function keysToDelete(keys, version) {
  const ours = new RegExp(`^${CACHE_PREFIX}[0-9a-f]{16}$`);
  return keys.filter((key) => ours.test(key) && key !== cacheName(version));
}

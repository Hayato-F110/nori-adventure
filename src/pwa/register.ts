// NORI-38：Service Worker を登録する。ルール：docs/game-rules.md「ホーム画面に追加・通信なしで遊ぶ（PWA）」
// - 本番（npm run build したもの）だけ。開発サーバーでは登録しない（古いキャッシュで混乱しない）
// - 画面には何も出さず、読み込み直さない。新しい版は、全部の画面を閉じて次に開いたときに切り替わる
// - 登録に失敗しても、ゲームはそのまま遊べる（通信なしで遊べないだけ）

type NavigatorLike = {
  serviceWorker?: { register: (url: string, options: { scope: string }) => Promise<unknown> };
};

export const registerServiceWorker = (
  production: boolean,
  base: string,
  nav: NavigatorLike | undefined = globalThis.navigator as NavigatorLike | undefined,
): void => {
  if (!production) return;
  const container = nav?.serviceWorker;
  if (container === undefined) return;
  container.register(`${base}sw.js`, { scope: base }).catch(() => undefined);
};

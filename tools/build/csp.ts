// NORI-16：本番のビルドの CSP を、開発用より厳しくする。
// 開発サーバー（Vite）は CSS を <style> で差し込むので 'unsafe-inline' が要るが、本番のビルドは CSS をファイルに出すので要らない。
// GitHub Pages はレスポンスのヘッダーを設定できないため、CSP は index.html の <meta> で渡す。
const STYLE_SRC_DEV = "style-src 'self' 'unsafe-inline';";
const STYLE_SRC_PROD = "style-src 'self';";

export const productionCsp = (html: string): string => {
  if (!html.includes(STYLE_SRC_DEV)) {
    // 黙って緩いまま公開しないよう、見つからなければビルドを止める
    throw new Error(`index.html の CSP に「${STYLE_SRC_DEV}」が見つからない`);
  }
  return html.replace(STYLE_SRC_DEV, STYLE_SRC_PROD);
};

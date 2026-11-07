# のりものアドベンチャー（仮）

4〜8歳の子どもと家族が、PC・タブレットのブラウザで遊べるオリジナルの3D乗り物アクションゲームです。街・山・空・海・月を、車・列車・飛行機・潜水艇・ローバーで旅します。

- 企画書：[docs/concept.md](docs/concept.md)
- ゲームのルール（数値）：[docs/game-rules.md](docs/game-rules.md)

## 動かし方

```sh
npm ci
npm run dev        # http://localhost:5173/nori-adventure/
npm run check      # 型チェック・lint・整形・単体テスト
npx playwright install chromium
npm run e2e        # ビルドして、車を12秒走らせ FPS を測る
```

操作：↑↓（または W S）で前後、←→（または A D）でハンドル。`?debug` を付けると FPS と速度を表示します。

## 技術

TypeScript（strict）/ Vite / Three.js / Rapier / Vitest / Playwright / GitHub Actions / GitHub Pages

## ライセンス

- コード：[MIT License](LICENSE)
- 素材（3D モデル・画像・映像・音）：[CC BY 4.0](LICENSE-ASSETS.md)。すべてオリジナルで、出所は [`public/models/manifest.json`](public/models/manifest.json)

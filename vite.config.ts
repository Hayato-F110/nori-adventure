import { defineConfig } from "vitest/config";
import { productionCsp } from "./tools/build/csp.ts";

// GitHub Pages はリポジトリ名のサブパスで公開される。開発・preview・本番で同じパスにそろえる
// （本番だけ変えると、vite preview でファイルが 404 になった：2026-11-05）
export default defineConfig(() => ({
  base: "/nori-adventure/",
  build: { target: "es2022", sourcemap: true },
  server: { port: 5173, strictPort: true },
  plugins: [
    // 本番のビルドだけ、CSP の style-src から 'unsafe-inline' を外す（NORI-16）
    { name: "nori-production-csp", apply: "build" as const, transformIndexHtml: productionCsp },
  ],
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    // NORI-68：単体テストのカバレッジ（命令・分岐・関数・行のうち、テストが通った割合）。npm run coverage で測る。
    // 測るのはゲームのルール（src/core）と数値（src/config）。テストで読み込まれなかったファイルも 0% として数える
    // （include を書かないと、読み込まれたファイルだけが出る：https://vitest.dev/config/coverage）。
    // 最初は数値を出すだけ。下限（thresholds）はオーナーと決めてから入れる
    coverage: {
      provider: "v8" as const,
      include: ["src/core/**/*.ts", "src/config/**/*.ts"],
      reporter: ["text", "json-summary", "html"],
    },
  },
}));

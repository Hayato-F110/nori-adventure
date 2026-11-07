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
  },
}));

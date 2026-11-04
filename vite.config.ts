import { defineConfig } from "vitest/config";

// GitHub Pages はリポジトリ名のサブパスで公開されるので、本番ビルドだけ base を変える
export default defineConfig(({ command }) => ({
  base: command === "build" ? "/nori-adventure/" : "/",
  build: { target: "es2022", sourcemap: true },
  server: { port: 5173, strictPort: true },
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
  },
}));

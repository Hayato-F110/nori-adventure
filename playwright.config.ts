import { defineConfig, devices } from "@playwright/test";

// 本番と同じビルド（vite preview）で確かめる。スクリーンショットは test-results/（Git に入れない）
// NORI_BASE_URL を渡すと、手元のサーバーを立てずに、その URL（公開版など）を確かめる。
//   例：NORI_BASE_URL=https://hayato-f110.github.io/nori-adventure/ npm run e2e
const LOCAL_URL = "http://localhost:4173/nori-adventure/";
const remoteUrl = process.env["NORI_BASE_URL"];

export default defineConfig({
  testDir: "e2e",
  timeout: 120_000,
  retries: 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: remoteUrl ?? LOCAL_URL,
    viewport: { width: 1280, height: 720 },
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1280, height: 720 },
        // 手元の PC では GPU を使う（ヘッドレスでも WebGL をハードウェアで描く）
        launchOptions: { args: ["--enable-gpu", "--ignore-gpu-blocklist", "--use-angle=default"] },
      },
    },
  ],
  ...(remoteUrl === undefined
    ? {
        webServer: {
          command: "npm run build && npm run preview",
          url: LOCAL_URL,
          reuseExistingServer: !process.env["CI"],
          timeout: 120_000,
        },
      }
    : {}),
});

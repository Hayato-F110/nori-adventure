import { defineConfig, devices } from "@playwright/test";

// 本番と同じビルド（vite preview）で確かめる。スクリーンショットは test-results/（Git に入れない）
// NORI_BASE_URL を渡すと、手元のサーバーを立てずに、その URL（公開版など）を確かめる。
//   例：NORI_BASE_URL=https://hayato-f110.github.io/nori-adventure/ npm run e2e
const LOCAL_URL = "http://localhost:4173/nori-adventure/";
const remoteUrl = process.env["NORI_BASE_URL"];
const chrome = {
  ...devices["Desktop Chrome"],
  viewport: { width: 1280, height: 720 },
  // 手元の PC では GPU を使う（ヘッドレスでも WebGL をハードウェアで描く）
  launchOptions: { args: ["--enable-gpu", "--ignore-gpu-blocklist", "--use-angle=default"] },
};

export default defineConfig({
  testDir: "e2e",
  timeout: 120_000,
  retries: 0,
  // JSON の記録：注記（記録の秒・「撮り直した」など）は HTML と JSON にだけ残る。CI は通った回も
  // ここから注記をログに出す（NORI-73 の刈り取りで数えるため）
  reporter: [["list"], ["html", { open: "never" }], ["json", { outputFile: "e2e-results/results.json" }]],
  use: {
    baseURL: remoteUrl ?? LOCAL_URL,
    viewport: { width: 1280, height: 720 },
    // NORI-38：Service Worker を登録させない（裏で約 7.3 MiB を読み、FPS などの E2E に響くため）。
    // 通信なしの E2E（e2e/offline.spec.ts）だけが test.use で "allow" にする
    serviceWorkers: "block",
  },
  projects: [
    {
      name: "chromium",
      use: chrome,
      grepInvert: /@fps/,
    },
    // FPS を測るテスト（@fps）は、ほかのテストが終わってから1本ずつ動かす。
    // CPU を遅くするテストなどが同時に走ると、測る値がそれに左右されるため（NORI-26）
    {
      name: "fps",
      use: chrome,
      grep: /@fps/,
      workers: 1,
      dependencies: ["chromium"],
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

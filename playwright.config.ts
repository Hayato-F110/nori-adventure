import { defineConfig, devices } from "@playwright/test";

// 本番と同じビルド（vite preview）で確かめる。スクリーンショットは test-results/（Git に入れない）
export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  retries: 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: "http://localhost:4173/nori-adventure/",
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
  webServer: {
    command: "npm run build && npm run preview",
    url: "http://localhost:4173/nori-adventure/",
    reuseExistingServer: !process.env["CI"],
    timeout: 120_000,
  },
});

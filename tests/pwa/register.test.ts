import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { registerServiceWorker } from "../../src/pwa/register";

// NORI-38 一覧 6（docs/test-plans/NORI-38.md）。ルール：「開発サーバー」「新しい版にするとき」
const root = path.resolve(import.meta.dirname, "../..");
const read = (file: string): string => readFileSync(path.join(root, file), "utf8");

const fakeNavigator = () => {
  const calls: unknown[][] = [];
  return {
    calls,
    nav: { serviceWorker: { register: async (...args: unknown[]) => void calls.push(args) } },
  };
};

describe("NORI-38 一覧 6：Service Worker の登録", () => {
  it("本番でなければ register を呼ばない", () => {
    const { calls, nav } = fakeNavigator();
    registerServiceWorker(false, "/nori-adventure/", nav);
    expect(calls).toEqual([]);
  });

  it("本番なら BASE_URL から作ったパスで1回だけ呼ぶ", () => {
    const { calls, nav } = fakeNavigator();
    registerServiceWorker(true, "/nori-adventure/", nav);
    expect(calls).toEqual([["/nori-adventure/sw.js", { scope: "/nori-adventure/" }]]);
  });

  it("Service Worker がないブラウザでは何もしない（エラーにしない）", () => {
    expect(() => registerServiceWorker(true, "/nori-adventure/", {})).not.toThrow();
    expect(() => registerServiceWorker(true, "/nori-adventure/", undefined)).not.toThrow();
  });

  it("登録に失敗しても、ゲームを止めない（Promise の失敗を外へ出さない）", async () => {
    const nav = { serviceWorker: { register: () => Promise.reject(new Error("失敗")) } };
    expect(() => registerServiceWorker(true, "/nori-adventure/", nav)).not.toThrow();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

  it("登録の関数は、読み込み直さず、新しい版の知らせを出さず、画面に何も足さない", () => {
    const source = read("src/pwa/register.ts");
    expect(source).not.toMatch(
      /location\.reload|controllerchange|updatefound|createElement|appendChild|innerHTML/,
    );
  });

  it("src/main.ts は、分かれ道（parseRoute）より前で、本番かどうかと BASE_URL を渡して呼ぶ", () => {
    const main = read("src/main.ts");
    const call = main.indexOf("registerServiceWorker(import.meta.env.PROD, import.meta.env.BASE_URL)");
    const route = main.search(/=\s*parseRoute\(/);
    expect(call, "呼び出しがない").toBeGreaterThan(-1);
    expect(route, "parseRoute の行がない").toBeGreaterThan(-1);
    expect(call).toBeLessThan(route);
  });
});

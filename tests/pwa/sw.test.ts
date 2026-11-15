import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { cacheName, installAll, keysToDelete, planFetch, respond } from "../../src/pwa/swCore.js";
import { buildServiceWorker } from "../../tools/build/pwa";

// NORI-38 一覧 5（docs/test-plans/NORI-38.md）。ルール：「読み方」「新しい版にするとき」
const root = path.resolve(import.meta.dirname, "../..");
const SCOPE = "https://example.test/nori-adventure/";
const VERSION = "0123456789abcdef";

/** ブラウザの Cache のまね。addAll は、1つでも失敗したら何も入れない（仕様と同じ） */
class FakeCache {
  readonly store = new Map<string, string>();
  constructor(private readonly failing: string | null) {}
  async addAll(urls: string[]): Promise<void> {
    if (this.failing !== null && urls.includes(this.failing)) throw new Error(`取れない：${this.failing}`);
    for (const url of urls) this.store.set(url, `中身:${url}`);
  }
  async match(url: string): Promise<string | undefined> {
    return this.store.get(url);
  }
}

class FakeCaches {
  readonly map = new Map<string, FakeCache>();
  constructor(private readonly failing: string | null = null) {}
  async open(name: string): Promise<FakeCache> {
    const found = this.map.get(name) ?? new FakeCache(this.failing);
    this.map.set(name, found);
    return found;
  }
  async keys(): Promise<string[]> {
    return [...this.map.keys()];
  }
  async delete(name: string): Promise<boolean> {
    return this.map.delete(name);
  }
}

const request = (url: string, method = "GET", mode = "no-cors") => ({ url, method, mode });

describe("NORI-38 一覧 5：install", () => {
  it("nori-adventure-＋版の名前のキャッシュに、一覧の全部を入れる", async () => {
    const caches = new FakeCaches();
    const urls = [`${SCOPE}index.html`, `${SCOPE}assets/a.js`];
    await installAll(caches, VERSION, urls);
    expect(cacheName(VERSION)).toBe(`nori-adventure-${VERSION}`);
    expect([...(caches.map.get(`nori-adventure-${VERSION}`)?.store.keys() ?? [])]).toEqual(urls);
  });

  it("1つでも取れなければ失敗にする（途中までのキャッシュで切り替わらない）", async () => {
    const caches = new FakeCaches(`${SCOPE}assets/a.js`);
    await expect(
      installAll(caches, VERSION, [`${SCOPE}index.html`, `${SCOPE}assets/a.js`]),
    ).rejects.toThrow();
    expect(caches.map.get(`nori-adventure-${VERSION}`)?.store.size ?? 0).toBe(0);
  });
});

describe("NORI-38 一覧 5：fetch で何を返すか", () => {
  it.each([
    [`${SCOPE}`, `${SCOPE}index.html`],
    [`${SCOPE}?stage=3`, `${SCOPE}index.html`],
    [`${SCOPE}privacy.html`, `${SCOPE}privacy.html`],
  ])("ページを開く要求 %s には %s を返す", (url, key) => {
    expect(planFetch(request(url, "GET", "navigate"), SCOPE)).toBe(key);
  });

  it("ほかの同じオリジンの GET は、その URL でキャッシュを見る", () => {
    expect(planFetch(request(`${SCOPE}assets/a.js`), SCOPE)).toBe(`${SCOPE}assets/a.js`);
  });

  it.each([
    ["POST", request(`${SCOPE}index.html`, "POST")],
    ["ほかのオリジン", request("https://other.test/nori-adventure/a.js")],
  ])("%s には触れない（null ＝ respondWith しない）", (_label, req) => {
    expect(planFetch(req, SCOPE)).toBeNull();
  });

  it("キャッシュにあれば、通信せずにキャッシュから返す", async () => {
    const caches = new FakeCaches();
    await installAll(caches, VERSION, [`${SCOPE}index.html`]);
    let fetched = 0;
    const res = await respond(caches, VERSION, `${SCOPE}index.html`, request(SCOPE), async () => {
      fetched += 1;
      return "通信";
    });
    expect(res).toBe(`中身:${SCOPE}index.html`);
    expect(fetched).toBe(0);
  });

  it("キャッシュになければ通信して返し、キャッシュには足さない", async () => {
    const caches = new FakeCaches();
    await installAll(caches, VERSION, []);
    const res = await respond(
      caches,
      VERSION,
      `${SCOPE}new.js`,
      request(`${SCOPE}new.js`),
      async () => "通信",
    );
    expect(res).toBe("通信");
    expect(caches.map.get(cacheName(VERSION))?.store.has(`${SCOPE}new.js`)).toBe(false);
  });
});

describe("NORI-38 一覧 5：activate で消すキャッシュ", () => {
  it("名前が nori-adventure- で始まり今の版でないものだけを消す。頭の違うものは残す", () => {
    const keys = [`nori-adventure-${VERSION}`, "nori-adventure-old", "other-app-1", "nori-adventurer-1"];
    expect(keysToDelete(keys, VERSION)).toEqual(["nori-adventure-old"]);
  });
});

describe("NORI-38 一覧 5：作った sw.js", () => {
  const core = readFileSync(path.join(root, "src/pwa/swCore.js"), "utf8");
  const sw = buildServiceWorker(["index.html", "assets/a.js"], VERSION, core);

  it("skipWaiting・clients.claim がない（全部の画面を閉じて次に開いたときに切り替わる）", () => {
    expect(sw).not.toMatch(/skipWaiting|clients\.claim/);
  });

  it("install・fetch・activate を受け取り、版と一覧が入っている", () => {
    const handlers = new Map<string, unknown>();
    const self = {
      registration: { scope: SCOPE },
      addEventListener: (type: string, fn: unknown) => handlers.set(type, fn),
    };
    new Function("self", "caches", "fetch", sw)(self, new FakeCaches(), async () => "通信");
    expect([...handlers.keys()].sort()).toEqual(["activate", "fetch", "install"]);
    expect(sw).toContain(VERSION);
    expect(sw).toContain('"assets/a.js"');
  });

  it("install を動かすと、一覧を scope からの URL にしてキャッシュに入れる", async () => {
    const handlers = new Map<string, (e: unknown) => void>();
    const caches = new FakeCaches();
    const self = {
      registration: { scope: SCOPE },
      addEventListener: (type: string, fn: (e: unknown) => void) => handlers.set(type, fn),
    };
    new Function("self", "caches", "fetch", sw)(self, caches, async () => "通信");
    let waited: Promise<unknown> = Promise.resolve();
    handlers.get("install")?.({ waitUntil: (p: Promise<unknown>) => (waited = p) });
    await waited;
    expect([...(caches.map.get(cacheName(VERSION))?.store.keys() ?? [])]).toEqual([
      `${SCOPE}index.html`,
      `${SCOPE}assets/a.js`,
    ]);
  });
});

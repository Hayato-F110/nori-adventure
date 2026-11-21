import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { HOME, PARENT } from "../../src/config/index.ts";
import { createHomeLink, homeHoldProgress } from "../../src/input/homeLink.ts";

// docs/game-rules.md「遊んでいる途中でタイトルに戻る（NORI-33 の K33-1）」
// テストの一覧 docs/test-plans/NORI-33.md の 1・2
const root = path.resolve(import.meta.dirname, "../..");
const html = readFileSync(path.join(root, "index.html"), "utf8");
const css = readFileSync(path.join(root, "src/style.css"), "utf8");
const homeHtml = /<a\s+id="home"[\s\S]*?<\/a>/.exec(html)?.[0] ?? "";
const clearHomeHtml = /<a\s+id="clear-home"[\s\S]*?<\/a>/.exec(html)?.[0] ?? "";
const textBetweenTags = (fragment: string) =>
  [...fragment.matchAll(/>([^<]*)</g)].map((m) => (m[1] ?? "").trim()).filter((s) => s !== "");
const pathsOf = (fragment: string) => [...fragment.matchAll(/\sd="([^"]+)"/g)].map((m) => m[1]);

/** 時間を手で進める窓（performance.now と requestAnimationFrame を差しかえる。実際の時間を待たない） */
const fakeWindow = () => {
  let now = 0;
  let callbacks = new Map<number, (t: number) => void>();
  let id = 0;
  return {
    performance: { now: () => now },
    requestAnimationFrame: (cb: (t: number) => void) => {
      id++;
      callbacks.set(id, cb);
      return id;
    },
    cancelAnimationFrame: (n: number) => {
      callbacks.delete(n);
    },
    /** ms だけ進め、そのあいだ描画のコマ（16 ms ごと）を回す */
    advance(ms: number) {
      const end = now + ms;
      while (now < end) {
        now = Math.min(end, now + 16);
        const run = callbacks;
        callbacks = new Map();
        for (const cb of run.values()) cb(now);
      }
    },
  };
};

/** ボタンの代わり（EventTarget に、輪の変数・四角・指のつかまえを足す） */
const fakeButton = () => {
  const el = new EventTarget() as EventTarget & {
    hold: string;
    style: { setProperty: (k: string, v: string) => void };
    getBoundingClientRect: () => { left: number; right: number; top: number; bottom: number };
    setPointerCapture: (id: number) => void;
  };
  el.hold = "0";
  el.style = {
    setProperty: (k, v) => {
      if (k === "--hold") el.hold = v;
    },
  };
  el.getBoundingClientRect = () => ({ left: 0, right: 72, top: 0, bottom: 72 });
  el.setPointerCapture = () => {};
  return el;
};

const pointer = (type: string, x = 36, y = 36) =>
  Object.assign(new Event(type, { cancelable: true }), { pointerId: 1, clientX: x, clientY: y });
const key = (k: string) => Object.assign(new Event("keydown", { cancelable: true }), { key: k });

const setup = () => {
  const win = fakeWindow();
  const el = fakeButton();
  let went = 0;
  createHomeLink(el as unknown as HTMLAnchorElement, win as unknown as Window, () => {
    went++;
  });
  return { win, el, went: () => went };
};

const holdMs = HOME.holdSeconds * 1000;

describe("1. 家のボタン：押し続けた時間 → 輪の進みと、戻るかどうか", () => {
  it("輪の進みは 0 秒で 0、HOME.holdSeconds でちょうど 1、それより長くても 1", () => {
    expect(homeHoldProgress(0)).toBe(0);
    expect(homeHoldProgress(holdMs / 2)).toBeCloseTo(0.5, 9);
    expect(homeHoldProgress(holdMs)).toBe(1);
    expect(homeHoldProgress(holdMs * 3)).toBe(1);
    expect(homeHoldProgress(-5)).toBe(0);
  });

  it("子どものタップ（0.3 秒）では 1 に届かない", () => {
    expect(homeHoldProgress(300)).toBeLessThan(1);
  });

  it("押して HOME.holdSeconds たつと、戻る関数が 1 回だけ呼ばれる（指を離すのを待たない）", () => {
    const { win, el, went } = setup();
    el.dispatchEvent(pointer("pointerdown"));
    win.advance(holdMs - 50);
    expect(went()).toBe(0);
    expect(Number(el.hold)).toBeGreaterThan(0);
    win.advance(100);
    expect(went()).toBe(1);
    win.advance(1000);
    el.dispatchEvent(pointer("pointerup"));
    expect(went()).toBe(1);
  });

  it("その前に指を離すと戻らず、輪は 0 に戻る", () => {
    const { win, el, went } = setup();
    el.dispatchEvent(pointer("pointerdown"));
    win.advance(300);
    el.dispatchEvent(pointer("pointerup"));
    expect(Number(el.hold)).toBe(0);
    win.advance(holdMs * 2);
    expect(went()).toBe(0);
  });

  it("外へずらすと戻らず、輪は 0 に戻る", () => {
    const { win, el, went } = setup();
    el.dispatchEvent(pointer("pointerdown"));
    win.advance(300);
    el.dispatchEvent(pointer("pointermove", 200, 200));
    expect(Number(el.hold)).toBe(0);
    win.advance(holdMs * 2);
    expect(went()).toBe(0);
  });

  it("取り消し（pointercancel）では戻らず、輪は 0 に戻る", () => {
    const { win, el, went } = setup();
    el.dispatchEvent(pointer("pointerdown"));
    win.advance(300);
    el.dispatchEvent(pointer("pointercancel"));
    expect(Number(el.hold)).toBe(0);
    win.advance(holdMs * 2);
    expect(went()).toBe(0);
  });

  it("Enter・スペースのキーでは、すぐ 1 回呼ばれる。ほかのキーでは呼ばれない", () => {
    for (const k of ["Enter", " "]) {
      const { el, went } = setup();
      el.dispatchEvent(key(k));
      expect(went()).toBe(1);
    }
    const { el, went } = setup();
    el.dispatchEvent(key("ArrowUp"));
    expect(went()).toBe(0);
  });

  it("ふつうのクリック（タップ）は止める（すぐタイトルへ移らない）", () => {
    const { el, went } = setup();
    const click = new Event("click", { cancelable: true });
    el.dispatchEvent(click);
    expect(click.defaultPrevented).toBe(true);
    expect(went()).toBe(0);
  });
});

describe("2. 家のボタンの見た目の決まり", () => {
  it("index.html に #home があり、中に文字がない（読み上げの名前だけ）。行き先は ./", () => {
    expect(homeHtml).not.toBe("");
    expect(textBetweenTags(homeHtml)).toEqual([]);
    expect(homeHtml).toMatch(/aria-label="[^"]+"/);
    expect(homeHtml).toMatch(/href="\.\/"/);
  });

  it("絵はクリアの家（#clear-home）と同じ形", () => {
    const clearPaths = pathsOf(clearHomeHtml);
    expect(clearPaths.length).toBeGreaterThan(0);
    for (const d of clearPaths) expect(pathsOf(homeHtml)).toContain(d);
  });

  it("大きさは HOME.buttonSize（64 px 以上）。上から 12 px、左から 24 px ＋ 保護者の入口の大きさ", () => {
    expect(Number(/--home-button:\s*(\d+)px/.exec(css)?.[1])).toBe(HOME.buttonSize);
    expect(HOME.buttonSize).toBeGreaterThanOrEqual(64);
    const rule = /\.home-link\s*\{[^}]*\}/.exec(css)?.[0] ?? "";
    expect(rule).toMatch(/top:\s*calc\(12px \+ env\(safe-area-inset-top/);
    expect(rule).toMatch(/left:\s*calc\(24px \+ var\(--parent-button\)/);
    expect(PARENT.buttonSize + 24).toBe(72);
  });

  it("重なりの順は覆い（.start-cover）より大きい（覆いの間も押せる）", () => {
    const z = (sel: string) =>
      Math.max(
        ...[...css.matchAll(new RegExp(`\\${sel}\\s*\\{[^}]*?z-index:\\s*(\\d+)`, "g"))].map((m) =>
          Number(m[1]),
        ),
      );
    expect(z(".home-link")).toBeGreaterThan(z(".start-cover"));
  });
});

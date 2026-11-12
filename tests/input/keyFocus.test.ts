import { describe, expect, it } from "vitest";
import { focusFirstOnKey } from "../../src/input/keyFocus.ts";

// NORI-30 の kids-ui-reviewer の指摘：開いたときは枠を出さず、最初のキー入力で最初のボタンに合わせる
const fakeWindow = () => {
  const body = { id: "body" };
  let active: unknown = body;
  const listeners = new Set<(e: KeyboardEvent) => void>();
  const focused: string[] = [];
  const button = (id: string) => ({
    focus: () => {
      active = id;
      focused.push(id);
    },
  });
  const win = {
    document: {
      body,
      get activeElement() {
        return active;
      },
    },
    addEventListener: (_: string, f: (e: KeyboardEvent) => void) => listeners.add(f),
    removeEventListener: (_: string, f: (e: KeyboardEvent) => void) => listeners.delete(f),
  };
  const press = (key: string) => {
    let prevented = false;
    const e = { key, preventDefault: () => (prevented = true) } as unknown as KeyboardEvent;
    for (const f of [...listeners]) f(e);
    return prevented;
  };
  return { win: win as unknown as Window, button, focused, press, listeners };
};

describe("最初のキー入力で最初のボタンに合わせる", () => {
  it("開いただけでは合わせない", () => {
    const t = fakeWindow();
    focusFirstOnKey(t.win, [t.button("a") as unknown as HTMLElement]);
    expect(t.focused).toEqual([]);
  });

  it("Tab・Enter・矢印で最初のボタンへ。Enter は押したことにしない。1回だけ", () => {
    const t = fakeWindow();
    focusFirstOnKey(t.win, [t.button("a"), t.button("b")] as unknown as HTMLElement[]);
    expect(t.press("Enter")).toBe(true);
    expect(t.focused).toEqual(["a"]);
    expect(t.listeners.size).toBe(0);
  });

  it("ほかのキーでは合わせない", () => {
    const t = fakeWindow();
    focusFirstOnKey(t.win, [t.button("a")] as unknown as HTMLElement[]);
    expect(t.press("a")).toBe(false);
    expect(t.focused).toEqual([]);
  });
});

// NORI-73（一覧 8）：キーボード → InputFrame（docs/game-rules.md「入力」のキーボードの行）。
// Vitest は node で動き、KeyboardEvent がないので、Event に code を付けて送る。
// cancelable を付けないと preventDefault が効かず、defaultPrevented を確かめられない（R6-73-8）
import { describe, expect, it } from "vitest";
import { createKeyboardInput } from "../../src/input/keyboard";

const key = (type: "keydown" | "keyup", code: string) =>
  Object.assign(new Event(type, { cancelable: true }), { code });

const setup = () => {
  const target = new EventTarget();
  const input = createKeyboardInput(target as unknown as Window);
  const send = (type: "keydown" | "keyup", code: string) => {
    const event = key(type, code);
    target.dispatchEvent(event);
    return event;
  };
  return { target, input, send };
};

describe("キーボードの入力：矢印キーと W・A・S・D が、すすむ・まがるに対応する", () => {
  it.each([
    ["ArrowUp", { throttle: 1, steer: 0 }],
    ["KeyW", { throttle: 1, steer: 0 }],
    ["ArrowDown", { throttle: -1, steer: 0 }],
    ["KeyS", { throttle: -1, steer: 0 }],
    ["ArrowLeft", { throttle: 0, steer: -1 }],
    ["KeyA", { throttle: 0, steer: -1 }],
    ["ArrowRight", { throttle: 0, steer: 1 }],
    ["KeyD", { throttle: 0, steer: 1 }],
  ])("%s を押すと %o、離すと 0 に戻る", (code, expected) => {
    const { input, send } = setup();
    send("keydown", code);
    expect(input.read()).toEqual(expected);
    send("keyup", code);
    expect(input.read()).toEqual({ throttle: 0, steer: 0 });
  });

  it("前と後ろを両方押すと すすむ 0、右と左を両方押すと まがる 0", () => {
    const { input, send } = setup();
    send("keydown", "ArrowUp");
    send("keydown", "KeyS");
    send("keydown", "KeyA");
    send("keydown", "ArrowRight");
    expect(input.read()).toEqual({ throttle: 0, steer: 0 });
  });

  it("同じキーの keydown が 2 回来ても、keyup 1 回で 0 に戻る（R6-73-11）", () => {
    const { input, send } = setup();
    send("keydown", "ArrowUp");
    send("keydown", "ArrowUp");
    send("keyup", "ArrowUp");
    expect(input.read()).toEqual({ throttle: 0, steer: 0 });
  });

  it("別の窓に移ったら（blur）全部離した扱い", () => {
    const { target, input, send } = setup();
    send("keydown", "ArrowUp");
    send("keydown", "KeyD");
    target.dispatchEvent(new Event("blur"));
    expect(input.read()).toEqual({ throttle: 0, steer: 0 });
  });

  it("扱うキーは既定の動き（スクロール）を止め、ほかのキー（Space）は無視して止めない", () => {
    const { input, send } = setup();
    expect(send("keydown", "ArrowDown").defaultPrevented).toBe(true);
    expect(send("keydown", "KeyW").defaultPrevented).toBe(true);
    const space = send("keydown", "Space");
    expect(space.defaultPrevented).toBe(false);
    expect(input.read()).toEqual({ throttle: 0, steer: 0 }); // ArrowDown と KeyW で 0。Space は数えない
  });

  it("dispose のあとは送っても変わらない", () => {
    const { input, send } = setup();
    input.dispose();
    send("keydown", "ArrowUp");
    expect(input.read()).toEqual({ throttle: 0, steer: 0 });
  });
});

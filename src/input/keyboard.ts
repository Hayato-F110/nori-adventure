// キーボード → InputFrame。タッチ・ゲームパッドは S06 で同じ形に変換して足す。
import type { InputFrame } from "../core/types";

const FORWARD = new Set(["ArrowUp", "KeyW"]);
const BACKWARD = new Set(["ArrowDown", "KeyS"]);
const LEFT = new Set(["ArrowLeft", "KeyA"]);
const RIGHT = new Set(["ArrowRight", "KeyD"]);
const HANDLED = new Set([...FORWARD, ...BACKWARD, ...LEFT, ...RIGHT]);

export const createKeyboardInput = (target: Window) => {
  const pressed = new Set<string>();
  const anyOf = (keys: Set<string>) => [...keys].some((key) => pressed.has(key));

  const onDown = (event: KeyboardEvent) => {
    if (!HANDLED.has(event.code)) return;
    pressed.add(event.code);
    event.preventDefault(); // 矢印キーで画面がスクロールしないように
  };
  const onUp = (event: KeyboardEvent) => pressed.delete(event.code);
  // 別のウィンドウに切り替えたら、押しっぱなしの扱いにしない
  const onBlur = () => pressed.clear();

  target.addEventListener("keydown", onDown);
  target.addEventListener("keyup", onUp);
  target.addEventListener("blur", onBlur);

  return {
    read(): InputFrame {
      return {
        throttle: Number(anyOf(FORWARD)) - Number(anyOf(BACKWARD)),
        steer: Number(anyOf(RIGHT)) - Number(anyOf(LEFT)),
      };
    },
    dispose() {
      target.removeEventListener("keydown", onDown);
      target.removeEventListener("keyup", onUp);
      target.removeEventListener("blur", onBlur);
    },
  };
};

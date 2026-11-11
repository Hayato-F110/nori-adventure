import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { LOOK } from "../../src/config";
import type { Look } from "../../src/render/look";
import type { QualityChoice } from "../../src/render/quality";
import { createQualityControl } from "../../src/render/qualityControl";

// docs/game-rules.md「見た目」「画質を選ぶ」（NORI-56・NORI-58）：画質と、素材・影・画素の倍率のつながり
const setup = (initial: QualityChoice = "auto") => {
  const renderer = {
    pixelRatio: 2,
    shadowMap: { enabled: true },
    setPixelRatio(r: number) {
      this.pixelRatio = r;
    },
  };
  const applied: (Look | null)[] = [];
  const sun = new THREE.DirectionalLight();
  sun.castShadow = true;
  const control = createQualityControl({
    renderer: renderer as unknown as THREE.WebGLRenderer,
    scene: new THREE.Scene(),
    sun,
    hemi: new THREE.HemisphereLight(),
    highPixelRatio: 2,
    applyLook: (look) => applied.push(look),
    resize: () => undefined,
    initial,
  });
  return { control, renderer, sun, applied };
};
const look = { environment: null } as unknown as Look;
/** 最初の判定（読み込み直後の数えない秒 ＋ 下げるまでの秒）を、速い FPS で済ませる */
const judgeFast = (control: ReturnType<typeof setup>["control"]) => {
  for (let s = 1; s <= LOOK.settleSeconds + LOOK.lowFpsSeconds; s++) control.sample(60, s);
};
const goSlow = (control: ReturnType<typeof setup>["control"]) => {
  for (let s = 1; s <= LOOK.settleSeconds + LOOK.lowFpsSeconds + 2; s++) control.sample(LOOK.lowFps - 1, s);
};

describe("画質の切り替え", () => {
  it("自動：素材は、読めて、かつ最初の判定が済んでから貼る", () => {
    const { control, applied } = setup();
    control.lookLoaded(look);
    expect(control.lookState).toBe("loading");
    judgeFast(control);
    expect(control.lookState).toBe("textured");
    expect(applied).toEqual([look]);
  });

  it("自動：遅いと低へ。単色・影なし・画素の倍率 1", () => {
    const { control, renderer, sun } = setup();
    control.lookLoaded(look);
    goSlow(control);
    expect(control.quality).toBe("low");
    expect(control.lookState).toBe("plain");
    expect(renderer.shadowMap.enabled).toBe(false);
    expect(sun.castShadow).toBe(false);
    expect(renderer.pixelRatio).toBe(LOOK.lowPixelRatio);
  });

  it("低から、ボタンで高を選ぶと、素材・影・画素の倍率が戻る", () => {
    const { control, renderer, sun, applied } = setup();
    control.lookLoaded(look);
    goSlow(control);
    control.select("high");
    expect(control.quality).toBe("high");
    expect(control.lookState).toBe("textured");
    expect(applied.at(-1)).toBe(look);
    expect(renderer.shadowMap.enabled).toBe(true);
    expect(sun.castShadow).toBe(true);
    expect(renderer.pixelRatio).toBe(2);
  });

  it("前に低を選んでいたら、最初から影なし・画素の倍率 1 で、素材は貼らない", () => {
    const { control, renderer, applied } = setup("low");
    expect(renderer.shadowMap.enabled).toBe(false);
    expect(renderer.pixelRatio).toBe(LOOK.lowPixelRatio);
    control.lookLoaded(look);
    expect(control.lookState).toBe("plain");
    expect(applied).toEqual([null]);
  });

  it("前に高を選んでいたら、判定を待たずに素材を貼り、遅くても下げない", () => {
    const { control } = setup("high");
    control.lookLoaded(look);
    expect(control.lookState).toBe("textured");
    goSlow(control);
    expect(control.quality).toBe("high");
  });

  it("素材を読む前に高を選んだら、読めたときに貼る", () => {
    const { control } = setup();
    control.select("low");
    control.select("high");
    expect(control.lookState).toBe("loading");
    control.lookLoaded(look);
    expect(control.lookState).toBe("textured");
  });

  it("素材が読めなかったら、高でも単色で続ける（止まらない）", () => {
    const { control } = setup("high");
    control.lookLoaded(null);
    expect(control.lookState).toBe("plain");
    expect(control.quality).toBe("high");
  });
});

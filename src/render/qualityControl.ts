// 画質の切り替え（NORI-56・NORI-58。docs/game-rules.md「見た目」「画質を選ぶ」）。すべてのステージで同じ。
// 最初は単色で始め、素材は「読めた」かつ「最初の画質の判定が済んだ」あとに貼る（遅い端末で 単色→素材→単色 と
// 2回変わるのを防ぐ）。「自動」のときだけ遅いと低へ下げる。ボタンで選んだら、その画質にする（低→高へも戻せる）。
import * as THREE from "three";
import { LOOK } from "../config";
import type { Look } from "./look";
import {
  createQualityGovernor,
  loadQualityChoice,
  type Quality,
  type QualityChoice,
  saveQualityChoice,
} from "./quality";

export type LookState = "loading" | "textured" | "plain";

export type QualityControlDeps = {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  sun: THREE.DirectionalLight;
  hemi: THREE.HemisphereLight;
  /** 高画質のときの画素の倍率 */
  highPixelRatio: number;
  /** 素材（look）を貼る。null なら単色に戻す */
  applyLook(look: Look | null): void;
  /** 画素の倍率を変えたあとに、画面の大きさを合わせ直す */
  resize(): void;
  /** 前に選んだ画質（覚えていなければ "auto"） */
  initial: QualityChoice;
};

export type QualityControl = {
  readonly quality: Quality;
  readonly choice: QualityChoice;
  readonly lookState: LookState;
  /** 素材が読めた（null は読めなかった） */
  lookLoaded(look: Look | null): void;
  /** 1 秒ごとの平均 FPS と、それまでに数えた秒数（読み込み直後の settleSeconds 秒を含む） */
  sample(fps: number, seconds: number): void;
  /** ボタンで選んだ */
  select(quality: Quality): void;
};

export const createQualityControl = (deps: QualityControlDeps): QualityControl => {
  const { renderer, scene, sun, hemi } = deps;
  const governor = createQualityGovernor(LOOK, deps.initial);
  let lookState: LookState = "loading";
  let loaded: Look | null | undefined;
  // 自分で選んだ画質なら、最初の判定を待たない
  let judged = deps.initial !== "auto";

  const usePlain = () => {
    deps.applyLook(null);
    scene.environment = null;
    hemi.intensity = LOOK.hemiPlain;
    lookState = "plain";
  };
  const tryApplyLook = () => {
    if (loaded === undefined || !judged || lookState !== "loading") return;
    if (loaded === null || governor.quality === "low") {
      usePlain();
      return;
    }
    deps.applyLook(loaded);
    scene.environment = loaded.environment;
    scene.environmentIntensity = LOOK.environmentIntensity;
    hemi.intensity = LOOK.hemiTextured; // まわりの光（HDRI）が入るので、空と地面の光は弱める
    lookState = "textured";
  };
  /** 画素の倍率と影。影の有無を変えたら、シェーダーを作り直す */
  const setRendering = (quality: Quality, resize = true) => {
    const high = quality === "high";
    renderer.setPixelRatio(high ? deps.highPixelRatio : LOOK.lowPixelRatio);
    if (renderer.shadowMap.enabled !== high) {
      renderer.shadowMap.enabled = high;
      sun.castShadow = high;
      scene.traverse((obj) => {
        if (obj instanceof THREE.Mesh) for (const m of [obj.material].flat()) m.needsUpdate = true;
      });
    }
    if (resize) deps.resize();
  };
  // 前に「低」を選んでいたら、最初から低で描く（画面の大きさは、このあと各ステージが合わせる）
  if (governor.quality === "low") setRendering("low", false);

  return {
    get quality() {
      return governor.quality;
    },
    get choice() {
      return governor.choice;
    },
    get lookState() {
      return lookState;
    },
    lookLoaded(look) {
      loaded = look;
      tryApplyLook();
    },
    sample(fps, seconds) {
      // 読み込み直後の settleSeconds 秒は数えない
      if (seconds <= LOOK.settleSeconds) return;
      if (governor.quality === "high" && governor.push(fps) === "low") {
        usePlain();
        setRendering("low");
      }
      if (!judged && seconds >= LOOK.settleSeconds + LOOK.lowFpsSeconds) {
        judged = true;
        tryApplyLook();
      }
    },
    select(quality) {
      const before = governor.quality;
      governor.select(quality);
      judged = true;
      if (quality === "low") {
        usePlain();
      } else if (before === "low" || lookState === "loading") {
        // 低 → 高：素材を貼り直す（まだ読めていなければ、読めたときに貼る）
        lookState = "loading";
        tryApplyLook();
      }
      setRendering(quality);
    },
  };
};

/** 画質のボタン（右上）。押すたびに 高 ⇄ 低。絵は今の画質（data-quality）で CSS が切り替える */
export const bindQualityButton = (
  button: HTMLElement,
  control: QualityControl,
  onSelect: (quality: Quality) => void,
): { update(): void } => {
  const update = () => {
    button.dataset["quality"] = control.quality;
    button.setAttribute("aria-label", control.quality === "high" ? "がしつ たかい" : "がしつ ひくい");
  };
  button.addEventListener("click", () => {
    const next: Quality = control.quality === "high" ? "low" : "high";
    control.select(next);
    onSelect(next);
    update();
    button.blur(); // スペースキーなどで押し続けないように
  });
  update();
  return { update };
};

/** ブラウザの localStorage。使えない（プライベートブラウズ・設定で止めている）ときは null */
const browserStorage = (): Storage | null => {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
};

/**
 * 各ステージの起動で使う：覚えた画質を読み、画質の切り替えを作り、右上のボタン（#quality）につなぐ。
 * 自動で低へ下げたときも、ボタンの絵を合わせる
 */
export const startQuality = (
  deps: Omit<QualityControlDeps, "initial" | "highPixelRatio">,
): QualityControl => {
  const storage = browserStorage();
  const control = createQualityControl({
    ...deps,
    highPixelRatio: Math.min(window.devicePixelRatio, LOOK.highPixelRatioMax),
    initial: loadQualityChoice(storage),
  });
  const element = document.getElementById("quality");
  const button =
    element === null ? null : bindQualityButton(element, control, (q) => saveQualityChoice(storage, q));
  return {
    get quality() {
      return control.quality;
    },
    get choice() {
      return control.choice;
    },
    get lookState() {
      return control.lookState;
    },
    lookLoaded: (look) => control.lookLoaded(look),
    sample(fps, seconds) {
      control.sample(fps, seconds);
      button?.update();
    },
    select(q) {
      control.select(q);
      button?.update();
    },
  };
};

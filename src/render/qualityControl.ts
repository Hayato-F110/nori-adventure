// 画質の切り替え（NORI-56・NORI-58。docs/game-rules.md「見た目」「画質を選ぶ」）。すべてのステージで同じ。
// 最初は単色で始め、素材は「読めた」かつ「最初の画質の判定が済んだ」あとに貼る（遅い端末で 単色→素材→単色 と
// 2回変わるのを防ぐ）。「自動」のときだけ遅いと低へ下げる。ボタンで選んだら、その画質にする（低→高へも戻せる）。
import * as THREE from "three";
import { LOOK } from "../config";
import type { Look } from "./look";
import {
  createQualityGovernor,
  loadJudged,
  loadQualityChoice,
  nextQualityChoice,
  type Quality,
  type QualityChoice,
  saveJudged,
  saveQualityChoice,
} from "./quality";
import type { QualitySource } from "./stageCover";

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
  /** 覚えた判定の結果（NORI-76。sessionStorage。なければ null）。「自動」のときだけ使い、判定を待たない */
  remembered?: Quality | null;
  /** 「自動」で判定が済んだとき・自動で低へ下げたときに、その画質を知らせる（覚えるため。NORI-76） */
  onJudged?: (quality: Quality) => void;
  /**
   * 高画質で、まわりの光（昼の空の HDRI）を使うか（既定は使う）。月面（ステージ5）は空の光がないので false：
   * 素材は貼るが、光は単色のときと同じ（空の光 LOOK.hemiPlain）にして、色の計算の前提を保つ（NORI-29）
   */
  useEnvironment?: boolean;
};

export type QualityControl = {
  readonly quality: Quality;
  readonly choice: QualityChoice;
  readonly lookState: LookState;
  /** 素材が読めた（null は読めなかった） */
  lookLoaded(look: Look | null): void;
  /** 1 秒ごとの平均 FPS と、それまでに数えた秒数（読み込み直後の settleSeconds 秒を含む） */
  sample(fps: number, seconds: number): void;
  /** ボタンで選んだ（"auto" は自動に戻す） */
  select(choice: QualityChoice): void;
};

export const createQualityControl = (deps: QualityControlDeps): QualityControl => {
  const { renderer, scene, sun, hemi } = deps;
  const remembered = deps.initial === "auto" ? (deps.remembered ?? null) : null;
  const governor = createQualityGovernor(LOOK, deps.initial, remembered ?? "high");
  let lookState: LookState = "loading";
  let loaded: Look | null | undefined;
  // 自分で選んだ画質か、判定の結果を覚えていれば、最初の判定を待たない（NORI-76）
  let judged = deps.initial !== "auto" || remembered !== null;

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
    if (deps.useEnvironment === false) {
      scene.environment = null;
      hemi.intensity = LOOK.hemiPlain;
    } else {
      scene.environment = loaded.environment;
      scene.environmentIntensity = LOOK.environmentIntensity;
      hemi.intensity = LOOK.hemiTextured; // まわりの光（HDRI）が入るので、空と地面の光は弱める
    }
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
  // 「低」で始めるとき（選んだ低・覚えた低）は、最初から低で描き、素材の読み込みを待たずに単色に決める
  // （画面の大きさは、このあと各ステージが合わせる。NORI-76「低で始めるとき」）
  if (governor.quality === "low") {
    setRendering("low", false);
    usePlain();
  }

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
        deps.onJudged?.("low");
      }
      if (!judged && seconds >= LOOK.settleSeconds + LOOK.lowFpsSeconds) {
        judged = true;
        tryApplyLook();
        if (governor.choice === "auto") deps.onJudged?.(governor.quality);
      }
    },
    select(choice) {
      const before = governor.quality;
      const quality = governor.select(choice);
      judged = true;
      // 自動に戻すときは、今の画質のまま（見た目は変えない）
      if (choice === "auto") return;
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

/**
 * 画質のボタン（右上）。押す順は nextQualityChoice（自動 → 今と反対、低 → 高、高 → 自動）。
 * 絵は今の画質（data-quality）と、自動かどうか（data-auto。回る矢印の印）で CSS が切り替える
 */
export const bindQualityButton = (
  button: HTMLElement,
  control: QualityControl,
  onSelect: (choice: QualityChoice) => void,
): { update(): void } => {
  const update = () => {
    button.dataset["quality"] = control.quality;
    button.dataset["auto"] = String(control.choice === "auto");
    const name = control.quality === "high" ? "たかい" : "ひくい";
    button.setAttribute(
      "aria-label",
      control.choice === "auto" ? `がしつ じどう（${name}）` : `がしつ ${name}`,
    );
  };
  button.addEventListener("click", () => {
    const next = nextQualityChoice(control.choice, control.quality);
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

/** ブラウザの sessionStorage（NORI-76。タブ・アプリを閉じると消える）。使えないときは null */
export const sessionStorageOrNull = (): Storage | null => {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
};

/**
 * タイトルの裏の判定の枠（NORI-76）では、画質を「高」に固定する（自動の見張りで測る途中に低へ落とさない。
 * docs/game-rules.md「タイトルの試しの絵」）。それ以外は保存した画質のまま
 */
export const qualityChoiceFor = (judgeMode: boolean, stored: QualityChoice): QualityChoice =>
  judgeMode ? "high" : stored;

/**
 * 各ステージの起動で使う：覚えた画質を読み、画質の切り替えを作り、右上のボタン（#quality）につなぐ。
 * 自動で低へ下げたときも、ボタンの絵を合わせる
 */
export const startQuality = (
  deps: Omit<QualityControlDeps, "initial" | "highPixelRatio" | "remembered" | "onJudged">,
  /** タイトルの裏で判定するとき（NORI-76）：判定を待たずに高画質の素材を貼り、結果は書かない（書くのはタイトル） */
  judgeMode = false,
): QualityControl & { readonly source: QualitySource; readonly loadedSamples: number | null } => {
  const storage = browserStorage();
  const session = sessionStorageOrNull();
  const initial = qualityChoiceFor(judgeMode, loadQualityChoice(storage));
  // 判定の結果を覚えていれば使い（判定を待たない）、判定したら覚える（NORI-76）。判定の枠は高に固定なので読まない
  const remembered = judgeMode ? null : loadJudged(session);
  const source: QualitySource = initial !== "auto" ? "chosen" : remembered !== null ? "memory" : "measured";
  let seconds = 0;
  let loadedSamples: number | null = null;
  const control = createQualityControl({
    ...deps,
    highPixelRatio: Math.min(window.devicePixelRatio, LOOK.highPixelRatioMax),
    initial,
    remembered,
    onJudged: (q) => {
      if (!judgeMode) saveJudged(session, q);
    },
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
    source,
    get loadedSamples() {
      return loadedSamples;
    },
    lookLoaded: (look) => {
      loadedSamples = seconds;
      control.lookLoaded(look);
    },
    sample(fps, s) {
      seconds = s;
      control.sample(fps, s);
      button?.update();
    },
    select(q) {
      control.select(q);
      button?.update();
    },
  };
};

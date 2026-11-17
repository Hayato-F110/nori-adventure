import { expect, type Page, test } from "@playwright/test";
import { holdStartCover, installConstantDriver, releaseStartCover } from "./driver";
import { luminanceAt } from "./luminance";

// NORI-76：ステージの始まりの覆いと、タイトルでの画質の判定。テストの一覧は docs/test-plans/NORI-76.md（E1・E2・E3・E5）。
// ルールは docs/game-rules.md「ステージの始まりの待ちと、タイトルでの画質の判定」。
// ゲームを進める確かめは、運転役と早送りで刻みを待つ（実際の秒で待たない）。E2 のタイトルの判定だけは実際の速さが要る。
const FAST = 4;
const JUDGED = "nori-adventure.judged";

type Probe = { tick: number; value: number };
declare global {
  // globalThis に足す口は var で宣言する（TypeScript の決まり）
  var __noriCoverProbe: ((stage: number) => Probe) | undefined;
}

const collectErrors = (page: Page) => {
  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  page.on("pageerror", (e) => errors.push(e.message));
  return errors;
};

/** 刻みと「入力が効いたか」を見る値を読む口（NORI-38 の E2E と同じ見方）。CSP が文字列の実行を止めるので先に入れる */
const installProbe = (page: Page) =>
  page.addInitScript(() => {
    globalThis.__noriCoverProbe = (stage) => {
      const n = window.__nori;
      if (stage === 1) return { tick: n?.state().tick ?? 0, value: n?.state().car.speed ?? 0 };
      if (stage === 2) return { tick: n?.train?.().tick ?? 0, value: n?.train?.().train.distance ?? 0 };
      if (stage === 3) return { tick: n?.plane?.().tick ?? 0, value: n?.plane?.().plane.y ?? 0 };
      if (stage === 4) return { tick: n?.sub?.().tick ?? 0, value: -(n?.sub?.().sub.y ?? 0) };
      return { tick: n?.rover?.().tick ?? 0, value: n?.rover?.().rover.speed ?? 0 };
    };
  });

const INPUTS = {
  1: { throttle: 1, steer: 0 },
  2: { throttle: 1, steer: 0 },
  3: { throttle: 1, steer: 0 },
  4: { throttle: -1, steer: 0 },
  5: { throttle: 1, steer: 0 },
};

/**
 * ブラウザの中で動く：ステージの覆い（cover）ができていて、外れ始めた（fading か gone）。
 * `window.__nori?.cover?.state !== "covered"` と書くと、ステージのコードが届く前（__nori がない間）にも成り立ち、
 * 覆いの途中の値（look が null）を読んでしまう（NORI-84 一覧 1）
 */
const coverStarted = () => {
  const s = window.__nori?.cover?.state;
  return s !== undefined && s !== "covered";
};

/** 部品の中心の点 */
const centerOf = async (page: Page, selector: string) => {
  const box = await page.locator(selector).boundingBox();
  if (box === null) throw new Error(`${selector} が見えない`);
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
};
const topAt = (page: Page, p: { x: number; y: number }) =>
  page.evaluate(({ x, y }) => {
    const e = document.elementFromPoint(x, y);
    return e?.closest("[id]")?.id ?? "";
  }, p);

test.describe("E1：ステージの覆い（タッチの端末）", () => {
  test.use({ viewport: { width: 1024, height: 768 }, hasTouch: true, isMobile: true });

  for (const stage of [1, 2, 3, 4, 5] as const) {
    test(`ステージ${stage}：素材が決まるまで覆い、ゲームを進めない。消えたら進む`, async ({
      page,
    }, testInfo) => {
      test.setTimeout(180_000);
      const errors = collectErrors(page);
      await installConstantDriver(page, INPUTS, { stepsPerFrame: FAST });
      // PR #81 の CI：遅い CI では、下の確かめの途中で覆いが外れた（画質が低に決まる・10 秒の上限）。止めて確かめ、最後に外す
      await holdStartCover(page);
      await installProbe(page);
      await page.goto(`./?stage=${stage}`);
      await page.waitForFunction(() => (window.__nori?.frames ?? 0) > 5, undefined, { timeout: 60_000 });
      const firstFrames = await page.evaluate(() => window.__nori?.frames ?? 0);

      // 覆いの間：1回の読み取りでそろえて見る（描くことと FPS を数えることは続き、刻みだけ止まる）
      const covered = await (
        await page.waitForFunction(
          ([s, f]) => {
            const n = window.__nori;
            if (n?.cover?.state !== "covered") return null;
            if ((n.frames ?? 0) < f + 3 || n.fpsSamples.length < 2) return null;
            return {
              look: n.look,
              frames: n.frames,
              samples: n.fpsSamples.length,
              tick: globalThis.__noriCoverProbe?.(s).tick ?? -1,
              time: document.getElementById("time")?.textContent ?? "",
            };
          },
          [stage, firstFrames] as const,
          { timeout: 60_000 },
        )
      ).jsonValue();
      expect(covered).not.toBeNull();
      expect(covered?.look).toBe("loading");
      expect(covered?.frames).toBeGreaterThan(firstFrames);
      expect(covered?.samples).toBeGreaterThanOrEqual(2);
      expect(covered?.tick).toBe(0);
      expect(covered?.time).toBe("0");

      // 止めている間は、素材が決まってから 3 コマ描いても覆ったまま・刻み 0（1回の読み取りで見る）
      const held = await (
        await page.waitForFunction(
          (s) => {
            const n = window.__nori;
            const g = globalThis as { __noriLookSeenAt?: number };
            if (n === undefined || n.look === "loading") return null;
            g.__noriLookSeenAt ??= n.frames;
            if (n.frames < g.__noriLookSeenAt + 3) return null;
            return { state: n.cover?.state, tick: globalThis.__noriCoverProbe?.(s).tick ?? -1 };
          },
          stage,
          { timeout: 60_000 },
        )
      ).jsonValue();
      expect(held).toEqual({ state: "covered", tick: 0 });

      // 覆いの見た目：画面全体・不透明・タイトルと同じグラデーション
      const style = await page.evaluate(() => {
        const c = document.getElementById("start-cover");
        const t = document.getElementById("title");
        if (c === null || t === null) return null;
        const r = c.getBoundingClientRect();
        return {
          w: r.width,
          h: r.height,
          opacity: getComputedStyle(c).opacity,
          bg: getComputedStyle(c).backgroundImage,
          titleBg: getComputedStyle(t).backgroundImage,
          maxWait: window.__nori?.cover?.maxWaitSeconds,
        };
      });
      expect(style).toMatchObject({ w: 1024, h: 768, opacity: "1", maxWait: 10 });
      expect(style?.bg).toContain("linear-gradient");
      expect(style?.bg).toBe(style?.titleBg);
      // 画面の上 1/4 の画素は、覆いの空色（#9fd8ff〜#dff3ff の明るさ 0.63〜0.88）
      const [lum] = await luminanceAt(page, [{ x: 100, y: 192 }]);
      expect(lum).toBeGreaterThan(0.6);
      expect(lum).toBeLessThan(0.9);

      // 押せるもの（覆いの上）と、覆いの下のもの
      for (const id of ["sound", "quality", "parent"]) {
        expect(await topAt(page, await centerOf(page, `#${id}`)), id).toBe(id);
      }
      // ステージ2（列車）はハンドルを使わないので出さない（docs/game-rules.md「ステージ2」）
      for (const id of stage === 2 ? ["go", "back", "status"] : ["wheel", "go", "back", "status"]) {
        expect(await topAt(page, await centerOf(page, `#${id}`)), id).toBe("start-cover");
      }
      if (stage === 2) await expect(page.locator("#train-choice")).toBeHidden();
      await testInfo.attach(`stage${stage}-covered.png`, {
        body: await page.screenshot(),
        contentType: "image/png",
      });

      // 覆いが消えたあと（止めていたのを外す）
      await releaseStartCover(page);
      await page.waitForFunction(() => window.__nori?.cover?.state === "gone", undefined, {
        timeout: 60_000,
      });
      await expect(page.locator("#start-cover")).toBeHidden();
      if (stage === 2) {
        await expect(page.locator("#train-choice")).toBeVisible();
        await page.locator('#train-choice button[data-train="train"]').click();
      }
      const before = await page.evaluate(
        (s) => globalThis.__noriCoverProbe?.(s) ?? { tick: 0, value: 0 },
        stage,
      );
      await page.waitForFunction(
        ([s, min]) => (globalThis.__noriCoverProbe?.(s).tick ?? 0) > min,
        [stage, before.tick + 120] as const,
        { timeout: 120_000 },
      );
      const after = await page.evaluate(
        (s) => globalThis.__noriCoverProbe?.(s) ?? { tick: 0, value: 0 },
        stage,
      );
      if (stage === 1 || stage === 5) expect(after.value).toBeGreaterThan(0);
      else expect(after.value).toBeGreaterThan(before.value);
      // 消え始めた描画から刻みが進む（ステージ2は選んだ描画から）
      const info = await page.evaluate(() => window.__nori?.cover);
      expect(info?.firstStepFrame).not.toBeNull();
      if (stage !== 2) expect(info?.firstStepFrame).toBe(info?.fadeFrame);
      await testInfo.attach(`stage${stage}-started.png`, {
        body: await page.screenshot(),
        contentType: "image/png",
      });
      expect(errors).toEqual([]);
    });
  }
});

test.describe("E2：タイトルで判定し、次のステージで待たない", () => {
  test.use({ deviceScaleFactor: 3 });

  test("タイトルの裏でステージ1を高画質で描いて判定し、結果を覚え、次のステージは判定を待たない", async ({
    page,
  }, testInfo) => {
    test.setTimeout(180_000);
    const errors = collectErrors(page);
    await page.goto("./");
    // 判定の枠が測っている間：ステージ1と同じ絵を、高画質の設定で描いている。
    // NORI-84 一覧 2：「測っている」の確認・枠の中身・画面の中央を、タイトルのページの 1 回の呼び出しでまとめて読む。
    // 呼び出しの途中には、枠を外すタイトルの見回り（0.25 秒ごと）が割り込めない。別の呼び出しに分けると、
    // 間に判定が済んで枠が外れ、Frame was detached で落ちた（PR #90 の CI）
    type JudgeWindow = Window & {
      __noriJudge?: { info: () => { look: string; shadow: boolean; pixelRatio: number } };
    };
    let inFrame:
      | {
          info: { look: string; shadow: boolean; pixelRatio: number };
          view: { drawables: number; position: number[]; direction: number[] };
          center: boolean;
        }
      | null
      | undefined;
    try {
      inFrame = await (
        await page.waitForFunction(
          () => {
            const j = window.__noriTitle?.judge;
            if (j?.state !== "measuring" || j.look !== "textured") return null;
            const f = document.getElementById("title-judge") as HTMLIFrameElement | null;
            const w = f?.contentWindow as (JudgeWindow & typeof window) | null | undefined;
            const info = w?.__noriJudge?.info();
            const view = w?.__nori?.view?.();
            const canvas = f?.contentDocument?.querySelector("canvas") ?? null;
            if (info === undefined || view === undefined || canvas === null) return null;
            // 試しの canvas の参照をとっておく（片付けたあとに isContextLost を見る）
            (globalThis as { __keptCanvas?: HTMLCanvasElement | null }).__keptCanvas = canvas;
            const e = document.elementFromPoint(window.innerWidth / 2, window.innerHeight / 2);
            // 枠の中で作った値は、写してから返す
            return {
              info: { look: info.look, shadow: info.shadow, pixelRatio: info.pixelRatio },
              view: {
                drawables: view.drawables,
                position: [...view.position],
                direction: [...view.direction],
              },
              center: (e?.closest("#title") ?? null) !== null,
            };
          },
          undefined,
          { timeout: 60_000 },
        )
      ).jsonValue();
    } catch (e) {
      // PR #81 の CI で、ここが 60 秒で落ちた（記録が足りず原因が分からなかった）。判定の状態と、枠の中の様子を残す
      const frame = page.frames().find((f) => f.url().includes("judge"));
      await testInfo.attach("judge-wait-state.json", {
        body: JSON.stringify({
          judge: await page.evaluate(() => window.__noriTitle?.judge),
          frameUrl: frame?.url() ?? null,
          inFrame:
            (await frame
              ?.evaluate(() => ({
                look: window.__nori?.look,
                frames: window.__nori?.frames,
                fpsSamples: window.__nori?.fpsSamples,
                judge: window.__noriJudge?.info(),
                visibility: document.visibilityState,
              }))
              .catch((err: unknown) => String(err))) ?? null,
        }),
        contentType: "application/json",
      });
      throw e;
    }
    expect(inFrame?.info).toMatchObject({ look: "textured", shadow: true, pixelRatio: 2 });
    expect(inFrame?.center, "測っている間、画面の中央はタイトルの部品").toBe(true);

    // 実際の速さが要る：判定が済むまで待つ（上限 60 秒。計算の節「タイトルで判定が済むまで」から）
    try {
      await page.waitForFunction(() => sessionStorage.getItem("nori-adventure.judged") !== null, undefined, {
        timeout: 60_000,
      });
    } catch (e) {
      await testInfo.attach("judge-state.json", {
        body: JSON.stringify(await page.evaluate(() => window.__noriTitle?.judge)),
        contentType: "application/json",
      });
      throw e;
    }
    const judged = await page.evaluate((k) => sessionStorage.getItem(k), JUDGED);
    expect(["high", "low"]).toContain(judged);
    await page.waitForFunction(() => window.__noriTitle?.judge?.state === "done", undefined, {
      timeout: 10_000,
    });
    const after = await page.evaluate(() => ({
      frame: document.getElementById("title-judge") !== null,
      lost: (globalThis as { __keptCanvas?: HTMLCanvasElement | null }).__keptCanvas
        ?.getContext("webgl2")
        ?.isContextLost(),
      drawn: window.__noriTitle?.judge?.drawn ?? -1,
    }));
    expect(after.frame).toBe(false);
    expect(after.lost).toBe(true);
    // rAF 10 回の間に、描いた数が増えない
    await page.evaluate(
      () =>
        new Promise<void>((r) => {
          let n = 0;
          const tick = () => (++n >= 10 ? r() : requestAnimationFrame(tick));
          requestAnimationFrame(tick);
        }),
    );
    expect(await page.evaluate(() => window.__noriTitle?.judge?.drawn)).toBe(after.drawn);

    // 同じタブで ?stage=1：覚えた結果で、判定を待たない
    await page.goto("./?stage=1");
    // NORI-84 一覧 1：cover ができてから、外れ始めるまで待つ（undefined も「covered でない」に入れない）
    await page.waitForFunction(coverStarted, undefined, { timeout: 60_000 });
    const cover = await page.evaluate(() => window.__nori?.cover);
    expect(cover?.source).toBe("memory");
    expect(cover?.look).toBe(judged === "high" ? "textured" : "plain");
    if (judged === "high") expect(cover?.samples).toBe(cover?.loadedSamples);
    else expect(cover?.samples ?? 99).toBeLessThanOrEqual(cover?.loadedSamples ?? 0);
    // ステージ1の始まりのカメラと場面のものの数が、判定の絵と同じ
    const view = await page.evaluate(() => window.__nori?.view?.());
    expect(view?.drawables).toBe(inFrame?.view?.drawables);
    for (const [i, v] of (view?.position ?? []).entries()) {
      expect(v).toBeCloseTo(inFrame?.view?.position[i] ?? Number.NaN, 3);
    }
    for (const [i, v] of (view?.direction ?? []).entries()) {
      expect(v).toBeCloseTo(inFrame?.view?.direction[i] ?? Number.NaN, 3);
    }
    expect(errors).toEqual([]);
  });
});

test.describe("E3：判定しないとき・タイトルの判定を捨てたとき", () => {
  for (const [name, setup] of [
    ["選んだ画質が高", { local: "high" }],
    ["選んだ画質が低", { local: "low" }],
    ["もう結果がある", { session: "high" }],
  ] as const) {
    test(`${name}：タイトルで判定しない`, async ({ page }) => {
      await page.addInitScript(
        ([s, k]) => {
          if ("local" in s) localStorage.setItem("nori-adventure.quality", s.local);
          if ("session" in s) sessionStorage.setItem(k, s.session);
        },
        [setup, JUDGED] as const,
      );
      await page.goto("./");
      await page.waitForFunction(() => window.__noriTitle?.judge !== undefined, undefined, {
        timeout: 30_000,
      });
      expect(await page.evaluate(() => window.__noriTitle?.judge?.state)).toBe("skipped");
      expect(await page.locator("#title-judge").count()).toBe(0);
    });
  }

  test("sessionStorage が使えない：タイトルは止まらず、ステージはその場で判定する", async ({ page }) => {
    const errors = collectErrors(page);
    await page.addInitScript(() => {
      const fail = () => {
        throw new DOMException("blocked", "SecurityError");
      };
      Object.defineProperty(window, "sessionStorage", { get: fail, configurable: true });
    });
    await page.goto("./");
    await expect(page.locator("#title")).toBeVisible();
    await page.waitForFunction(() => window.__noriTitle?.judge?.state === "skipped", undefined, {
      timeout: 30_000,
    });
    await page.goto("./?stage=1");
    await page.waitForFunction(() => window.__nori?.cover !== undefined, undefined, { timeout: 60_000 });
    expect(await page.evaluate(() => window.__nori?.cover?.source)).toBe("measured");
    expect(errors).toEqual([]);
  });

  test("タイトルで素材が読めない：判定せず片付け、何も書かない。ステージはその場で判定して覚える", async ({
    page,
  }) => {
    await page.route("**/textures/**", (r) => r.abort());
    await page.goto("./");
    await page.waitForFunction(() => window.__noriTitle?.judge?.state === "skipped", undefined, {
      timeout: 60_000,
    });
    expect(await page.evaluate(() => window.__noriTitle?.judge?.reason)).toBe("no-texture");
    expect(await page.locator("#title-judge").count()).toBe(0);
    expect(await page.evaluate((k) => sessionStorage.getItem(k), JUDGED)).toBeNull();
    await page.unroute("**/textures/**");
    await page.goto("./?stage=1");
    await page.waitForFunction(() => window.__nori?.cover !== undefined, undefined, { timeout: 60_000 });
    expect(await page.evaluate(() => window.__nori?.cover?.source)).toBe("measured");
    await page.waitForFunction((k) => sessionStorage.getItem(k) !== null, JUDGED, { timeout: 60_000 });
    expect(["high", "low"]).toContain(await page.evaluate((k) => sessionStorage.getItem(k), JUDGED));
  });

  test("判定の途中でステージを選ぶ：途中の値を書き残さず、ステージで初めから判定する", async ({ page }) => {
    await page.addInitScript((k) => {
      if (location.search.includes("stage=1") && !location.search.includes("judge")) {
        (globalThis as { __judgedAtStart?: string | null }).__judgedAtStart = sessionStorage.getItem(k);
      }
    }, JUDGED);
    await page.goto("./");
    await page.waitForFunction(() => window.__noriTitle?.judge?.state === "measuring", undefined, {
      timeout: 60_000,
    });
    await page.locator('a[data-stage="1"]').click();
    await page.waitForFunction(() => window.__nori?.cover !== undefined, undefined, { timeout: 60_000 });
    expect(
      await page.evaluate(() => (globalThis as { __judgedAtStart?: string | null }).__judgedAtStart),
    ).toBeNull();
    expect(await page.evaluate(() => window.__nori?.cover?.source)).toBe("measured");
  });
});

test.describe("E5：覚えた結果でステージ1〜5を始める", () => {
  for (const remembered of ["high", "low"] as const) {
    for (const stage of [1, 2, 3, 4, 5] as const) {
      test(`${remembered} を覚えている：ステージ${stage}は判定を待たない`, async ({ page }) => {
        test.setTimeout(120_000);
        await page.addInitScript(([k, v]) => sessionStorage.setItem(k, v), [JUDGED, remembered] as const);
        await page.goto(`./?stage=${stage}`);
        // NORI-84 一覧 1：ステージのコードが届く前（__nori がない間）に抜けて、覆いの途中を読んでいた（PR #92 の CI）
        await page.waitForFunction(coverStarted, undefined, { timeout: 60_000 });
        const cover = await page.evaluate(() => window.__nori?.cover);
        expect(cover?.source).toBe("memory");
        expect(cover?.look).toBe(remembered === "high" ? "textured" : "plain");
        if (remembered === "high") expect(cover?.samples).toBe(cover?.loadedSamples);
        else expect(cover?.samples ?? 99).toBeLessThanOrEqual(cover?.loadedSamples ?? 0);
        if (remembered === "low") {
          expect(await page.locator("#quality").getAttribute("data-auto")).toBe("true");
        }
      });
    }
  }
});

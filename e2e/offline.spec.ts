import { expect, test } from "@playwright/test";
import { installConstantDriver } from "./driver";

// NORI-38 一覧 E2E（docs/test-plans/NORI-38.md）：一度開いたあと、通信を止めても、タイトル・ポリシーが出て、
// ステージ1〜5がどれも遊べる（Jira の完了条件「機内モードで起動・プレイできる」の、ブラウザでの確かめ）。
// 通信は context.route で全部止めて数える（setOffline は使わない。一覧の前提 7）。ゲームを進めて結果を見る E2E なので、
// 運転役と早送りで刻みの数だけ進め、実際の秒では待たない（CLAUDE.md「E2E は2種類に分ける」）
test.use({ serviceWorkers: "allow" });

const STEPS_PER_FRAME = 4;
const TICKS = 120; // 2 秒分（1/60 秒の刻み）

type Probe = { tick: number; value: number };

declare global {
  // globalThis に足す口は var で宣言する（TypeScript の決まり）
  var __noriProbe: ((stage: number) => Probe) | undefined;
}

test("通信を止めても、タイトル・ポリシー・ステージ1〜5が出て遊べる", async ({ page, context }, testInfo) => {
  test.setTimeout(300_000);
  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  page.on("pageerror", (e) => errors.push(e.message));

  // 1・5：前へ、2：前へ、3：上へ（高さが増える）、4：下へ（深さが増える）
  await installConstantDriver(
    page,
    {
      1: { throttle: 1, steer: 0 },
      2: { throttle: 1, steer: 0 },
      3: { throttle: 1, steer: 0 },
      4: { throttle: -1, steer: 0 },
      5: { throttle: 1, steer: 0 },
    },
    { stepsPerFrame: STEPS_PER_FRAME },
  );
  // ページの中で、刻みと「入力が効いたか」を見る値を読む口。CSP が文字列の実行（eval）を止めるので、
  // 待つ条件を文字列で渡せない。先にページへ入れておき、条件の関数から呼ぶ
  await page.addInitScript(() => {
    globalThis.__noriProbe = (stage) => {
      const n = window.__nori;
      if (stage === 1) return { tick: n?.state().tick ?? 0, value: n?.state().car.speed ?? 0 };
      if (stage === 2) return { tick: n?.train?.().tick ?? 0, value: n?.train?.().train.distance ?? 0 };
      if (stage === 3) return { tick: n?.plane?.().tick ?? 0, value: n?.plane?.().plane.y ?? 0 };
      if (stage === 4) return { tick: n?.sub?.().tick ?? 0, value: -(n?.sub?.().sub.y ?? 0) };
      return { tick: n?.rover?.().tick ?? 0, value: n?.rover?.().rover.speed ?? 0 };
    };
  });

  // 通信ありの間は、タイトルだけを開く。準備（install）が終わるのを待ち、一度開き直して Service Worker の下に入る
  await page.goto("./");
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
  await page.reload();
  expect(await page.evaluate(() => navigator.serviceWorker.controller !== null)).toBe(true);
  // タイトルの裏の画質の判定（NORI-76）が済むか、判定しないと決まるまで待つ（裏の枠が読み込む最中に通信を止めない）
  await page.waitForFunction(
    () => {
      const s = window.__noriTitle?.judge?.state;
      return s === "done" || s === "skipped";
    },
    undefined,
    { timeout: 90_000 },
  );

  // ブラウザが解決したあとの参照（base つき。一覧 2 の確かめない範囲）
  const hrefs = await page.evaluate(() => ({
    manifest: document.querySelector<HTMLLinkElement>('link[rel="manifest"]')?.href ?? "",
    icon: document.querySelector<HTMLLinkElement>('link[rel="apple-touch-icon"]')?.href ?? "",
  }));
  expect(hrefs.manifest).toMatch(/\/nori-adventure\/manifest\.webmanifest$/);
  expect(hrefs.icon).toMatch(/\/nori-adventure\/apple-touch-icon\.png$/);

  // ここから通信を全部止めて数える
  const blocked: string[] = [];
  await context.route("**/*", (route) => {
    blocked.push(route.request().url());
    return route.abort();
  });

  // 対照：キャッシュから1件消して取りに行かせると、止めた数が 1 になる（数える仕組みが働く）
  await page.evaluate(async () => {
    const url = new URL("apple-touch-icon.png", location.href).href;
    for (const key of await caches.keys()) {
      if (key.startsWith("nori-adventure-")) await (await caches.open(key)).delete(url);
    }
    await fetch(url).catch(() => undefined);
  });
  expect(blocked).toHaveLength(1);
  // 対照で止めた1件は、ブラウザがコンソールにエラーとして出す。その1件だけであることを確かめてから数え直す
  expect(errors).toEqual(["Failed to load resource: net::ERR_FAILED"]);
  blocked.length = 0;
  errors.length = 0;

  await page.goto("./");
  await expect(page.locator("#title a.title-button")).toHaveCount(5);

  await page.goto("./privacy.html");
  await expect(page.locator("#ja h1")).toHaveText("プライバシーポリシー");
  await expect(page.locator("#en h1")).toHaveText("Privacy Policy");

  for (const stage of [1, 2, 3, 4, 5] as const) {
    await page.goto(`./?stage=${stage}`);
    if (stage === 2) {
      await page.locator('#train-choice button[data-train="train"]').click();
      await expect(page.locator("#train-choice")).toBeHidden();
    }
    await page.waitForFunction((s) => (globalThis.__noriProbe?.(s).tick ?? 0) >= 1, stage, {
      timeout: 60_000,
    });
    const before = await page.evaluate((s) => globalThis.__noriProbe?.(s) ?? { tick: 0, value: 0 }, stage);
    await page.waitForFunction(
      ([s, min]) => (globalThis.__noriProbe?.(s).tick ?? 0) > min,
      [stage, before.tick + TICKS] as const,
      { timeout: 120_000 },
    );
    const after = await page.evaluate((s) => globalThis.__noriProbe?.(s) ?? { tick: 0, value: 0 }, stage);
    // 入力が効いた（1・5：速さが 0 より大きい、2：進んだ、3：高くなった、4：深くなった）
    if (stage === 1 || stage === 5) expect(after.value, `ステージ${stage}の速さ`).toBeGreaterThan(0);
    else expect(after.value, `ステージ${stage}`).toBeGreaterThan(before.value);

    // 読み終わりを待つ（読めないと箱のまま遊べてしまうので、通信なしで本物のモデル・素材まで出ることを見る）
    await page.waitForFunction(() => window.__nori?.carModel === "glb", undefined, { timeout: 60_000 });
    await page.waitForFunction(
      () => window.__nori?.look !== "loading" && window.__nori?.cover?.state === "gone",
      undefined,
      { timeout: 60_000 },
    );
    if (stage === 1) {
      await page.waitForFunction(() => window.__nori?.cityLife?.().models === 7, undefined, {
        timeout: 60_000,
      });
    } else if (stage === 2) {
      await page.waitForFunction(() => window.__nori?.passingModel === "glb", undefined, { timeout: 60_000 });
      await page.waitForFunction(() => window.__nori?.landmarks?.().stations === 3, undefined, {
        timeout: 60_000,
      });
    } else if (stage === 3) {
      await page.waitForFunction(() => window.__nori?.skyScenery?.().planeModel === "glb", undefined, {
        timeout: 60_000,
      });
    } else if (stage === 4) {
      await page.waitForFunction(() => window.__nori?.seaModels === 7, undefined, { timeout: 60_000 });
    }
    await testInfo.attach(`stage${stage}-offline.png`, {
      body: await page.screenshot(),
      contentType: "image/png",
    });
  }

  expect(blocked, "通信を止めたあとに出た要求").toEqual([]);
  expect(errors, "コンソールのエラー").toEqual([]);
});

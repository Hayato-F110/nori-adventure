// NORI-34（docs/test-plans/NORI-34.md の一覧 3）：URL に debug を付けたときの上の表示の、最小の FPS と画質。
// 実際の速さで 1 秒ごとの値がたまるのを待つ（早送りしない）。FPS の大きさは見ないので @fps の札は付けない（R1-34-K）。
// 表示の文・fpsSamples・quality は 1 回でまとめて読む（間に値が足されて食い違わない）。
import { expect, type Page, test, type TestInfo } from "@playwright/test";
import { PERF } from "../src/config";

type Snapshot = { text: string; samples: number[]; quality: string | undefined };

/** 1 秒ごとの値が at 個以上たまったら、その時の表示・値・画質をまとめて返す（覆いは待たない） */
const snapshotWhen = async (page: Page, atLeast: number): Promise<Snapshot> => {
  const handle = await page.waitForFunction(
    (n) => {
      const samples = window.__nori?.fpsSamples ?? [];
      if (samples.length < n) return null;
      return {
        text: document.getElementById("hud")?.textContent ?? "",
        samples: [...samples],
        quality: window.__nori?.quality,
      };
    },
    atLeast,
    { timeout: 90_000 },
  );
  return (await handle.jsonValue()) as Snapshot;
};

const attach = (testInfo: TestInfo, name: string, s: Snapshot) =>
  testInfo.attach(name, { body: JSON.stringify(s, null, 2), contentType: "application/json" });

/** ステージごとの、今までの表示の終わり（R1-34-I・R2-34-C） */
const endings: Record<number, RegExp> = {
  1: / · -?\d+ km\/h$/,
  2: / · -?\d+ km\/h$/,
  3: / · -?\d+ m$/,
  4: / · -?\d+ m$/,
  5: / · なかよし \d+$/,
};

for (const stage of [1, 2, 3, 4, 5]) {
  test(`NORI-34：上の表示の最小の FPS（ステージ${stage}・debug あり）`, async ({ page }, testInfo) => {
    await page.goto(`./?stage=${stage}&debug`);

    // ① 値が 1〜10 個のうちは「最小 —」（R1-34-H・R2-34-B）
    const early = await snapshotWhen(page, 1);
    await attach(testInfo, "early", early);
    expect(
      early.samples.length,
      `値が ${early.samples.length} 個たまってから読んだ（10 個以下で読みたい）`,
    ).toBeLessThanOrEqual(PERF.skipSeconds);
    expect(early.text).toMatch(/^\d+ fps · 最小 — · (高|低) · /);

    // ② 11 個以上で、最小は始めの skipSeconds 個を除いた値の最小を切り捨てたもの。画質は __nori.quality と同じ（R2-34-D）
    const late = await snapshotWhen(page, PERF.skipSeconds + 1);
    await attach(testInfo, "late", late);
    const want = Math.floor(Math.min(...late.samples.slice(PERF.skipSeconds)));
    const qualityText = late.quality === "low" ? "低" : "高";
    expect(late.quality === "high" || late.quality === "low").toBe(true);
    expect(late.text).toMatch(new RegExp(`^\\d+ fps · 最小 ${want} · ${qualityText} · `));
    // ③ そのあとに今までの表示が続く
    expect(late.text).toMatch(endings[stage] ?? /$^/);
  });

  test(`NORI-34：debug なしでは上の表示に FPS を出さない（ステージ${stage}）`, async ({ page }, testInfo) => {
    await page.goto(`./?stage=${stage}`);
    // ④ 値が 1 個以上たまってから読む（たまる前は、debug ありでも表示は空のため。R1-34-G）
    const s = await snapshotWhen(page, 1);
    await attach(testInfo, "no-debug", s);
    expect(s.text).not.toContain("fps");
  });
}

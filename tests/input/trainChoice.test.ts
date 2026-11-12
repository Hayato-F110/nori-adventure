import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { STAGE2 } from "../../src/config/index.ts";
import { isTrainChoice } from "../../src/input/trainChoice.ts";

// docs/game-rules.md「景色と列車を増やす」（NORI-59）。テストの一覧の 1（列車を選ぶ）
const root = path.resolve(import.meta.dirname, "../..");
const html = readFileSync(path.join(root, "index.html"), "utf8");
const css = readFileSync(path.join(root, "src/style.css"), "utf8");
const panel = /<div\s+id="train-choice"[\s\S]*?<\/svg>\s*<\/button>\s*<\/div>/.exec(html)?.[0] ?? "";
const buttons = [...panel.matchAll(/<button[\s\S]*?<\/button>/g)].map((m) => m[0]);
const textBetweenTags = (fragment: string) =>
  [...fragment.matchAll(/>([^<]*)</g)].map((m) => (m[1] ?? "").trim()).filter((s) => s !== "");

describe("乗る列車を選ぶ", () => {
  it("ボタンは STAGE2.trainChoices と同じ3つ・同じ順。最初は隠れている（ステージ2だけで出す）", () => {
    expect(panel).toMatch(/\shidden[\s>]/);
    expect(buttons.map((b) => /data-train="([^"]+)"/.exec(b)?.[1])).toEqual([...STAGE2.trainChoices]);
  });

  it("文字を出さず、絵と読み上げの名前だけ", () => {
    for (const b of buttons) {
      expect(b).toMatch(/aria-label="[^"]+"/);
      expect(b).toMatch(/<svg[^>]*aria-hidden="true"/);
      expect(textBetweenTags(b)).toEqual([]);
    }
  });

  it("ボタンの大きさは STAGE2.choiceButtonSize（64 px 以上）", () => {
    expect(STAGE2.choiceButtonSize).toBeGreaterThanOrEqual(64);
    expect(css).toContain(`--choice-button: ${STAGE2.choiceButtonSize}px;`);
  });

  it("選べる名前だけを受け付ける", () => {
    for (const name of STAGE2.trainChoices) expect(isTrainChoice(name)).toBe(true);
    expect(isTrainChoice("plane")).toBe(false);
    expect(isTrainChoice(undefined)).toBe(false);
  });
});

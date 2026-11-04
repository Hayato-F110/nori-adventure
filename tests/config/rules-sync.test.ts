import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CONFIG } from "../../src/config";

// docs/game-rules.md の表から「値」と「設定のキー」を読み、src/config の値と一致するかを確かめる。
// 文書だけ・コードだけを直して数値がずれるのを防ぐ。
const rulesPath = path.resolve(import.meta.dirname, "../../docs/game-rules.md");
const markdown = readFileSync(rulesPath, "utf8");

const lookup = (key: string): unknown =>
  key.split(".").reduce<unknown>((node, part) => (node as Record<string, unknown>)?.[part], CONFIG);

// 「1/60 s」「12 m/s（約43 km/h）」「2.0 s」などの先頭の数を取り出す
const parseNumber = (cell: string): number | null => {
  const match = /^\s*(\d+(?:\.\d+)?)(?:\s*\/\s*(\d+(?:\.\d+)?))?/.exec(cell);
  if (match === null) return null;
  const value = Number(match[1]);
  return match[2] === undefined ? value : value / Number(match[2]);
};

type Row = { key: string; valueCell: string };

const rows: Row[] = markdown
  .split("\n")
  .filter((line) => line.startsWith("|"))
  .flatMap((line) => {
    const cells = line.split("|").slice(1, -1);
    const keyCellIndex = cells.findIndex((cell) => /`[A-Z0-9]+\.[A-Za-z.]+`/.test(cell));
    if (keyCellIndex < 1) return [];
    const keys = [...(cells[keyCellIndex] ?? "").matchAll(/`([A-Z0-9]+\.[A-Za-z.]+)`/g)].map(
      (m) => m[1] ?? "",
    );
    // キーが1つの行だけを対象にする（複数キーの行は値の対応が文章なので対象外）
    if (keys.length !== 1) return [];
    return [{ key: keys[0] ?? "", valueCell: cells[keyCellIndex - 1] ?? "" }];
  });

describe("game-rules.md と src/config の一致", () => {
  it("表から十分な数のキーを読めている", () => {
    expect(rows.length).toBeGreaterThanOrEqual(20);
  });

  it.each(rows)("$key", ({ key, valueCell }) => {
    const actual = lookup(key);
    expect(actual, `${key} が src/config にありません`).not.toBeUndefined();
    if (/オフ/.test(valueCell)) {
      expect(actual).toBe(false);
      return;
    }
    if (typeof actual !== "number") return; // 位置などのまとまりは別のテストで確かめる
    const expected = parseNumber(valueCell);
    expect(expected, `${key} の値「${valueCell.trim()}」を数として読めません`).not.toBeNull();
    expect(actual).toBeCloseTo(expected ?? Number.NaN, 9);
  });

  it("補助機能は初期値がすべてオフ", () => {
    expect(Object.values(CONFIG.ASSIST).every((value) => value === false)).toBe(true);
  });
});

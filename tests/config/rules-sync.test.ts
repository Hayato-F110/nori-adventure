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

const KEY = /`([A-Z0-9_]+\.[A-Za-z0-9.-]+)`/g;

// 「設定のキー」の欄：キーだけが書かれた欄（「—」の欄や、文の中にキーが出てくる「値」の欄は違う）
const isKeyCell = (cell: string): boolean =>
  /`[A-Z0-9_]+\./.test(cell) && cell.replace(KEY, "").replace(/[\s・、,]/g, "") === "";

type Row = { keys: string[]; valueCell: string };

const allRows: Row[] = markdown
  .split("\n")
  .filter((line) => line.startsWith("|"))
  .flatMap((line) => {
    const cells = line.split("|").slice(1, -1);
    const keyCellIndex = cells.findIndex(isKeyCell);
    if (keyCellIndex < 1) return [];
    const keys = [...(cells[keyCellIndex] ?? "").matchAll(KEY)].map((m) => m[1] ?? "");
    return [{ keys, valueCell: cells[keyCellIndex - 1] ?? "" }];
  });

// キーが1つで、値が数・オン/オフの行：先頭の数で比べる（いちばん強い確かめ方）
const rows = allRows
  .filter((row) => row.keys.length === 1)
  .map((row) => ({ key: row.keys[0] ?? "", valueCell: row.valueCell }))
  .filter(({ key }) => typeof lookup(key) === "number" || typeof lookup(key) === "boolean");

// 欄の中の数（「−80」の全角の負号、「30%」→ 0.3）。名前の中の数（Grass004 の 4）は読まない
const numbersIn = (cell: string): number[] =>
  [...cell.replace(/−/g, "-").matchAll(/(?<![A-Za-z0-9.])(-?\d+(?:\.\d+)?)(\s*%)?/g)].map(
    (m) => Number(m[1]) / (m[2] === undefined ? 1 : 100),
  );

const leaves = (value: unknown): unknown[] =>
  Array.isArray(value)
    ? value.flatMap(leaves)
    : typeof value === "object" && value !== null
      ? Object.values(value).flatMap(leaves)
      : [value];

const appearsIn = (cell: string, leaf: unknown): boolean =>
  typeof leaf === "number"
    ? numbersIn(cell).some((n) => Math.abs(n - leaf) < 1e-9)
    : typeof leaf === "string"
      ? cell.toLowerCase().includes(leaf.toLowerCase())
      : true; // オン/オフは先頭の数のテストで見る

// 上で比べない残り：配列・まとまり・色・名前の値と、キーが2つ以上の行にだけある数（NORI-69、レビュー 29-53）。
// 同じキーが何行かにあるときは、その「値」の欄をまとめて見る
const cellsByKey = new Map<string, string>();
for (const row of allRows) {
  for (const key of row.keys) cellsByKey.set(key, `${cellsByKey.get(key) ?? ""} ${row.valueCell}`);
}
const singleNumberKeys = new Set(rows.map((row) => row.key));
const restRows = [...cellsByKey]
  .filter(([key]) => !singleNumberKeys.has(key))
  .map(([key, cells]) => ({ key, cells }));

/** 文書に個数だけを書き、中の数（置き場所など）は書かない配列と、その理由 */
const COUNT_ONLY: Record<string, string> = {
  "STAGE2.trackPoints": "線路の形の制御点。ルールは長さ（約 599 m）で決め、長さは単体テストで見る",
  "STAGE3.mountains": "景色の置き場所。ルールは個数と、輪の通り道から離す距離で決める",
  "STAGE3.balloons": "景色の置き場所。同上",
  "STAGE3.otherPlanes": "景色の飛行機の円。ルールは半径・高さを文に書き、個数で比べる",
  "STAGE3.driftBalloons": "景色の置き場所。ルールは個数と高さの範囲で決める",
  "STAGE3.birdFlocks": "景色の置き場所。同上",
  "STAGE4.rocks": "景色の置き場所。ルールは個数と、手がかりの道から離す距離で決める",
  "STAGE5.rocks": "景色の置き場所。ルールは個数・半径の範囲と、道すじから離す距離で決める",
  "STAGE5.craters": "見た目だけの置き場所（地面は平ら）。ルールは個数",
};

describe("game-rules.md と src/config の一致", () => {
  it("表から十分な数のキーを読めている", () => {
    expect(rows.length).toBeGreaterThanOrEqual(20);
    expect(restRows.length).toBeGreaterThanOrEqual(80);
  });

  // 中の数・名前・色が全部、文書の「値」の欄にあること。
  // 例外は2つだけ：1, 2, …, n と並ぶ配列は「1〜n」、個数だけを書いた配列は欄の最初の数が個数
  it.each(restRows)("$key（配列・まとまり・色・複数キーの行）", ({ key, cells }) => {
    const actual = lookup(key);
    expect(actual, `${key} が src/config にありません`).not.toBeUndefined();
    const missing = leaves(actual).filter((leaf) => !appearsIn(cells, leaf));
    if (missing.length === 0) return;
    if (Array.isArray(actual)) {
      const first = actual[0] as unknown;
      const consecutive = actual.every((v, i) => typeof v === "number" && v === (first as number) + i);
      if (consecutive && cells.includes(`${String(first)}〜${String(actual.at(-1))}`)) return;
      // 個数を書いた行（例：「4台（ほかの車・バス…）」）：名前は文で書いてよいが、中の数は欄にあること。
      // 数を書かない配列は COUNT_ONLY に名前と理由を挙げたものだけ（NORI-69 の2回目の初見レビュー：
      // 前は個数が合えば中身を見ずに通し、車の始めの位置を変えても落ちなかった）
      if (numbersIn(cells)[0] === actual.length) {
        const missingNumbers = missing.filter((leaf) => typeof leaf === "number");
        if (missingNumbers.length === 0 || key in COUNT_ONLY) return;
        expect(missingNumbers, `${key} の数が文書の欄「${cells.trim().slice(0, 60)}…」にありません`).toEqual(
          [],
        );
        return;
      }
    }
    expect(missing, `${key} の値が文書の欄「${cells.trim().slice(0, 60)}…」にありません`).toEqual([]);
  });

  it.each(rows)("$key", ({ key, valueCell }) => {
    const actual = lookup(key);
    expect(actual, `${key} が src/config にありません`).not.toBeUndefined();
    if (typeof actual === "boolean") {
      expect(actual, `${key} の値「${valueCell.trim()}」`).toBe(!/オフ/.test(valueCell));
      return;
    }
    const expected = parseNumber(valueCell);
    expect(expected, `${key} の値「${valueCell.trim()}」を数として読めません`).not.toBeNull();
    expect(actual).toBeCloseTo(expected ?? Number.NaN, 9);
  });

  // 逆の向き：設定にだけある数値（文書に書かずに足した数値）がないこと。
  // 文書のどこかの表に、そのキーか、親のキー（例：`STAGE1.start`）が書いてあればよい
  it("src/config の値は、すべて game-rules.md に書いてある", () => {
    const documented = new Set([...markdown.matchAll(/`([A-Z0-9_]+\.[A-Za-z.-]+)`/g)].map((m) => m[1] ?? ""));
    const leaves = (node: unknown, prefix: string): string[] =>
      typeof node === "object" && node !== null
        ? Object.entries(node).flatMap(([k, v]) => leaves(v, prefix === "" ? k : `${prefix}.${k}`))
        : [prefix];
    const covered = (key: string) => {
      const parts = key.split(".");
      return parts.some((_, i) => i >= 1 && documented.has(parts.slice(0, i + 1).join(".")));
    };
    const missing = Object.entries(CONFIG)
      .flatMap(([group, values]) => leaves(values, group))
      .filter((key) => !covered(key));
    expect(missing, "文書にない設定のキー").toEqual([]);
  });

  it("5つのステージすべてに、乗り物とコースの数値がある（NORI-24）", () => {
    const groups = [
      "CAR",
      "STAGE1",
      "TRAIN",
      "STAGE2",
      "PLANE",
      "STAGE3",
      "SUB",
      "STAGE4",
      "ROVER",
      "STAGE5",
      "BOSS",
    ];
    expect(groups.filter((group) => !(group in CONFIG))).toEqual([]);
  });

  it("補助機能は初期値がすべてオフ", () => {
    expect(Object.values(CONFIG.ASSIST).every((value) => value === false)).toBe(true);
  });
});

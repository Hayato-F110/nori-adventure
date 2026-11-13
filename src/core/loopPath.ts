// 角の点を結んだ閉じた道を、進む向きの左へずらし、角を円弧で丸めた道（NORI-61。docs/game-rules.md「街をにぎやかに」）。
// 道の上の位置は「距離 0 からの距離（m）」で表す。距離 0 は1つ目の角を曲がり終えた所。
// 純粋な計算だけ（乱数・時刻を使わない）。向きは types.ts の Pose2D と同じ（0 のとき −Z、左回りが正）。
import type { Point } from "./course";
import { wrapDistance } from "./track";

export type LoopPath = {
  /** ひとまわりの長さ（m） */
  readonly length: number;
  /** 距離 s（m。輪の外でも可）の点 */
  pointAt(s: number): Point;
  /** 距離 s の進む向き */
  headingAt(s: number): number;
};

type Vec = { x: number; z: number };

type Piece =
  | { kind: "line"; from: number; length: number; start: Vec; dir: Vec }
  | { kind: "arc"; from: number; length: number; center: Vec; radius: Vec; dir: Vec; sign: number };

const sub = (a: Vec, b: Vec): Vec => ({ x: a.x - b.x, z: a.z - b.z });
const add = (a: Vec, b: Vec): Vec => ({ x: a.x + b.x, z: a.z + b.z });
const scale = (a: Vec, k: number): Vec => ({ x: a.x * k, z: a.z * k });
const unit = (a: Vec): Vec => scale(a, 1 / Math.hypot(a.x, a.z));
/** 進む向き d の左（d が −Z のとき −X） */
const leftOf = (d: Vec): Vec => ({ x: d.z, z: -d.x });
/** 上から見て回す（a から b への角が正になる向き） */
const rotate = (v: Vec, angle: number): Vec => ({
  x: v.x * Math.cos(angle) - v.z * Math.sin(angle),
  z: v.x * Math.sin(angle) + v.z * Math.cos(angle),
});
const headingOf = (d: Vec): number => Math.atan2(-d.x, -d.z);

export const createLoopPath = (corners: readonly Point[], offset: number, cornerRadius: number): LoopPath => {
  const n = corners.length;
  if (n < 3) throw new Error("道の角は3つ以上");
  const at = (i: number): Point => corners[((i % n) + n) % n] as Point;
  const dirs = Array.from({ length: n }, (_, i) => unit(sub(at(i + 1), at(i))));
  const dir = (i: number): Vec => dirs[((i % n) + n) % n] as Vec;

  // 1. 角の点を左へずらす（隣の2辺をそれぞれ offset ずらした線の交わる点）
  const shifted = Array.from({ length: n }, (_, i) => {
    const l1 = leftOf(dir(i - 1));
    const l2 = leftOf(dir(i));
    const k = offset / (1 + l1.x * l2.x + l1.z * l2.z);
    return add(at(i), scale(add(l1, l2), k));
  });
  const p = (i: number): Vec => shifted[((i % n) + n) % n] as Vec;

  // 2. 角 i の曲がる角（入る向き → 出る向き。左回りが正）と、円弧のために辺から削る長さ
  const turn = (i: number): number => {
    const a = dir(i - 1);
    const b = dir(i);
    return Math.atan2(a.x * b.z - a.z * b.x, a.x * b.x + a.z * b.z);
  };
  const cut = (i: number): number => cornerRadius * Math.tan(Math.abs(turn(i)) / 2);

  // 3. 辺 i のまっすぐな所 → 角 i+1 の円弧、の順に並べる（距離 0 = 角 0 を曲がり終えた所）
  const pieces: Piece[] = [];
  let total = 0;
  for (let i = 0; i < n; i++) {
    const d = dir(i);
    const edge = Math.hypot(p(i + 1).x - p(i).x, p(i + 1).z - p(i).z);
    const straight = edge - cut(i) - cut(i + 1);
    if (straight < 0)
      throw new Error(`角の丸め（半径 ${cornerRadius} m）が辺 ${i}（${edge.toFixed(2)} m）より長い`);
    const start = add(p(i), scale(d, cut(i)));
    pieces.push({ kind: "line", from: total, length: straight, start, dir: d });
    total += straight;

    const angle = turn(i + 1);
    if (Math.abs(angle) > 1e-12) {
      const sign = Math.sign(angle);
      const end = add(start, scale(d, straight));
      // 円の中心は、曲がる側（左に曲がるなら左）へ半径の所
      const toCenter = scale(leftOf(d), -sign * cornerRadius);
      const center = add(end, toCenter);
      const length = Math.abs(angle) * cornerRadius;
      pieces.push({ kind: "arc", from: total, length, center, radius: sub(end, center), dir: d, sign });
      total += length;
    }
  }
  const length = total;

  const pieceAt = (s: number): { piece: Piece; t: number } => {
    const d = wrapDistance(s, length);
    for (const piece of pieces) {
      if (d < piece.from + piece.length) return { piece, t: d - piece.from };
    }
    const last = pieces[pieces.length - 1] as Piece;
    return { piece: last, t: last.length };
  };

  return {
    length,
    pointAt(s) {
      const { piece, t } = pieceAt(s);
      if (piece.kind === "line") return add(piece.start, scale(piece.dir, t));
      return add(piece.center, rotate(piece.radius, (piece.sign * t) / cornerRadius));
    },
    headingAt(s) {
      const { piece, t } = pieceAt(s);
      if (piece.kind === "line") return headingOf(piece.dir);
      return headingOf(rotate(piece.dir, (piece.sign * t) / cornerRadius));
    },
  };
};

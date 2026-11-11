// ステージ2の線路（docs/game-rules.md「線路・駅・見え方」。NORI-26）。
// 制御点を通る、閉じた Catmull-Rom 曲線。線路の上の位置は「スタートからの距離（m）」で表す。
// 距離 → 曲線の媒介変数の対応は、細かく区切った長さの表で引く（純粋な計算だけ。乱数・時刻を使わない）。

export type Point3 = { readonly x: number; readonly y: number; readonly z: number };

export type Track = {
  /** 輪のひとまわりの長さ（m） */
  readonly length: number;
  /** 距離 s（m。輪の外でも可）の点 */
  pointAt(s: number): Point3;
  /** 距離 s の進む向き（上から見た角度。0 のとき −Z。types.ts の Pose2D と同じ） */
  headingAt(s: number): number;
  /** 距離 s の傾き（高さの変化 ÷ 水平の距離） */
  slopeAt(s: number): number;
};

/** 1区間（制御点の間）を区切る数。長さの誤差を 1 cm 未満にする */
const SUBDIVISIONS = 200;

/** 距離を 0 以上・長さ未満に収める（輪をまたいでも同じ場所になる） */
export const wrapDistance = (s: number, length: number): number => {
  const r = s % length;
  return r < 0 ? r + length : r === 0 ? 0 : r;
};

const catmullRom = (p0: number, p1: number, p2: number, p3: number, t: number): number =>
  0.5 *
  (2 * p1 +
    (-p0 + p2) * t +
    (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t +
    (-p0 + 3 * p1 - 3 * p2 + p3) * t * t * t);

const catmullRomDerivative = (p0: number, p1: number, p2: number, p3: number, t: number): number =>
  0.5 * (-p0 + p2 + 2 * (2 * p0 - 5 * p1 + 4 * p2 - p3) * t + 3 * (-p0 + 3 * p1 - 3 * p2 + p3) * t * t);

export const createTrack = (points: readonly Point3[]): Track => {
  const n = points.length;
  if (n < 4) throw new Error("線路の制御点は4つ以上");
  const pt = (i: number): Point3 => points[((i % n) + n) % n] as Point3;

  /** 媒介変数 u（0〜n。整数部が区間の番号）の点と、u についての微分 */
  const evaluate = (u: number, derivative: boolean): Point3 => {
    const i = Math.min(n - 1, Math.floor(u));
    const t = u - i;
    const [a, b, c, d] = [pt(i - 1), pt(i), pt(i + 1), pt(i + 2)];
    const f = derivative ? catmullRomDerivative : catmullRom;
    return { x: f(a.x, b.x, c.x, d.x, t), y: f(a.y, b.y, c.y, d.y, t), z: f(a.z, b.z, c.z, d.z, t) };
  };

  // 長さの表：table[k] は u = k / SUBDIVISIONS までの長さ
  const count = n * SUBDIVISIONS;
  const table = new Float64Array(count + 1);
  let prev = evaluate(0, false);
  for (let k = 1; k <= count; k++) {
    const p = evaluate(k / SUBDIVISIONS, false);
    table[k] = (table[k - 1] as number) + Math.hypot(p.x - prev.x, p.y - prev.y, p.z - prev.z);
    prev = p;
  }
  const length = table[count] as number;

  /** 距離 → 媒介変数（表を二分探索し、区切りの中は直線で補間） */
  const paramAt = (s: number): number => {
    const d = wrapDistance(s, length);
    let lo = 0;
    let hi = count;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if ((table[mid] as number) <= d) lo = mid;
      else hi = mid;
    }
    const a = table[lo] as number;
    const b = table[hi] as number;
    const t = b > a ? (d - a) / (b - a) : 0;
    return (lo + t) / SUBDIVISIONS;
  };

  return {
    length,
    pointAt: (s) => evaluate(paramAt(s), false),
    headingAt: (s) => {
      const d = evaluate(paramAt(s), true);
      return Math.atan2(-d.x, -d.z);
    },
    slopeAt: (s) => {
      const d = evaluate(paramAt(s), true);
      return d.y / Math.hypot(d.x, d.z);
    },
  };
};

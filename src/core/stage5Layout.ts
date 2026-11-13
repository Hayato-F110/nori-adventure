// ステージ5の月面の配置（docs/game-rules.md「ステージ5」のコース。NORI-29）。
// 道すじ・ジャンプ台・ほし・なかよしの星の場所を、設定（STAGE5・BOSS）から式で求める。毎回同じ。
import { BOSS, STAGE5 } from "../config";

export type Point3 = { x: number; y: number; z: number };
export type JumpPad = { d: number; x: number; z: number; heading: number };

const TAU = 2 * Math.PI;

/** 道すじの、進んだ距離 d の点（上から見た x・z） */
export const pathPoint = (d: number): { x: number; z: number } => ({
  x: STAGE5.start.x + STAGE5.pathWave * Math.sin((TAU * d) / STAGE5.pathLength),
  z: STAGE5.start.z - d,
});

/** 道すじの、進んだ距離 d での向き（heading 0 は −Z 向き。前は (−sin h, −cos h)） */
export const pathHeading = (d: number): number => {
  const dx = ((STAGE5.pathWave * TAU) / STAGE5.pathLength) * Math.cos((TAU * d) / STAGE5.pathLength);
  const dz = -1;
  return Math.atan2(-dx, -dz);
};

const SAMPLE = 0.1;

/** (x, z) にいちばん近い道すじの点の d（0〜pathLength。0.1 m きざみ） */
export const nearestPathD = (x: number, z: number): number => {
  let best = 0;
  let bestDist = Infinity;
  const n = Math.round(STAGE5.pathLength / SAMPLE);
  for (let i = 0; i <= n; i++) {
    const d = i * SAMPLE;
    const p = pathPoint(d);
    const dist = Math.hypot(p.x - x, p.z - z);
    if (dist < bestDist) {
      bestDist = dist;
      best = d;
    }
  }
  return best;
};

/** (x, z) から道すじまでの距離（m） */
export const distanceToPath = (x: number, z: number): number => {
  const p = pathPoint(nearestPathD(x, z));
  return Math.hypot(p.x - x, p.z - z);
};

export const jumpPads = (): JumpPad[] =>
  STAGE5.jumpPads.map((d) => ({ d, ...pathPoint(d), heading: pathHeading(d) }));

/** ほし：地面の分（groundStars の順）のあとに、台ごとの空中の分（airStars の順） */
export const starPositions = (): Point3[] => [
  ...STAGE5.groundStars.map((d) => ({ ...pathPoint(d), y: 0 })),
  ...jumpPads().flatMap((pad) =>
    STAGE5.airStars.map((a) => ({
      x: pad.x - Math.sin(pad.heading) * a.ahead,
      y: a.height,
      z: pad.z - Math.cos(pad.heading) * a.ahead,
    })),
  ),
];

/** なかよしの星：広場の中心から friendStarRing m の円に、+X から 45° おき */
export const friendStarPositions = (): Point3[] =>
  Array.from({ length: BOSS.friendStarCount }, (_, i) => {
    const a = (i * TAU) / BOSS.friendStarCount;
    return {
      x: STAGE5.arenaCenter.x + Math.cos(a) * BOSS.friendStarRing,
      y: BOSS.friendStarHeight,
      z: STAGE5.arenaCenter.z + Math.sin(a) * BOSS.friendStarRing,
    };
  });

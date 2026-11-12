// ステージ3の空の景色の動き（NORI-60。docs/game-rules.md「空をにぎやかに」）。
// ほかの飛行機・ただよう気球・鳥の群れ・山のふもとの木。どれも景色だけで、当たり判定はない（状態を変えない）。
// 位置は時刻（tick）だけで決まる式。同じ tick → 同じ位置なので、リプレイがずれない。
import { SIM, STAGE3 } from "../config";

/** 位置と向き。heading は飛行機と同じ決まり（前は (−sin h, −cos h)） */
export type ScenePose = { x: number; y: number; z: number; heading: number };

/** 鳥1羽：位置・向きと、羽の角度（rad。+ で上） */
export type BirdPose = ScenePose & { flap: number };

/** 木1本（地面の上。rotation は上から見た向き rad、scale は大きさの倍率） */
export type SceneTree = { x: number; z: number; rotation: number; scale: number };

const seconds = (tick: number) => tick * SIM.fixedDt;

/**
 * 中心 (cx, cz)・半径 r の円の上の点。角度 a は x 軸から z 軸へ。dir 1 は a が増える向き（上から見て左回り）。
 * そのときの進む向き：dir 1 → heading = π − a、dir −1 → heading = −a
 */
const onCircle = (cx: number, cz: number, r: number, a: number, dir: number) => ({
  x: cx + Math.cos(a) * r,
  z: cz + Math.sin(a) * r,
  heading: dir > 0 ? Math.PI - a : -a,
});

/** ほかの飛行機 i の位置と向き */
export const otherPlanePose = (i: number, tick: number): ScenePose => {
  const p = STAGE3.otherPlanes[i];
  if (p === undefined) throw new Error(`ほかの飛行機 ${i} がない`);
  const a = p.phase + (p.dir * STAGE3.otherPlaneSpeed * seconds(tick)) / p.radius;
  return { ...onCircle(0, 0, p.radius, a, p.dir), y: p.height };
};

/** ほかの飛行機が1周する時間（s） */
export const otherPlaneLapSeconds = (i: number): number => {
  const p = STAGE3.otherPlanes[i];
  if (p === undefined) throw new Error(`ほかの飛行機 ${i} がない`);
  return (2 * Math.PI * p.radius) / STAGE3.otherPlaneSpeed;
};

/** ただよう気球 i の中心（上下にゆれる。気球ごとに、ゆれの始まりをずらす） */
export const driftBalloonPosition = (i: number, tick: number): { x: number; y: number; z: number } => {
  const b = STAGE3.driftBalloons[i];
  if (b === undefined) throw new Error(`ただよう気球 ${i} がない`);
  const phase = (i / STAGE3.driftBalloons.length) * 2 * Math.PI;
  const y = b.y + STAGE3.driftBob * Math.sin((2 * Math.PI * seconds(tick)) / STAGE3.driftPeriod + phase);
  return { x: b.x, y, z: b.z };
};

/** 群れ f の j 番目の鳥（円の上に birdGap ずつ並んで、左回りに飛ぶ。少しずつ高さと羽ばたきをずらす） */
export const birdPose = (f: number, j: number, tick: number): BirdPose => {
  const flock = STAGE3.birdFlocks[f];
  if (flock === undefined) throw new Error(`鳥の群れ ${f} がない`);
  const t = seconds(tick);
  const a = f * 1.3 - j * STAGE3.birdGap + (STAGE3.birdSpeed * t) / STAGE3.birdCircleRadius;
  const flap = STAGE3.birdFlapAngle * Math.sin(2 * Math.PI * STAGE3.birdFlapHz * t + j * 1.1);
  return {
    ...onCircle(flock.x, flock.z, STAGE3.birdCircleRadius, a, 1),
    y: flock.y + ((j % 3) - 1) * 0.8,
    flap,
  };
};

/** 0〜1 の決まった値（木の並びだけに使う。Math.random は使わない） */
const hash = (i: number): number => {
  const v = Math.sin(i * 12.9898 + 78.233) * 43758.5453;
  return v - Math.floor(v);
};

/** 山のふもとの木（山ごとに treesPerMountain 本。底の端から treeRingMin〜treeRingMax の間） */
export const sceneryTrees = (): SceneTree[] =>
  STAGE3.mountains.flatMap((m, mi) =>
    Array.from({ length: STAGE3.treesPerMountain }, (_, k) => {
      const n = mi * 100 + k;
      const a = ((k + hash(n) * 0.6) / STAGE3.treesPerMountain) * 2 * Math.PI;
      const d = m.radius + STAGE3.treeRingMin + hash(n + 50) * (STAGE3.treeRingMax - STAGE3.treeRingMin);
      return {
        x: m.x + Math.cos(a) * d,
        z: m.z + Math.sin(a) * d,
        rotation: hash(n + 80) * 2 * Math.PI,
        scale: STAGE3.treeScaleMin + hash(n + 90) * (STAGE3.treeScaleMax - STAGE3.treeScaleMin),
      };
    }),
  );

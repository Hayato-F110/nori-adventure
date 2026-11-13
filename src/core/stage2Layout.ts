// ステージ2の景色の配置（山・木・駅のホーム。NORI-26）。描画（stage2View）と光のベイク（Blender）で同じものを使う。
// 純粋な計算だけ（Three.js・乱数・時刻を使わない）。同じ線路・駅 → 同じ配置。
// 見た目だけの配置で、ゲームの状態（列車・駅に着いたか）には影響しない。
// node で直接動かす配置の書き出し（tools/assets/export-layout.ts）からも読むので、ファイル名まで書く（フォルダの import は node で読めない）
import { SIM, STAGE2 } from "../config/index.ts";
import type { Track } from "./track";

/** 線路の断面とホームの寸法（m。見た目だけ） */
export const STAGE2_SCENERY = {
  bedTop: 0.3,
  bedHalf: 1.6,
  sleeper: { width: 2.4, height: 0.12, depth: 0.28, spacing: 0.9 },
  rail: { gauge: 0.75, width: 0.1, height: 0.15 },
  platform: { length: 12, width: 3, offset: 3.1, height: 0.9 },
  groundSize: 640,
  treeCount: 150,
} as const;

export type Mountain = { x: number; z: number; radius: number; height: number; rotation: number };
export type SceneryTree = { x: number; z: number; rotation: number; scale: number };
/** ホームの中心（線路の右）。heading は線路の向き（Pose2D と同じ） */
export type Platform = { x: number; y: number; z: number; heading: number };

export type Stage2Scenery = {
  mountains: Mountain[];
  trees: SceneryTree[];
  platforms: Platform[];
};

/** 0〜1 の決まった値（並びだけに使う） */
export const sceneryHash = (i: number): number => {
  const v = Math.sin(i * 12.9898 + 78.233) * 43758.5453;
  return v - Math.floor(v);
};

/** 線路の上の距離 s から、右へ lateral ずらした点（上から見て） */
export const offsetOnTrack = (track: Track, s: number, lateral: number) => {
  const p = track.pointAt(s);
  const h = track.headingAt(s);
  return { x: p.x + Math.cos(h) * lateral, y: p.y, z: p.z - Math.sin(h) * lateral };
};

export const createStage2Scenery = (track: Track, stations: readonly number[]): Stage2Scenery => {
  const hash = sceneryHash;
  const samples = Array.from({ length: Math.ceil(track.length / 4) }, (_, i) => track.pointAt(i * 4));
  // すれ違う電車の線路（左 STAGE2.passingOffset。NORI-59）
  const passing = Array.from({ length: Math.ceil(track.length / 4) }, (_, i) =>
    offsetOnTrack(track, i * 4, -STAGE2.passingOffset),
  );
  const toTrack = (x: number, z: number) => Math.min(...samples.map((p) => Math.hypot(p.x - x, p.z - z)));
  const toPassing = (x: number, z: number) => Math.min(...passing.map((p) => Math.hypot(p.x - x, p.z - z)));
  // 海辺（z が STAGE2.seaFromZ より先）には、山・木を置かない
  const inSea = (z: number, margin: number) => z + margin > STAGE2.seaFromZ;
  const { platform } = STAGE2_SCENERY;

  const platforms = stations.map((at) => ({
    ...offsetOnTrack(track, at, platform.offset),
    heading: track.headingAt(at),
  }));

  // 山（線路の外と、輪の内側）。線路にかからない場所だけ
  const mountains: Mountain[] = [];
  for (let i = 0; i < 26; i++) {
    const inner = i < 3;
    const angle = (i / (inner ? 3 : 23)) * Math.PI * 2 + hash(i) * 0.4;
    const distance = inner ? 18 + hash(i + 50) * 14 : 150 + hash(i + 100) * 90;
    const radius = inner ? 16 + hash(i + 7) * 8 : 30 + hash(i + 200) * 30;
    const height = inner ? 16 + hash(i + 9) * 10 : 40 + hash(i + 300) * 50;
    const x = Math.cos(angle) * distance;
    const z = Math.sin(angle) * distance;
    if (toTrack(x, z) < radius + 10) continue;
    if (inSea(z, radius)) continue;
    mountains.push({ x, z, radius, height, rotation: hash(i + 400) * Math.PI });
  }

  // 木（線路の両側。線路とホームから離す）
  const spots: { x: number; z: number }[] = [];
  for (let i = 0; spots.length < STAGE2_SCENERY.treeCount && i < 600; i++) {
    const s = hash(i + 1000) * track.length;
    const side = hash(i + 2000) < 0.5 ? -1 : 1;
    const p = offsetOnTrack(track, s, side * (9 + hash(i + 3000) * 26));
    if (toTrack(p.x, p.z) < 8 || toPassing(p.x, p.z) < 6) continue;
    if (inSea(p.z, 3)) continue;
    if (platforms.some((q) => Math.hypot(q.x - p.x, q.z - p.z) < 12)) continue;
    spots.push({ x: p.x, z: p.z });
  }
  const trees = spots.map((p, i) => ({
    x: p.x,
    z: p.z,
    rotation: hash(i + 5000) * Math.PI * 2,
    scale: 0.85 + hash(i + 4000) * 0.4,
  }));

  return { mountains, trees, platforms };
};

/**
 * すれ違う電車の、線路の上の距離（m。NORI-59）。逆向きに STAGE2.passingSpeed で回る。時刻（tick）だけで決まる。
 * 位置は線路の左 STAGE2.passingOffset（offsetOnTrack で求める）
 */
export const passingTrainDistance = (trackLength: number, tick: number): number => {
  const d = STAGE2.passingStart - STAGE2.passingSpeed * tick * SIM.fixedDt;
  return ((d % trackLength) + trackLength) % trackLength;
};

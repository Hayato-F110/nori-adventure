// ステージ1の街の配置（建物と木）。純粋な関数：同じ設定 → 毎回まったく同じ街（docs/game-rules.md「建物と木」）。
// 当たり判定（physics.ts）と描画（render/city.ts）が、同じこの配置を使う。

export type Box = {
  /** 中心（上から見た位置） */
  x: number;
  z: number;
  halfWidth: number;
  halfDepth: number;
  height: number;
};

export type Tree = {
  x: number;
  z: number;
  /** 幹の当たり判定の半径 */
  radius: number;
};

export type Stage1Layout = {
  buildings: Box[];
  trees: Tree[];
};

export type LayoutConfig = {
  readonly boundsHalfSize: number;
  readonly roadSpacing: number;
  readonly roadWidth: number;
  readonly buildingMargin: number;
  readonly buildingMinSize: number;
  readonly buildingMaxSize: number;
  readonly buildingMinHeight: number;
  readonly buildingMaxHeight: number;
  readonly buildingsPerBlockMin: number;
  readonly buildingsPerBlockMax: number;
  readonly treeTrunkRadius: number;
};

/**
 * 整数のハッシュ → 0 以上 1 未満。区画の番号などから決まった値を作る（乱数は使わない）。
 * Math.imul とビット演算だけなので、どの環境でも同じ値になる（Math.sin は環境で差が出うる）。
 */
export const hash01 = (a: number, b: number, c: number): number => {
  let h = Math.imul(a + 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b + 0x632be5ab, 0xc2b2ae35);
  h = Math.imul(h ^ (c + 0x27d4eb2f), 0x165667b1);
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12;
  h = Math.imul(h, 0x297a2d39);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
};

/** 碁盤の目の道の中心線（走れる範囲の中に入るもの）。例：−80, −40, 0, 40, 80 */
export const roadLines = (config: LayoutConfig): number[] => {
  const { boundsHalfSize, roadSpacing } = config;
  const lines: number[] = [];
  for (let p = -boundsHalfSize + (boundsHalfSize % roadSpacing); p <= boundsHalfSize; p += roadSpacing) {
    lines.push(p);
  }
  return lines;
};

const lerp = (min: number, max: number, t: number): number => min + (max - min) * t;

export const createStage1Layout = (config: LayoutConfig): Stage1Layout => {
  const lines = roadLines(config);
  const buildings: Box[] = [];
  const trees: Tree[] = [];
  // 区画の中で建物を置ける正方形の1辺（道とすき間を除いた部分）
  const inner = config.roadSpacing - config.roadWidth - config.buildingMargin * 2;
  const countRange = config.buildingsPerBlockMax - config.buildingsPerBlockMin + 1;

  for (let i = 0; i < lines.length - 1; i++) {
    for (let j = 0; j < lines.length - 1; j++) {
      const x0 = (lines[i] ?? 0) + config.roadWidth / 2 + config.buildingMargin;
      const z0 = (lines[j] ?? 0) + config.roadWidth / 2 + config.buildingMargin;
      const count = config.buildingsPerBlockMin + Math.floor(hash01(i, j, 0) * countRange);
      // 建物は区画の四隅に1棟ずつ（最大4棟）。重ならず、中央に木の場所が残る
      for (let k = 0; k < count; k++) {
        const w = lerp(config.buildingMinSize, config.buildingMaxSize, hash01(i, j, 1 + k * 3));
        const d = lerp(config.buildingMinSize, config.buildingMaxSize, hash01(i, j, 2 + k * 3));
        const height = lerp(config.buildingMinHeight, config.buildingMaxHeight, hash01(i, j, 3 + k * 3));
        const right = k % 2 === 1;
        const far = k >= 2;
        buildings.push({
          x: x0 + (right ? inner - w / 2 : w / 2),
          z: z0 + (far ? inner - d / 2 : d / 2),
          halfWidth: w / 2,
          halfDepth: d / 2,
          height,
        });
      }
      trees.push({ x: x0 + inner / 2, z: z0 + inner / 2, radius: config.treeTrunkRadius });
    }
  }
  return { buildings, trees };
};

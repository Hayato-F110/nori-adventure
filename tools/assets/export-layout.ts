// 使い方：npm run layout:export
// ステージ1の街の配置と、ステージ2の線路・景色の配置を、コア（src/core）の関数から JSON に書き出す（NORI-56 の光のベイク・見た目の試作で Blender が読む）。
// 書き出し先はリポジトリの blender-work/assets/stage1-layout.json（.gitignore 済み。noriblender が読める場所）。
// 手で作らない：ゲームと Blender の配置が必ず一致するように、同じ関数を使う。
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { LOOK, STAGE1, STAGE2 } from "../../src/config/index.ts";
import { createStage1Layout, roadLines } from "../../src/core/stage1Layout.ts";
import { createStage2Scenery, STAGE2_SCENERY } from "../../src/core/stage2Layout.ts";
import { createTrack } from "../../src/core/track.ts";

const root = path.resolve(import.meta.dirname, "../..");
const out = process.env.NORI_LAYOUT_PATH ?? path.join(root, "blender-work/assets/stage1-layout.json");
const layout = createStage1Layout(STAGE1);
const data = {
  stage: STAGE1,
  look: { lightmapSize: LOOK.lightmapSize, aoDistance: LOOK.aoDistance, bakeSamples: LOOK.bakeSamples },
  roadLines: roadLines(STAGE1),
  buildings: layout.buildings,
  trees: layout.trees,
};
mkdirSync(path.dirname(out), { recursive: true });
writeFileSync(out, `${JSON.stringify(data, null, 1)}\n`);
console.info(
  `書き出しました：${path.relative(root, out)}（建物 ${layout.buildings.length}・木 ${layout.trees.length}）`,
);

// ステージ2（NORI-26）：線路を 1 m ごとに区切った点（高さ・向きつき）と、山・木・ホーム
const out2 = process.env.NORI_LAYOUT2_PATH ?? path.join(root, "blender-work/assets/stage2-layout.json");
const track = createTrack(STAGE2.trackPoints);
const scenery = createStage2Scenery(track, STAGE2.stations);
const step = track.length / Math.round(track.length);
const data2 = {
  look: {
    lightmapSize: LOOK.lightmapSize,
    aoDistance: LOOK.aoDistance,
    bakeSamples: LOOK.bakeSamples,
    bakeSize: LOOK.mountainBakeSize,
  },
  scenery: STAGE2_SCENERY,
  track: Array.from({ length: Math.round(track.length) }, (_, i) => {
    const p = track.pointAt(i * step);
    return { x: p.x, y: p.y, z: p.z, heading: track.headingAt(i * step) };
  }),
  ...scenery,
};
writeFileSync(
  out2,
  `${JSON.stringify(data2, null, 1)}
`,
);
console.info(
  `書き出しました：${path.relative(root, out2)}（線路の点 ${data2.track.length}・山 ${scenery.mountains.length}・木 ${scenery.trees.length}・ホーム ${scenery.platforms.length}）`,
);

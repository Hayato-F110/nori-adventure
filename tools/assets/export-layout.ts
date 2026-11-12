// 使い方：npm run layout:export
// ステージ1の街の配置と、ステージ2の線路・景色の配置を、コア（src/core）の関数から JSON に書き出す（NORI-56 の光のベイク・見た目の試作で Blender が読む）。
// 書き出し先はリポジトリの blender-work/assets/stage1-layout.json（.gitignore 済み。noriblender が読める場所）。
// 手で作らない：ゲームと Blender の配置が必ず一致するように、同じ関数を使う。
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { LOOK, STAGE1, STAGE2, STAGE3, STAGE4 } from "../../src/config/index.ts";
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

// ステージ3（空。NORI-27）：山（円すい。ゲームと同じ8角・向き i×0.7）と気球。値は設定（STAGE3）のまま
const out3 = process.env.NORI_LAYOUT3_PATH ?? path.join(root, "blender-work/assets/stage3-layout.json");
const data3 = {
  look: {
    lightmapSize: LOOK.lightmapSize,
    aoDistance: LOOK.skyAoDistance,
    bakeSamples: LOOK.bakeSamples,
    bakeSize: LOOK.skyBakeSize,
  },
  cones: STAGE3.mountains.map((m, i) => ({ ...m, sides: 8, rotation: i * 0.7 })),
  spheres: STAGE3.balloons.map((b) => ({ x: b.x, y: b.y, z: b.z, radius: b.radius })),
  boxes: [],
};
writeFileSync(out3, `${JSON.stringify(data3, null, 1)}\n`);
console.info(
  `書き出しました：${path.relative(root, out3)}（山 ${data3.cones.length}・気球 ${data3.spheres.length}）`,
);

// ステージ4（海。NORI-28）：岩（中心は海底。半分うまった球）と、たからばこ（箱）。高さは海底からの m
const out4 = process.env.NORI_LAYOUT4_PATH ?? path.join(root, "blender-work/assets/stage4-layout.json");
const seabed = STAGE4.maxDepth;
const data4 = {
  look: {
    lightmapSize: LOOK.lightmapSize,
    aoDistance: LOOK.aoDistance,
    bakeSamples: LOOK.bakeSamples,
    bakeSize: LOOK.seaBakeSize,
  },
  cones: [],
  spheres: STAGE4.rocks.map((r) => ({ x: r.x, y: 0, z: r.z, radius: r.radius })),
  // たからばこ：2.2 × 1.2 × 1.4 m（stage4View と同じ）。中心の深さ treasure.depth から底の高さを出す
  boxes: [
    {
      x: STAGE4.treasure.x,
      z: STAGE4.treasure.z,
      width: 2.2,
      length: 1.4,
      bottom: seabed - STAGE4.treasure.depth - 0.6,
      top: seabed - STAGE4.treasure.depth + 0.6,
    },
  ],
};
writeFileSync(out4, `${JSON.stringify(data4, null, 1)}\n`);
console.info(`書き出しました：${path.relative(root, out4)}（岩 ${data4.spheres.length}・たからばこ 1）`);

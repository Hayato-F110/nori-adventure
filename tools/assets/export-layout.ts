// 使い方：npm run layout:export
// ステージ1の街の配置を、コア（src/core）の関数から JSON に書き出す（NORI-56 の光のベイク・見た目の試作で Blender が読む）。
// 書き出し先はリポジトリの blender-work/assets/stage1-layout.json（.gitignore 済み。noriblender が読める場所）。
// 手で作らない：ゲームと Blender の配置が必ず一致するように、同じ関数を使う。
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { LOOK, STAGE1 } from "../../src/config/index.ts";
import { createStage1Layout, roadLines } from "../../src/core/stage1Layout.ts";

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

// NORI-77 一覧 1・2：E2E の共通の部品が 1 つのファイルにあり、写しが残っていない（docs/test-plans/NORI-77.md）
// ファイルの文字を読んで確かめる（E2E を流さない）
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(import.meta.dirname, "../..");
const e2e = path.join(root, "e2e");
const specs = readdirSync(e2e).filter((f) => f.endsWith(".spec.ts"));
const read = (f: string) => readFileSync(path.join(e2e, f), "utf8");

describe("一覧 1：共通の部品", () => {
  it("e2e/common.ts が watchErrors・chooseQuality・openStage・waitTicks・chooseTrain を export している", () => {
    const file = path.join(e2e, "common.ts");
    expect(existsSync(file)).toBe(true);
    const src = existsSync(file) ? readFileSync(file, "utf8") : "";
    for (const name of ["watchErrors", "chooseQuality", "openStage", "waitTicks", "chooseTrain"]) {
      expect(src, name).toMatch(new RegExp(`export (const|async function|function) ${name}\\b`));
    }
  });

  // common.ts が export する名前はすべて見る（部品を足したら、検査も自動で広がる。/code-review の 7）。
  // それに、前に写しで使われていた別の名前を足す
  const exported = [...read("common.ts").matchAll(/export (?:const|async function|function) (\w+)/g)].map(
    (m) => m[1] ?? "",
  );
  const NAMES = [...new Set([...exported, "collectErrors", "ready", "waitFrames"])];

  it("common.ts の export を読めている（読めないと、下の検査が何も見ない）", () => {
    expect(exported).toEqual(
      expect.arrayContaining(["watchErrors", "openStage", "waitTicks", "chooseTrain"]),
    );
  });

  it.each(specs)("%s：共通の部品を自分で定義していない（const・function の両方）", (f) => {
    const src = read(f);
    for (const name of NAMES) {
      expect(src, name).not.toMatch(new RegExp(`(const|let|function)\\s+${name}\\b`));
    }
  });

  it.each(specs)('%s：page.on("pageerror" を自分で書いていない', (f) => {
    expect(read(f)).not.toContain('page.on("pageerror"');
  });

  // 覆いそのものを確かめる start-cover.spec.ts は除く（R2-77-1）
  it.each(specs.filter((f) => f !== "start-cover.spec.ts"))("%s：覆いの待ちを自分で書いていない", (f) => {
    expect(read(f)).not.toMatch(/cover\??\.state === "gone"/);
  });

  // 画質の決まりそのものを確かめる quality.spec.ts・start-cover.spec.ts は除く（R2-77-8）
  it.each(specs.filter((f) => !["quality.spec.ts", "start-cover.spec.ts"].includes(f)))(
    "%s：画質の保存を自分で書いていない",
    (f) => {
      const src = read(f);
      expect(src).not.toContain("QUALITY_STORAGE_KEY");
      expect(src).not.toContain('"nori-adventure.quality"');
    },
  );
});

describe("一覧 2：ステージ1の見た目は CPU を遅くせず、実際の時間でカメラを待たない", () => {
  it("look.spec.ts に setCPUThrottlingRate と waitForTimeout(1500) がない（@fps は look-fps.spec.ts へ）", () => {
    const src = read("look.spec.ts");
    expect(src).not.toContain("setCPUThrottlingRate");
    expect(src).not.toContain("waitForTimeout(1500)");
    expect(existsSync(path.join(e2e, "look-fps.spec.ts"))).toBe(true);
  });
});

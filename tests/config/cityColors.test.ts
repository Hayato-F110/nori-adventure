// NORI-61：人・乗る人の服の色が、ほし・子どもの車と見まちがえない色か（docs/game-rules.md「服の色」）。
// 11/13 に黄 #F59E0B がほしと色相 8 度しか違わないことを、kids-ui-reviewer が見つけた。式で守らせる。
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { LOOK, TRAFFIC } from "../../src/config";

/** "#rrggbb" の色相（度） */
const hueOf = (hex: string): number => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as [number, number, number];
  const max = Math.max(r, g, b);
  const d = max - Math.min(r, g, b);
  if (d === 0) return 0;
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return (h * 60 + 360) % 360;
};
const hueGap = (a: string, b: string): number => {
  const d = Math.abs(hueOf(a) - hueOf(b)) % 360;
  return d > 180 ? 360 - d : d;
};

describe("服の色（TRAFFIC.shirtColors）", () => {
  it.each(TRAFFIC.shirtColors)(
    `%s は、ほし・ほしの光・子どもの車から色相が ${TRAFFIC.shirtMinHueGap} 度以上はなれる`,
    (color) => {
      for (const other of [LOOK.starColor, LOOK.starEmissive, TRAFFIC.childCarColor]) {
        expect(hueGap(color, other), `${color} と ${other}`).toBeGreaterThanOrEqual(TRAFFIC.shirtMinHueGap);
      }
    },
  );

  it("6色はすべて違う", () => {
    expect(new Set(TRAFFIC.shirtColors).size).toBe(TRAFFIC.shirtColors.length);
  });

  it("子どもの車の色（TRAFFIC.childCarColor）は、Blender で作る車の体の色（build-car.py の car_body）と同じ", () => {
    const script = readFileSync(
      path.resolve(import.meta.dirname, "../../tools/blender/build-car.py"),
      "utf8",
    );
    const match = /material\("car_body", srgb\(0x([0-9A-Fa-f]{6})\)/.exec(script);
    expect(match?.[1]?.toUpperCase()).toBe(TRAFFIC.childCarColor.slice(1).toUpperCase());
  });
});

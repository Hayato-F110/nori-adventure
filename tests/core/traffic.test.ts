// docs/game-rules.md「街をにぎやかに」（NORI-61）。一覧は docs/test-plans/NORI-61.md。
// 数値は TRAFFIC から読む（直書きしない）。
import { describe, expect, it } from "vitest";
import { SIM, TRAFFIC } from "../../src/config/index.ts";
import { createLoopPath } from "../../src/core/loopPath.ts";
import { createTrafficState, stepTraffic } from "../../src/core/traffic.ts";
import { wrapDistance } from "../../src/core/track.ts";

const path = createLoopPath(TRAFFIC.loop, TRAFFIC.laneOffset, TRAFFIC.cornerRadius);
const o = TRAFFIC.laneOffset;
const r = TRAFFIC.cornerRadius;
const [c0, c1, c2] = TRAFFIC.loop;
const width = c1.x - c0.x; // 中心線の四角の横（80）
const depth = c2.z - c1.z; // 縦（120）
/** 子どもの車が遠くにいる（止まる理由がない） */
const far = { x: 10000, z: 10000 };

const angleDiff = (a: number, b: number): number => Math.atan2(Math.sin(a - b), Math.cos(a - b));

// 一覧 1：車4台は四角い道の左 2.5 m を回り、角では半径 4 m の円弧で曲がる
describe("車の道（createLoopPath）", () => {
  it("1周の長さは、左へずらした四角の周 − 角を丸めた分（式 2×(85+125) − 8×4 + 2π×4 ≈ 413.13 m）", () => {
    const expected = 2 * (width + 2 * o + (depth + 2 * o)) - 8 * r + 2 * Math.PI * r;
    expect(path.length).toBeCloseTo(expected, 6);
    expect(path.length).toBeCloseTo(413.13, 2);
  });

  it("距離 0 は1つ目の角を曲がり終えた所で、+x を向く", () => {
    const p = path.pointAt(0);
    expect(p.x).toBeCloseTo(c0.x - o + r, 9);
    expect(p.z).toBeCloseTo(c0.z - o, 9);
    expect(angleDiff(path.headingAt(0), -Math.PI / 2)).toBeCloseTo(0, 9);
  });

  it("まっすぐな所は、中心線から進む向きの左へ 2.5 m（1辺目と2辺目の真ん中で確かめる）", () => {
    const straight0 = width + 2 * o - 2 * r;
    const arc = (Math.PI / 2) * r;
    const straight1 = depth + 2 * o - 2 * r;
    // 1辺目（+x へ進む。左は −z）の真ん中
    const a = path.pointAt(straight0 / 2);
    expect(a.x).toBeCloseTo((c0.x + c1.x) / 2, 9);
    expect(a.z).toBeCloseTo(c0.z - o, 9);
    // 2辺目（+z へ進む。左は +x）の真ん中
    const b = path.pointAt(straight0 + arc + straight1 / 2);
    expect(b.x).toBeCloseTo(c1.x + o, 9);
    expect(b.z).toBeCloseTo((c1.z + c2.z) / 2, 9);
    expect(angleDiff(path.headingAt(straight0 + arc + straight1 / 2), Math.PI)).toBeCloseTo(0, 9);
  });

  it("角は半径 4 m の円弧：0.05 m 進むごとに、位置は 0.05 m 以下、向きは 0.05 / 4 rad 以下しか変わらず、1周で向きが1回転する", () => {
    const step = 0.05;
    let turned = 0;
    for (let s = 0; s < path.length; s += step) {
      const p = path.pointAt(s);
      const q = path.pointAt(s + step);
      expect(Math.hypot(q.x - p.x, q.z - p.z)).toBeLessThanOrEqual(step + 1e-6);
      const d = angleDiff(path.headingAt(s + step), path.headingAt(s));
      expect(Math.abs(d)).toBeLessThanOrEqual(step / r + 1e-6);
      turned += d;
    }
    expect(Math.abs(turned)).toBeCloseTo(2 * Math.PI, 3);
  });

  it("輪をまたいでも同じ場所（距離 L と 0、−1 と L − 1）", () => {
    const a = path.pointAt(path.length + 12);
    const b = path.pointAt(12);
    expect(a.x).toBeCloseTo(b.x, 9);
    expect(a.z).toBeCloseTo(b.z, 9);
    const c = path.pointAt(-1);
    const d = path.pointAt(path.length - 1);
    expect(c.x).toBeCloseTo(d.x, 9);
    expect(c.z).toBeCloseTo(d.z, 9);
  });

  it("角の丸めが辺より長いと、作るときに止まる（気づかずにおかしな道にしない）", () => {
    expect(() => createLoopPath(TRAFFIC.loop, o, 50)).toThrow();
  });
});

// 一覧 2：始めの位置は 100 m おき。止まらなければ 6 m/s で、間は変わらない
describe("車の並びと速さ（stepTraffic）", () => {
  it("はじめは TRAFFIC.vehicles の start の位置に、6 m/s で並ぶ", () => {
    const state = createTrafficState(TRAFFIC);
    expect(state.vehicles.map((v) => v.s)).toEqual(TRAFFIC.vehicles.map((v) => v.start));
    for (const v of state.vehicles) expect(v.speed).toBe(TRAFFIC.speed);
  });

  it("子どもの車が遠ければ、10 秒（600 刻み）で 60 m 進み、間は変わらない", () => {
    let state = createTrafficState(TRAFFIC);
    const ticks = Math.round(10 / SIM.fixedDt);
    for (let i = 0; i < ticks; i++) state = stepTraffic(state, far, SIM.fixedDt, TRAFFIC, path);
    state.vehicles.forEach((v, i) => {
      const start = TRAFFIC.vehicles[i]?.start ?? 0;
      expect(wrapDistance(v.s - start, path.length)).toBeCloseTo(TRAFFIC.speed * 10, 6);
      expect(v.speed).toBe(TRAFFIC.speed);
    });
  });

  it("元の状態は書き換えない（同じ状態 → 同じ結果）", () => {
    const state = createTrafficState(TRAFFIC);
    const copy = JSON.stringify(state);
    const a = stepTraffic(state, far, SIM.fixedDt, TRAFFIC, path);
    const b = stepTraffic(state, far, SIM.fixedDt, TRAFFIC, path);
    expect(JSON.stringify(state)).toBe(copy);
    expect(a).toEqual(b);
  });
});

// docs/game-rules.md「街をにぎやかに」（NORI-61）。一覧は docs/test-plans/NORI-61.md。
// 数値は TRAFFIC から読む（直書きしない）。
import { describe, expect, it } from "vitest";
import { ASSET, SIM, TRAFFIC } from "../../src/config/index.ts";
import type { Point } from "../../src/core/course.ts";
import { createLoopPath } from "../../src/core/loopPath.ts";
import { createTraffic, type TrafficState } from "../../src/core/traffic.ts";
import { wrapDistance } from "../../src/core/track.ts";

const traffic = createTraffic(TRAFFIC, ASSET.city.sizes);
const path = createLoopPath(TRAFFIC.loop, TRAFFIC.laneOffset, TRAFFIC.cornerRadius);
const dt = SIM.fixedDt;
const run = (state: TrafficState, child: Point, ticks: number): TrafficState => {
  let s = state;
  for (let i = 0; i < ticks; i++) s = traffic.step(s, child, dt);
  return s;
};
const lengthOf = (i: number): number => ASSET.city.sizes[TRAFFIC.vehicles[i]?.model ?? "bus"].length;
/** 車 i の前の端から、前へ ahead m・左へ left m の点（車の向きのまっすぐな線で測る） */
const inFrontOf = (state: TrafficState, i: number, ahead: number, left = 0): Point => {
  const s = state.vehicles[i]?.s ?? 0;
  const p = path.pointAt(s);
  const h = path.headingAt(s);
  const f = { x: -Math.sin(h), z: -Math.cos(h) };
  const l = { x: f.z, z: -f.x };
  const d = lengthOf(i) / 2 + ahead;
  return { x: p.x + f.x * d + l.x * left, z: p.z + f.z * d + l.z * left };
};
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
describe("車の並びと速さ", () => {
  it("はじめは TRAFFIC.vehicles の start の位置に、6 m/s で並ぶ", () => {
    const state = traffic.initial();
    expect(state.vehicles.map((v) => v.s)).toEqual(TRAFFIC.vehicles.map((v) => v.start));
    for (const v of state.vehicles) expect(v.speed).toBe(TRAFFIC.speed);
  });

  it("子どもの車が遠ければ、10 秒（600 刻み）で 60 m 進み、間は変わらない", () => {
    const state = run(traffic.initial(), far, Math.round(10 / dt));
    state.vehicles.forEach((v, i) => {
      const start = TRAFFIC.vehicles[i]?.start ?? 0;
      expect(wrapDistance(v.s - start, path.length)).toBeCloseTo(TRAFFIC.speed * 10, 6);
      expect(v.speed).toBe(TRAFFIC.speed);
    });
  });

  it("車の道は、createLoopPath(TRAFFIC.loop, laneOffset, cornerRadius) と同じ", () => {
    expect(traffic.path.length).toBe(path.length);
  });

  it("元の状態は書き換えない（同じ状態 → 同じ結果）", () => {
    const state = traffic.initial();
    const copy = JSON.stringify(state);
    const a = traffic.step(state, far, dt);
    const b = traffic.step(state, far, dt);
    expect(JSON.stringify(state)).toBe(copy);
    expect(a).toEqual(b);
  });
});

// 一覧 3：前 10 m・左右 3 m に子どもの車があると 8 m/s² で止まる。いなくなると 3 m/s² で動き出す
describe("子どもの車の前で止まる", () => {
  const start = traffic.initial();
  const speed0 = (s: TrafficState): number => s.vehicles[0]?.speed ?? NaN;

  it("前の端から 5 m 先（範囲の中）なら、1刻みで 8 m/s² × 1/60 秒だけ遅くなる", () => {
    const next = traffic.step(start, inFrontOf(start, 0, 5), dt);
    expect(speed0(next)).toBeCloseTo(TRAFFIC.speed - TRAFFIC.braking * dt, 9);
  });

  it(`止まるまでに進むのは v² / 2a（${(TRAFFIC.speed ** 2 / (2 * TRAFFIC.braking)).toFixed(2)} m）＋1刻み以内。子どもの車の手前で止まる`, () => {
    const child = inFrontOf(start, 0, 5);
    const stopped = run(start, child, Math.round(2 / dt));
    expect(speed0(stopped)).toBe(0);
    const moved = wrapDistance((stopped.vehicles[0]?.s ?? 0) - (start.vehicles[0]?.s ?? 0), path.length);
    expect(moved).toBeLessThanOrEqual(TRAFFIC.speed ** 2 / (2 * TRAFFIC.braking) + TRAFFIC.speed * dt);
    expect(moved).toBeLessThan(5);
  });

  it.each([
    ["前の端より後ろ（横に並んだ）", -1, 0],
    [`前 ${TRAFFIC.stopAhead} m より先`, TRAFFIC.stopAhead + 0.5, 0],
    [`左へ ${TRAFFIC.stopSide} m より外`, 5, TRAFFIC.stopSide + 0.5],
    [`右へ ${TRAFFIC.stopSide} m より外`, 5, -(TRAFFIC.stopSide + 0.5)],
  ])("%s なら止まらない", (_, ahead, left) => {
    const next = traffic.step(start, inFrontOf(start, 0, ahead, left), dt);
    expect(speed0(next)).toBe(TRAFFIC.speed);
  });

  it(`範囲の端（前 ${TRAFFIC.stopAhead} m・左右 ${TRAFFIC.stopSide} m の内側）なら止まり始める`, () => {
    for (const left of [TRAFFIC.stopSide - 0.01, -(TRAFFIC.stopSide - 0.01)]) {
      const next = traffic.step(start, inFrontOf(start, 0, TRAFFIC.stopAhead - 0.01, left), dt);
      expect(speed0(next)).toBeLessThan(TRAFFIC.speed);
    }
  });

  it("子どもの車がいなくなると、3 m/s² で動き出す（1 秒で 3 m/s、2 秒で 6 m/s に戻る）", () => {
    const stopped = run(start, inFrontOf(start, 0, 5), Math.round(2 / dt));
    expect(speed0(run(stopped, far, Math.round(1 / dt)))).toBeCloseTo(TRAFFIC.acceleration * 1, 6);
    // ちょうど 2 秒で上限に届く（3 × 1/60 を 120 回足すと、小数の丸めで 6 よりわずかに小さい）
    expect(speed0(run(stopped, far, Math.round(2 / dt)))).toBeCloseTo(TRAFFIC.speed, 9);
    expect(speed0(run(stopped, far, Math.round(2.5 / dt)))).toBe(TRAFFIC.speed);
  });
});

// 一覧 4：前の車の後ろの端まで 4 m を切ったら止まる（前が止まれば後ろも止まる）
describe("前の車との間", () => {
  /** 車 1 を、車 0 の前の端から gap m 先に置き、止めておく */
  const withAhead = (gap: number): TrafficState => {
    const base = traffic.initial();
    const s0 = base.vehicles[0]?.s ?? 0;
    const s1 = s0 + lengthOf(0) / 2 + gap + lengthOf(1) / 2;
    return { ...base, vehicles: base.vehicles.map((v, i) => (i === 1 ? { s: s1, speed: 0 } : v)) };
  };

  it(`前の車の後ろの端まで ${TRAFFIC.followGap} m を切ると止まり始める`, () => {
    const next = traffic.step(withAhead(TRAFFIC.followGap - 0.01), far, dt);
    expect(next.vehicles[0]?.speed).toBeCloseTo(TRAFFIC.speed - TRAFFIC.braking * dt, 9);
  });

  it(`${TRAFFIC.followGap} m より離れていれば止まらない`, () => {
    const next = traffic.step(withAhead(TRAFFIC.followGap + 0.5), far, dt);
    expect(next.vehicles[0]?.speed).toBe(TRAFFIC.speed);
  });

  it("先頭の車を子どもの車で止めておくと、60 秒で4台とも止まり、どの間も重ならない", () => {
    const start = traffic.initial();
    const child = inFrontOf(start, 0, 5);
    let state = start;
    const order = [0, 1, 2, 3]; // s の小さい順。i の前は i+1（3 の前は 0）
    for (let t = 0; t < Math.round(60 / dt); t++) {
      state = traffic.step(state, child, dt);
      for (const i of order) {
        const j = (i + 1) % order.length;
        const gap =
          wrapDistance((state.vehicles[j]?.s ?? 0) - (state.vehicles[i]?.s ?? 0), path.length) -
          lengthOf(i) / 2 -
          lengthOf(j) / 2;
        expect(gap).toBeGreaterThan(0);
      }
    }
    for (const v of state.vehicles) expect(v.speed).toBe(0);
  });
});

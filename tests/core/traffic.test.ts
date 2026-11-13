// docs/game-rules.md「街をにぎやかに」（NORI-61）。一覧は docs/test-plans/NORI-61.md。
// 数値は TRAFFIC から読む（直書きしない）。
import { describe, expect, it } from "vitest";
import { ASSET, SIM, STAGE1, TRAFFIC } from "../../src/config/index.ts";
import { pointAlong, type Point } from "../../src/core/course.ts";
import { createLoopPath } from "../../src/core/loopPath.ts";
import { createTraffic, type TrafficState } from "../../src/core/traffic.ts";
import { wrapDistance } from "../../src/core/track.ts";

const traffic = createTraffic(TRAFFIC, ASSET.city.sizes, STAGE1.route);
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

// 一覧 5：自転車2台（4 m/s）・バイク2台（6 m/s）がコースの左 4 m を同じ向きに回る。子どもが 6 m 以内なら止まる。前との間 3 m で待つ
describe("自転車・バイク", () => {
  const bikePath = traffic.bikePath;
  const kinds = (state: TrafficState) => state.bikes.map((b) => b.kind);
  const bikeLength = (kind: "bicycle" | "motorbike"): number => ASSET.city.sizes[kind].length;

  it("道の1周は 425.13 m（式 2×(88+128) − 8×4 + 2π×4）。距離 0 はスタートの左 4 m で、コースと同じ向き（−z）", () => {
    const [p0, p1, p2] = [STAGE1.route[0], STAGE1.route[1], STAGE1.route[2]];
    const w = (p2?.x ?? 0) - (p1?.x ?? 0) + 2 * TRAFFIC.bikeOffset;
    const h = 120 + 2 * TRAFFIC.bikeOffset; // z −80〜40
    expect(bikePath.length).toBeCloseTo(2 * (w + h) - 8 * r + 2 * Math.PI * r, 6);
    expect(bikePath.length).toBeCloseTo(425.13, 2);
    const start = bikePath.pointAt(0);
    expect(start.x).toBeCloseTo((p0?.x ?? 0) - TRAFFIC.bikeOffset, 9);
    expect(start.z).toBeCloseTo(p0?.z ?? 0, 9);
    expect(angleDiff(bikePath.headingAt(0), 0)).toBeCloseTo(0, 9);
  });

  it("はじめは道の上に、自転車（0・200 m）とバイク（100・300 m）が交互に並ぶ", () => {
    const state = traffic.initial();
    expect(kinds(state)).toEqual(["bicycle", "motorbike", "bicycle", "motorbike"]);
    expect(state.bikes.map((b) => b.s)).toEqual([0, 100, 200, 300]);
  });

  it("子どもの車が遠ければ、自転車は 4 m/s、バイクは 6 m/s で進む（10 秒）", () => {
    const start = traffic.initial();
    const state = run(start, far, Math.round(10 / dt));
    state.bikes.forEach((b, i) => {
      const speed = b.kind === "bicycle" ? TRAFFIC.bicycles.speed : TRAFFIC.motorbikes.speed;
      expect(wrapDistance(b.s - (start.bikes[i]?.s ?? 0), bikePath.length)).toBeCloseTo(speed * 10, 6);
    });
  });

  it(`子どもの車の中心が ${TRAFFIC.bikeStopRadius} m 以内ならすぐ止まり、離れればすぐ元の速さで動く`, () => {
    const start = traffic.initial();
    const p = traffic.poses(start).bikes[1] as Point;
    const near = { x: p.x + TRAFFIC.bikeStopRadius - 0.01, z: p.z };
    const away = { x: p.x + TRAFFIC.bikeStopRadius + 0.5, z: p.z };
    const stopped = traffic.step(start, near, dt);
    expect(stopped.bikes[1]?.speed).toBe(0);
    expect(stopped.bikes[1]?.s).toBe(start.bikes[1]?.s);
    expect(traffic.step(stopped, away, dt).bikes[1]?.speed).toBe(TRAFFIC.motorbikes.speed);
  });

  it(`バイクが自転車に追いついたら、後ろの端まで ${TRAFFIC.bikeFollowGap} m の所で待ち、重ならない（120 秒）`, () => {
    let state = traffic.initial();
    let minGap = Infinity;
    for (let t = 0; t < Math.round(120 / dt); t++) {
      state = traffic.step(state, far, dt);
      state.bikes.forEach((b, i) => {
        const ahead = state.bikes[(i + 1) % state.bikes.length];
        if (!ahead) return;
        const gap =
          wrapDistance(ahead.s - b.s, bikePath.length) - bikeLength(b.kind) / 2 - bikeLength(ahead.kind) / 2;
        minGap = Math.min(minGap, gap);
      });
    }
    expect(minGap).toBeGreaterThan(TRAFFIC.bikeFollowGap - TRAFFIC.motorbikes.speed * dt - 1e-9);
  });

  it("まっすぐな所では、コースの中心線から進む向きの左へ 4 m（1辺目の真ん中）", () => {
    const p = bikePath.pointAt(40);
    expect(p.x).toBeCloseTo(-TRAFFIC.bikeOffset, 9);
    expect(p.z).toBeCloseTo(-40, 9);
  });
});

// 一覧 6：歩行者6人は区画の1辺 26 m の中を 1.2 m/s で行き来し、交差点を渡らない。子どもが 6 m 以内なら止まる
describe("歩行者", () => {
  const people = TRAFFIC.people;
  const margin = (people.blockLength - people.sideLength) / 2;

  it("人数と辺の数がそろい、辺の長さは道の間（STAGE1.roadSpacing）と同じ。0 番目の辺（スタート）にはいない", () => {
    expect(people.blockSides.length).toBe(people.count);
    expect(people.blockLength).toBe(STAGE1.roadSpacing);
    expect(people.blockSides).not.toContain(0);
  });

  it(`交差点を渡らない：歩く所は交差点の中心から ${margin} m あく（道の幅の半分 ${STAGE1.roadWidth / 2} m より外）`, () => {
    expect(margin).toBeGreaterThan(STAGE1.roadWidth / 2);
  });

  it(`道の中心から ${people.offset} m（左・右・左…と交互）の、辺の中の ${people.sideLength} m を行き来し、1刻みに 1.2 m/s × 1/60 秒より多くは動かない（120 秒）`, () => {
    const route = [...STAGE1.route, STAGE1.route[0] as Point];
    let state = traffic.initial();
    let prev = traffic.poses(state).people;
    const turned = new Array<number>(people.count).fill(0);
    for (let t = 0; t < Math.round(120 / dt); t++) {
      state = traffic.step(state, far, dt);
      const now = traffic.poses(state).people;
      now.forEach((p, k) => {
        const before = prev[k] as Point;
        expect(Math.hypot(p.x - before.x, p.z - before.z)).toBeLessThanOrEqual(TRAFFIC.walkSpeed * dt + 1e-9);
        // 辺の上の位置（コースの道すじへ下ろした点）と、道の中心からの距離
        const side = people.blockSides[k] ?? 0;
        const from = side * people.blockLength;
        const a = pointAlong(route, from);
        const b = pointAlong(route, from + people.blockLength);
        const len = Math.hypot(b.x - a.x, b.z - a.z);
        const dir = { x: (b.x - a.x) / len, z: (b.z - a.z) / len };
        const along = (p.x - a.x) * dir.x + (p.z - a.z) * dir.z;
        const left = (p.x - a.x) * dir.z - (p.z - a.z) * dir.x;
        expect(along).toBeGreaterThanOrEqual(margin - 1e-9);
        expect(along).toBeLessThanOrEqual(margin + people.sideLength + 1e-9);
        expect(left).toBeCloseTo(k % 2 === 0 ? people.offset : -people.offset, 9);
      });
      state.people.forEach((p, k) => {
        if (p.dir < 0) turned[k] = 1;
      });
      prev = now;
    }
    // 120 秒で 144 m 歩くので、どの人も端で向きを変えている
    expect(turned).toEqual(new Array<number>(people.count).fill(1));
  });

  it(`子どもの車の中心が ${TRAFFIC.walkStopRadius} m 以内なら止まり、離れれば歩き出す`, () => {
    const start = traffic.initial();
    const p = traffic.poses(start).people[0] as Point;
    const stopped = traffic.step(start, { x: p.x, z: p.z + TRAFFIC.walkStopRadius - 0.01 }, dt);
    expect(stopped.people[0]).toEqual(start.people[0]);
    const moved = traffic.step(stopped, { x: p.x, z: p.z + TRAFFIC.walkStopRadius + 0.5 }, dt);
    expect(moved.people[0]).not.toEqual(start.people[0]);
  });
});

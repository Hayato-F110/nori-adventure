// ステージ4：海を潜水艇で探検する（docs/game-rules.md「ステージ4」。NORI-28）。
// ステージ3と同じ操作：←→ で曲がる、↑ で上へ・↓ で下へ。速さはいつも一定。手を離すと、その深さで止まる。
// 純粋な関数：同じ状態・入力 → 同じ結果。元の状態は書き換えない。生きものの位置は時刻（tick）だけで決まる。
import { SIM, STAGE4, SUB } from "../config";
import type { InputFrame } from "./types";

export type SubState = {
  x: number;
  /** 高さ（m）。海面が 0、下が負（深さ 10 m なら −10） */
  y: number;
  z: number;
  /** 上から見た向き（0 のとき −Z。Pose2D と同じ） */
  heading: number;
  /** 見た目の機首の上下（rad。上が正。動きには使わない） */
  tilt: number;
  speed: number;
  /** 岩・海底に触れているか（当たった瞬間だけ遅くするため） */
  touching: boolean;
};

export type Stage4State = {
  tick: number;
  sub: SubState;
  /** 生きものごとに、見つけたか */
  found: boolean[];
  finishTick: number | null;
};

export type Point3 = { x: number; y: number; z: number };
/** たからばこへの手がかり（光るあわ）。bubbles はあわの数 */
export type Hint = Point3 & { bubbles: number };
export type Creature = (typeof STAGE4.creatures)[number];

export type Stage4Game = {
  readonly hints: readonly Hint[];
  readonly treasure: Point3;
  initial(): Stage4State;
  step(state: Stage4State, input: InputFrame): Stage4State;
};

const NO_INPUT: InputFrame = { throttle: 0, steer: 0 };
const SEABED = -STAGE4.maxDepth;
const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
/** value を target へ rate だけ近づける（行き過ぎない） */
const approach = (value: number, target: number, rate: number) =>
  Math.abs(target - value) <= rate ? target : value + Math.sign(target - value) * rate;

/** 生きものの、その時刻（tick）の位置と、泳ぐ向き（円に沿う） */
export const creaturePosition = (c: Creature, tick: number): Point3 & { heading: number } => {
  const a = c.phase + (2 * Math.PI * tick * SIM.fixedDt) / c.seconds;
  // 角度が増える向きに進む：接線 (−sin a, cos a)。heading は −Z が 0（atan2(−dx, −dz)）
  return {
    x: c.x + Math.cos(a) * c.radius,
    y: -c.depth,
    z: c.z + Math.sin(a) * c.radius,
    heading: Math.atan2(Math.sin(a), -Math.cos(a)),
  };
};

/** 手がかり：スタートからたからばこへ、左右に hintWave のゆるい波で。近いほどあわが多い */
export const createHints = (): Hint[] => {
  const n = STAGE4.hintCount;
  const s = STAGE4.start;
  const t = STAGE4.treasure;
  return Array.from({ length: n }, (_, i) => {
    const f = (i + 1) / (n + 1);
    return {
      x: s.x + (t.x - s.x) * f + STAGE4.hintWave * Math.sin(2 * Math.PI * f),
      y: -(s.depth + (t.depth - s.depth) * f),
      z: s.z + (t.z - s.z) * f,
      bubbles: STAGE4.hintBubbles + i,
    };
  });
};

/** 岩（海底の球）から押し出した位置と、触れていたか */
const collide = (p: Point3) => {
  const r = SUB.collisionRadius;
  let { x, y, z } = p;
  let hit = false;
  for (const rock of STAGE4.rocks) {
    const dx = x - rock.x;
    const dy = y - SEABED;
    const dz = z - rock.z;
    const d = Math.hypot(dx, dy, dz);
    const min = rock.radius + r;
    if (d < min) {
      // 球の外へ押し出す（真ん中にいたら上へ）
      const k = d > 1e-9 ? min / d : 0;
      x = d > 1e-9 ? rock.x + dx * k : x;
      y = d > 1e-9 ? SEABED + dy * k : SEABED + min;
      z = d > 1e-9 ? rock.z + dz * k : z;
      hit = true;
    }
  }
  // 海底：その上 collisionRadius まで
  if (y < SEABED + r) {
    y = SEABED + r;
    hit = true;
  }
  return { x, y, z, hit };
};

export const createStage4Game = (): Stage4Game => {
  const hints = createHints();
  const treasure: Point3 = { x: STAGE4.treasure.x, y: -STAGE4.treasure.depth, z: STAGE4.treasure.z };
  const dt = SIM.fixedDt;
  const limit = STAGE4.boundsHalfSize;

  return {
    hints,
    treasure,
    initial: () => ({
      tick: 0,
      sub: {
        x: STAGE4.start.x,
        y: -STAGE4.start.depth,
        z: STAGE4.start.z,
        heading: 0,
        tilt: 0,
        speed: SUB.cruiseSpeed,
        touching: false,
      },
      found: STAGE4.creatures.map(() => false),
      finishTick: null,
    }),
    step: (state, rawInput) => {
      const tick = state.tick + 1;
      const finished = state.finishTick !== null;
      const input = finished ? NO_INPUT : rawInput;
      const steer = clamp(input.steer, -1, 1);
      const throttle = clamp(input.throttle, -1, 1);
      const p = state.sub;

      // 右（steer が正）で heading が減る（車・飛行機と同じ向き）
      const heading = p.heading - SUB.turnRate * steer * dt;
      const tilt = approach(p.tilt, throttle * SUB.maxTilt, SUB.tiltRate * dt);
      // ゴールのあとは、ゆっくり止まる
      const speed0 = approach(p.speed, finished ? 0 : SUB.cruiseSpeed, SUB.speedChange * dt);

      const moved = {
        x: clamp(p.x - Math.sin(heading) * speed0 * dt, -limit, limit),
        y: Math.min(-SUB.minDepth, p.y + throttle * SUB.verticalSpeed * dt),
        z: clamp(p.z - Math.cos(heading) * speed0 * dt, -limit, limit),
      };
      const c = collide(moved);
      // 当たった瞬間だけ遅くする（止めない：minSpeed より遅くしない）
      const speed =
        c.hit && !p.touching && !finished ? Math.max(SUB.minSpeed, speed0 * SUB.bumpSpeedFactor) : speed0;
      const sub: SubState = {
        x: c.x,
        y: Math.min(-SUB.minDepth, c.y),
        z: c.z,
        heading,
        tilt,
        speed,
        touching: c.hit,
      };

      const found = state.found.map((done, i) => {
        const creature = STAGE4.creatures[i];
        if (done || creature === undefined) return done;
        const cp = creaturePosition(creature, tick);
        return Math.hypot(cp.x - sub.x, cp.y - sub.y, cp.z - sub.z) <= STAGE4.discoverRadius;
      });
      const reached =
        Math.hypot(treasure.x - sub.x, treasure.y - sub.y, treasure.z - sub.z) <= STAGE4.treasureRadius;
      const finishTick = state.finishTick ?? (reached ? tick : null);
      return { tick, sub, found, finishTick };
    },
  };
};

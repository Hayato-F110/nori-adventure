// ステージ3：空を飛行機で飛ぶ（docs/game-rules.md「ステージ3」。NORI-27）。
// ←→ で傾けて曲がる、↑ で上へ・↓ で下へ。手を離すと自動で水平に戻る（見える補助）。速さはいつも一定。
// 純粋な関数：同じ状態・入力 → 同じ結果。元の状態は書き換えない。当たり判定は円すい（山）と球（気球）の計算だけ。
import { PLANE, SIM, STAGE3 } from "../config";
import type { InputFrame } from "./types";

export type PlaneState = {
  x: number;
  /** 高さ（m） */
  y: number;
  z: number;
  /** 上から見た向き（0 のとき −Z。Pose2D と同じ） */
  heading: number;
  /** 上下の角度（rad。上が正） */
  pitch: number;
  /** 左右の傾き（rad。右が正） */
  bank: number;
  speed: number;
  /** 山・気球に触れているか（当たった瞬間だけ遅くするため） */
  touching: boolean;
};

export type Stage3State = {
  tick: number;
  plane: PlaneState;
  /** 輪ごとに、くぐったか */
  rings: boolean[];
  finishTick: number | null;
};

/** 輪（中心・向き・半径）。heading は輪をくぐる向き（円に沿って進む向き） */
export type Ring = { x: number; y: number; z: number; heading: number; radius: number };

export type Stage3Game = {
  readonly rings: readonly Ring[];
  readonly goal: Ring;
  initial(): Stage3State;
  step(state: Stage3State, input: InputFrame): Stage3State;
};

const NO_INPUT: InputFrame = { throttle: 0, steer: 0 };
const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
/** value を target へ rate だけ近づける（行き過ぎない） */
const approach = (value: number, target: number, rate: number) =>
  Math.abs(target - value) <= rate ? target : value + Math.sign(target - value) * rate;

/** 円の角度 a（rad）の点と、円に沿って進む向き */
const onCircle = (a: number, y: number, radius: number): Ring => ({
  x: Math.cos(a) * STAGE3.ringPathRadius,
  y,
  z: Math.sin(a) * STAGE3.ringPathRadius,
  heading: Math.PI - a,
  radius,
});

/** 輪10個とゴール：円の上に、ゴール（0°）から ringSpacing ずつ。高さはゆるい波 */
export const createRings = (): { rings: Ring[]; goal: Ring } => {
  const slots = STAGE3.ringCount + 1;
  const step = (2 * Math.PI) / slots;
  const rings = Array.from({ length: STAGE3.ringCount }, (_, k) => {
    const a = (k + 1) * step;
    return onCircle(a, STAGE3.ringBaseHeight + STAGE3.ringHeightWave * Math.sin(2 * a), STAGE3.ringRadius);
  });
  return { rings, goal: onCircle(0, STAGE3.ringBaseHeight, STAGE3.goalRingRadius) };
};

/** p0 → p1 の間に輪の面を通り抜け、その点が輪の中（半径以内）なら true。向きはどちらでもよい */
export const passesRing = (p0: PlaneState, p1: PlaneState, ring: Ring): boolean => {
  const nx = -Math.sin(ring.heading);
  const nz = -Math.cos(ring.heading);
  const d0 = (p0.x - ring.x) * nx + (p0.z - ring.z) * nz;
  const d1 = (p1.x - ring.x) * nx + (p1.z - ring.z) * nz;
  if (d0 === d1 || Math.sign(d0) === Math.sign(d1)) return false;
  const t = d0 / (d0 - d1);
  const qx = p0.x + (p1.x - p0.x) * t;
  const qy = p0.y + (p1.y - p0.y) * t;
  const qz = p0.z + (p1.z - p0.z) * t;
  return Math.hypot(qx - ring.x, qy - ring.y, qz - ring.z) <= ring.radius;
};

/** 山・気球から押し出した位置と、触れていたか */
const collide = (p: { x: number; y: number; z: number }) => {
  const r = PLANE.collisionRadius;
  let { x, y, z } = p;
  let hit = false;
  for (const m of STAGE3.mountains) {
    // 当たり判定の半径ぶん太らせた円すい。中に入ったら、その上の面まで上へ押し戻す
    const d = Math.hypot(x - m.x, z - m.z);
    const surface = m.height * (1 - Math.max(0, d - r) / m.radius);
    if (d < m.radius + r && y < surface) {
      y = surface;
      hit = true;
    }
  }
  for (const b of STAGE3.balloons) {
    const dx = x - b.x;
    const dy = y - b.y;
    const dz = z - b.z;
    const d = Math.hypot(dx, dy, dz);
    const min = b.radius + r;
    if (d < min) {
      // 球の外へ押し出す（真ん中にいたら上へ）
      const k = d > 1e-9 ? min / d : 0;
      x = d > 1e-9 ? b.x + dx * k : x;
      y = d > 1e-9 ? b.y + dy * k : b.y + min;
      z = d > 1e-9 ? b.z + dz * k : z;
      hit = true;
    }
  }
  return { x, y, z, hit };
};

export const createStage3Game = (): Stage3Game => {
  const { rings, goal } = createRings();
  const dt = SIM.fixedDt;
  const startAngle = STAGE3.startAfterGoal / STAGE3.ringPathRadius;
  const start = onCircle(startAngle, STAGE3.ringBaseHeight, 0);

  return {
    rings,
    goal,
    initial: () => ({
      tick: 0,
      plane: {
        x: start.x,
        y: start.y,
        z: start.z,
        heading: start.heading,
        pitch: 0,
        bank: 0,
        speed: PLANE.cruiseSpeed,
        touching: false,
      },
      rings: rings.map(() => false),
      finishTick: null,
    }),
    step: (state, rawInput) => {
      const tick = state.tick + 1;
      const input = state.finishTick === null ? rawInput : NO_INPUT;
      const steer = clamp(input.steer, -1, 1);
      const throttle = clamp(input.throttle, -1, 1);
      const p = state.plane;

      // 傾き・上下：入力があればその角度へ、手を離したら水平へ（autoLevelRate）
      const bank =
        steer === 0
          ? approach(p.bank, 0, PLANE.autoLevelRate * dt)
          : approach(p.bank, steer * PLANE.maxBank, PLANE.attitudeRate * dt);
      const pitch =
        throttle === 0
          ? approach(p.pitch, 0, PLANE.autoLevelRate * dt)
          : approach(p.pitch, throttle * PLANE.maxPitch, PLANE.attitudeRate * dt);
      // 曲がる速さは傾きに比例。右に傾くと heading が減る（車と同じ向き）
      const heading = p.heading - PLANE.maxTurnRate * (bank / PLANE.maxBank) * dt;
      const speed0 = approach(p.speed, PLANE.cruiseSpeed, PLANE.speedChange * dt);

      const cosP = Math.cos(pitch);
      const limit = STAGE3.boundsHalfSize;
      const moved = {
        x: clamp(p.x - Math.sin(heading) * cosP * speed0 * dt, -limit, limit),
        y: clamp(p.y + Math.sin(pitch) * speed0 * dt, PLANE.minAltitude, PLANE.maxAltitude),
        z: clamp(p.z - Math.cos(heading) * cosP * speed0 * dt, -limit, limit),
      };
      const c = collide(moved);
      // 当たった瞬間だけ遅くする（失速させない：minSpeed より遅くしない）
      const speed = c.hit && !p.touching ? Math.max(PLANE.minSpeed, speed0 * PLANE.bumpSpeedFactor) : speed0;
      const plane: PlaneState = {
        x: c.x,
        y: clamp(c.y, PLANE.minAltitude, PLANE.maxAltitude),
        z: c.z,
        heading,
        pitch,
        bank,
        speed,
        touching: c.hit,
      };

      const passed = state.rings.map((done, i) => done || passesRing(p, plane, rings[i] as Ring));
      const finishTick = state.finishTick ?? (passesRing(p, plane, goal) ? tick : null);
      return { tick, plane, rings: passed, finishTick };
    },
  };
};

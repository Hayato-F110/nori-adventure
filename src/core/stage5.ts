// ステージ5：月面をローバーで走り、ボスを「なかよしの星」で落ち着かせる（docs/game-rules.md「ステージ5」。NORI-29）。
// 走り方は車（stepCar）と同じ。ジャンプ台で自動で跳び、空中ではアクセル・ブレーキが効かない（速さはそのまま）。
// 純粋な関数：同じ状態・入力 → 同じ結果。元の状態は書き換えない。ボスと岩の位置は時刻（tick）だけで決まる
// （ローバーの場所にも、届けた回数にもよらない。隠れた補正を入れない）。
import { BOSS, CAR, RESPAWN, ROVER, SIM, STAGE5 } from "../config";
import { type CarConfig, stepCar } from "./car";
import {
  friendStarPositions,
  jumpPads,
  nearestPathD,
  pathHeading,
  pathPoint,
  starPositions,
} from "./stage5Layout";
import type { CarState, InputFrame } from "./types";

export type RoverState = CarState & {
  /** 地面からの高さ（m）。0 なら地面 */
  y: number;
  /** 上向きの速さ（m/s） */
  vy: number;
};

export type Stage5State = {
  tick: number;
  rover: RoverState;
  /** ほしごとに、取ったか（starPositions の順） */
  stars: boolean[];
  /** アクセルを入れているのに動けない刻みが、続いている数 */
  stuckTicks: number;
  /** 再開のあとの無敵の残りの刻み */
  invincibleTicks: number;
  respawns: number;
  /** ボスに届けた回数（0〜BOSS.calmPoints） */
  calm: number;
  /** なかよしの星を持っているか */
  carrying: boolean;
  /** なかよしの星ごとに、取った刻み（null ならまだ取っていない） */
  friendTakenTick: (number | null)[];
  /** 転がる岩に当たったあと、岩に当たらない残りの刻み */
  rockImmuneTicks: number;
  finishTick: number | null;
};

export type Stage5Game = {
  initial(): Stage5State;
  step(state: Stage5State, input: InputFrame): Stage5State;
};

const dt = SIM.fixedDt;
const NO_INPUT: InputFrame = { throttle: 0, steer: 0 };
const C = STAGE5.arenaCenter;
const ticks = (seconds: number) => Math.round(seconds / dt);
const STUCK_LIMIT = ticks(RESPAWN.stuckSeconds);
const ROCK_INTERVAL = ticks(BOSS.rockInterval);
/** 岩が出る所（広場の中心から）：ボスの円 ＋ ボスの半径 ＋ 岩の半径 */
const ROCK_START = BOSS.orbitRadius + BOSS.radius + BOSS.rockRadius;

const GROUND: CarConfig = {
  maxForwardSpeed: ROVER.maxForwardSpeed,
  maxReverseSpeed: ROVER.maxReverseSpeed,
  acceleration: ROVER.acceleration,
  brakeDeceleration: ROVER.brakeDeceleration,
  coastDeceleration: ROVER.coastDeceleration,
  maxTurnRate: ROVER.maxTurnRate,
  fullTurnSpeed: CAR.fullTurnSpeed,
  steerResponse: CAR.steerResponse,
};
/** 空中：曲がれるが、速さは変わらない */
const AIR: CarConfig = { ...GROUND, acceleration: 0, brakeDeceleration: 0, coastDeceleration: 0 };

/** ボスの、その刻みの位置と円の上の角度（最初は −Z 側。角度が増える＝上から見て時計回り） */
export const bossPosition = (tick: number): { x: number; z: number; angle: number } => {
  const angle = -Math.PI / 2 + (BOSS.moveSpeed / BOSS.orbitRadius) * tick * dt;
  return { x: C.x + Math.cos(angle) * BOSS.orbitRadius, z: C.z + Math.sin(angle) * BOSS.orbitRadius, angle };
};

/** 状態のときのボス（落ち着いたら、その刻みで止まる） */
export const bossAt = (state: Stage5State) => bossPosition(state.finishTick ?? state.tick);

/** その刻みに転がっている岩（落ち着いたら、ない） */
export const rocksAt = (state: Stage5State): { x: number; z: number }[] => {
  if (state.finishTick !== null) return [];
  const rocks: { x: number; z: number }[] = [];
  for (let k = Math.floor(state.tick / ROCK_INTERVAL); k >= 1; k--) {
    const launch = k * ROCK_INTERVAL;
    const r = ROCK_START + BOSS.rockSpeed * (state.tick - launch) * dt;
    if (r > STAGE5.arenaRadius + 1e-9) break; // これより前の岩は、もう消えている
    const a = bossPosition(launch).angle;
    rocks.push({ x: C.x + Math.cos(a) * r, z: C.z + Math.sin(a) * r });
  }
  return rocks;
};

/** なかよしの星 i が、今取れるか（取ってから friendStarRespawnSeconds たつと出直す） */
export const friendAvailable = (state: Stage5State, i: number): boolean => {
  const taken = state.friendTakenTick[i];
  return taken === null || taken === undefined || state.tick - taken >= ticks(BOSS.friendStarRespawnSeconds);
};

type Circle = { x: number; z: number; radius: number; height: number };

/** 動かない物（景色の岩・ボス）から外へ押し出す。空中でものの高さ以上なら当たらない */
const pushOut = (rover: RoverState, circles: readonly Circle[]) => {
  let { x, z } = rover;
  let hit = false;
  for (const c of circles) {
    if (rover.y >= c.height) continue;
    const dx = x - c.x;
    const dz = z - c.z;
    const d = Math.hypot(dx, dz);
    const min = c.radius + ROVER.collisionRadius;
    if (d < min) {
      // 真ん中にいたら +Z へ
      x = d > 1e-9 ? c.x + (dx / d) * min : c.x;
      z = d > 1e-9 ? c.z + (dz / d) * min : c.z + min;
      hit = true;
    }
  }
  return { x, z, hit };
};

const SCENERY: Circle[] = STAGE5.rocks.map((r) => ({ x: r.x, z: r.z, radius: r.radius, height: r.radius }));

export const createStage5Game = (): Stage5Game => {
  const pads = jumpPads();
  const stars = starPositions();
  const friends = friendStarPositions();

  return {
    initial: () => ({
      tick: 0,
      rover: {
        x: STAGE5.start.x,
        z: STAGE5.start.z,
        heading: 0,
        speed: 0,
        steer: 0,
        touching: false,
        y: 0,
        vy: 0,
      },
      stars: stars.map(() => false),
      stuckTicks: 0,
      invincibleTicks: 0,
      respawns: 0,
      calm: 0,
      carrying: false,
      friendTakenTick: friends.map(() => null),
      rockImmuneTicks: 0,
      finishTick: null,
    }),

    step: (state, rawInput) => {
      const tick = state.tick + 1;
      const finished = state.finishTick !== null;
      const input = finished ? NO_INPUT : rawInput;
      const prev = state.rover;
      const airborne = prev.y > 0 || prev.vy > 0;

      // 1. 地面の上の動き（車と同じ）。空中は速さを変えない
      const moved = stepCar(prev, input, dt, airborne ? AIR : GROUND, STAGE5);

      // 2. 高さ（放物線。刻みの中は等加速度で、ずれがたまらない）
      let y = prev.y;
      let vy = prev.vy;
      if (airborne) {
        y = prev.y + prev.vy * dt - 0.5 * ROVER.gravity * dt * dt;
        vy = prev.vy - ROVER.gravity * dt;
        if (y <= 0) {
          y = 0;
          vy = 0;
        }
      } else if (
        moved.speed >= ROVER.jumpMinSpeed &&
        pads.some((p) => Math.hypot(moved.x - p.x, moved.z - p.z) <= STAGE5.jumpPadRadius)
      ) {
        vy = ROVER.jumpSpeed;
      }
      let rover: RoverState = { ...moved, y, vy };

      // 3. 景色の岩・ボスに当たったら外へ押し戻し、当たった瞬間だけ遅くする（再開のあとの無敵の間は当たらない）
      const invincible = state.invincibleTicks > 0;
      const boss = bossPosition(finished ? (state.finishTick ?? tick) : tick);
      if (!invincible) {
        const c = pushOut(rover, [
          ...SCENERY,
          { x: boss.x, z: boss.z, radius: BOSS.radius, height: BOSS.height },
        ]);
        const speed = c.hit && !prev.touching ? rover.speed * ROVER.bumpSpeedFactor : rover.speed;
        rover = { ...rover, x: c.x, z: c.z, speed, touching: c.hit };
      } else {
        rover = { ...rover, touching: false };
      }

      // 4. 転がる岩：当たったら遅くするだけ（星は落とさない）。そのあと rockInvincibleSeconds は当たらない
      let rockImmuneTicks = Math.max(0, state.rockImmuneTicks - 1);
      const rolling = rocksAt({ ...state, tick });
      const rockHit =
        !invincible &&
        state.rockImmuneTicks === 0 &&
        rover.y < 2 * BOSS.rockRadius &&
        rolling.some(
          (r) => Math.hypot(rover.x - r.x, rover.z - r.z) < BOSS.rockRadius + ROVER.collisionRadius,
        );
      if (rockHit) {
        rover = { ...rover, speed: rover.speed * BOSS.rockBumpSpeedFactor };
        rockImmuneTicks = ticks(BOSS.rockInvincibleSeconds);
      }

      // 5. はまったとき：アクセルを入れているのに動けなければ、道すじのいちばん近い点から再開
      const pushing = Math.abs(input.throttle) >= RESPAWN.stuckThrottle;
      const step = Math.hypot(rover.x - prev.x, rover.z - prev.z);
      const stuckTicks =
        pushing && rover.y === 0 && step < RESPAWN.stuckSpeed * dt ? state.stuckTicks + 1 : 0;
      let respawns = state.respawns;
      let invincibleTicks = Math.max(0, state.invincibleTicks - 1);
      if (stuckTicks >= STUCK_LIMIT) {
        const d = nearestPathD(rover.x, rover.z);
        const p = pathPoint(d);
        rover = { x: p.x, z: p.z, heading: pathHeading(d), speed: 0, steer: 0, touching: false, y: 0, vy: 0 };
        respawns += 1;
        invincibleTicks = ticks(RESPAWN.invincibleSeconds);
      }

      // 6. ほし（高さも含めた距離）
      const near = (p: { x: number; y: number; z: number }) =>
        Math.hypot(p.x - rover.x, p.y - rover.y, p.z - rover.z) <= STAGE5.starRadius;
      const nextStars = state.stars.map((done, i) => {
        const s = stars[i];
        return done || (s !== undefined && near(s));
      });

      // 7. なかよしの星：持っていなければ、取れる星を1つ取る
      let carrying = state.carrying;
      const friendTakenTick = [...state.friendTakenTick];
      const now = { ...state, tick };
      if (!carrying && !finished) {
        const i = friends.findIndex((f, k) => friendAvailable(now, k) && near(f));
        if (i >= 0) {
          carrying = true;
          friendTakenTick[i] = tick;
        }
      }

      // 8. 届ける：持ってボスの中心から deliverRadius 以内
      let calm = state.calm;
      let finishTick = state.finishTick;
      if (carrying && !finished && Math.hypot(rover.x - boss.x, rover.z - boss.z) <= BOSS.deliverRadius) {
        carrying = false;
        calm += 1;
        if (calm >= BOSS.calmPoints) finishTick = tick;
      }

      return {
        tick,
        rover,
        stars: nextStars,
        stuckTicks: stuckTicks >= STUCK_LIMIT ? 0 : stuckTicks,
        invincibleTicks,
        respawns,
        calm,
        carrying,
        friendTakenTick,
        rockImmuneTicks,
        finishTick,
      };
    },
  };
};

// 車の動き（ステージ1）。数値はすべて引数の設定から受け取る（docs/game-rules.md）。
// 純粋な関数：同じ状態・入力・刻み → 同じ結果。元の状態は書き換えない。
import type { CarState, InputFrame, Pose2D } from "./types";

export type CarConfig = {
  readonly maxForwardSpeed: number;
  readonly maxReverseSpeed: number;
  readonly acceleration: number;
  readonly brakeDeceleration: number;
  readonly coastDeceleration: number;
  readonly maxTurnRate: number;
  readonly fullTurnSpeed: number;
  readonly steerResponse: number;
};

export type BoundsConfig = {
  readonly boundsHalfSize: number;
};

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

export const createCarState = (start: Pose2D): CarState => ({
  x: start.x,
  z: start.z,
  heading: start.heading,
  speed: 0,
  steer: 0,
  touching: false,
});

/** 0 に向かって amount だけ近づける（行き過ぎない） */
const approachZero = (value: number, amount: number): number =>
  Math.abs(value) <= amount ? 0 : value - Math.sign(value) * amount;

/** 速さの変わり方（加速・ブレーキ・惰性）。車と列車で同じ決まりを使う */
export type SpeedConfig = Pick<CarConfig, "acceleration" | "brakeDeceleration" | "coastDeceleration">;

/** 次の刻みの速さ（上限で切る前）。throttle は -1〜1 */
export const nextSpeed = (speed: number, throttle: number, dt: number, car: SpeedConfig): number => {
  if (throttle === 0) return approachZero(speed, car.coastDeceleration * dt);
  // 進んでいる向きと逆に入力したらブレーキ。ブレーキで 0 を越えたら、そこで止める
  const braking = speed !== 0 && Math.sign(speed) !== Math.sign(throttle);
  if (braking) return approachZero(speed, car.brakeDeceleration * Math.abs(throttle) * dt);
  return speed + car.acceleration * throttle * dt;
};

export const stepCar = (
  state: CarState,
  input: InputFrame,
  dt: number,
  car: CarConfig,
  bounds: BoundsConfig,
): CarState => {
  const throttle = clamp(input.throttle, -1, 1);
  const steerInput = clamp(input.steer, -1, 1);

  const steer = state.steer + (steerInput - state.steer) * Math.min(1, car.steerResponse * dt);
  let speed = clamp(nextSpeed(state.speed, throttle, dt, car), -car.maxReverseSpeed, car.maxForwardSpeed);

  // 遅いときは曲がりにくい（止まっていればその場で回らない）。後退中は逆に曲がる
  const turnFactor = Math.min(1, Math.abs(speed) / car.fullTurnSpeed);
  const heading = state.heading - steer * car.maxTurnRate * turnFactor * Math.sign(speed) * dt;

  const forwardX = -Math.sin(heading);
  const forwardZ = -Math.cos(heading);
  let x = state.x + forwardX * speed * dt;
  let z = state.z + forwardZ * speed * dt;

  // 見えない柵：外に出たら内側に戻す。柵に沿う向きの成分ぶんだけ速度の上限を残す（正面なら止まる）
  const limit = bounds.boundsHalfSize;
  if (Math.abs(x) > limit) {
    x = clamp(x, -limit, limit);
    speed = limitAlongWall(speed, Math.abs(forwardZ), car);
  }
  if (Math.abs(z) > limit) {
    z = clamp(z, -limit, limit);
    speed = limitAlongWall(speed, Math.abs(forwardX), car);
  }

  // 建物・木との当たり判定は physics.ts が行う。ここでは前の値をそのまま渡す
  return { x, z, heading, speed, steer, touching: state.touching };
};

const limitAlongWall = (speed: number, alongWall: number, car: CarConfig): number =>
  clamp(speed, -car.maxReverseSpeed * alongWall, car.maxForwardSpeed * alongWall);

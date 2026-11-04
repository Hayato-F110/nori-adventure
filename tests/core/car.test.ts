import { describe, expect, it } from "vitest";
import { CAR, SIM, STAGE1 } from "../../src/config";
import { createCarState, stepCar } from "../../src/core/car";
import type { CarState, InputFrame } from "../../src/core/types";

const dt = SIM.fixedDt;
const NEUTRAL: InputFrame = { throttle: 0, steer: 0 };
const GAS: InputFrame = { throttle: 1, steer: 0 };

const run = (state: CarState, input: InputFrame, seconds: number): CarState => {
  let current = state;
  for (let i = 0; i < Math.round(seconds / dt); i++) current = stepCar(current, input, dt, CAR, STAGE1);
  return current;
};

describe("車：加速と減速（game-rules.md ステージ1）", () => {
  it("アクセルを踏み続けると、約2秒で最高速度になり、それを超えない", () => {
    const after1s = run(createCarState(STAGE1.start), GAS, 1);
    expect(after1s.speed).toBeCloseTo(CAR.acceleration * 1, 1);
    const after5s = run(after1s, GAS, 4);
    expect(after5s.speed).toBe(CAR.maxForwardSpeed);
  });

  it("スタート時は −Z 方向へ進む", () => {
    const moved = run(createCarState(STAGE1.start), GAS, 1);
    expect(moved.z).toBeLessThan(-1);
    expect(Math.abs(moved.x)).toBeLessThan(1e-9);
  });

  it("手を離すと、最高速度から約3秒で止まり、後ろには進まない", () => {
    const fast = run(createCarState(STAGE1.start), GAS, 3);
    const stopped = run(fast, NEUTRAL, CAR.maxForwardSpeed / CAR.coastDeceleration + 0.1);
    expect(stopped.speed).toBe(0);
  });

  it("逆向きに入力するとブレーキがかかり、加速より速く止まる", () => {
    const fast = run(createCarState(STAGE1.start), GAS, 3);
    const braked = run(fast, { throttle: -1, steer: 0 }, CAR.maxForwardSpeed / CAR.brakeDeceleration);
    expect(braked.speed).toBeLessThanOrEqual(0.25);
  });

  it("止まってから下を入力すると後退し、後退の最高速度を超えない", () => {
    const back = run(createCarState(STAGE1.start), { throttle: -1, steer: 0 }, 5);
    expect(back.speed).toBe(-CAR.maxReverseSpeed);
  });
});

describe("車：ハンドル", () => {
  it("止まっているときは、ハンドルを切ってもその場で回らない", () => {
    const turned = run(createCarState(STAGE1.start), { throttle: 0, steer: 1 }, 2);
    expect(turned.heading).toBe(STAGE1.start.heading);
  });

  it("前進中に左へ切ると heading が増え、右へ切ると減る", () => {
    const moving = run(createCarState(STAGE1.start), GAS, 2);
    expect(run(moving, { throttle: 1, steer: -1 }, 0.5).heading).toBeGreaterThan(moving.heading);
    expect(run(moving, { throttle: 1, steer: 1 }, 0.5).heading).toBeLessThan(moving.heading);
  });

  it("後退中はハンドルが逆向きに効く", () => {
    const backing = run(createCarState(STAGE1.start), { throttle: -1, steer: 0 }, 2);
    expect(run(backing, { throttle: -1, steer: -1 }, 0.5).heading).toBeLessThan(backing.heading);
  });

  it("曲がる速さは最大の曲がり速さを超えない", () => {
    const moving = run(createCarState(STAGE1.start), GAS, 3);
    const turned = run(moving, { throttle: 1, steer: -1 }, 1);
    expect(turned.heading - moving.heading).toBeLessThanOrEqual(CAR.maxTurnRate * 1 + 1e-9);
  });

  it("ハンドルは急に最大にならず、少しずつ効く", () => {
    const moving = run(createCarState(STAGE1.start), GAS, 3);
    const oneStep = stepCar(moving, { throttle: 1, steer: 1 }, dt, CAR, STAGE1);
    expect(oneStep.steer).toBeGreaterThan(0);
    expect(oneStep.steer).toBeLessThan(0.2);
  });
});

describe("車：見えない柵（罰なし）", () => {
  it("柵の外には出ず、ずっと押しても止まるだけ", () => {
    const start = { x: 0, z: -STAGE1.boundsHalfSize + 2, heading: 0 };
    const pushed = run(createCarState(start), GAS, 5);
    expect(pushed.z).toBeGreaterThanOrEqual(-STAGE1.boundsHalfSize);
    expect(Math.abs(pushed.speed)).toBeLessThan(1e-9);
  });

  it("柵にななめに当たると、柵に沿って進む", () => {
    const start = { x: 0, z: -STAGE1.boundsHalfSize + 1, heading: Math.PI / 4 }; // 左前（−X・−Z）へ
    const slid = run(createCarState(start), GAS, 2);
    expect(slid.z).toBeGreaterThanOrEqual(-STAGE1.boundsHalfSize);
    expect(slid.x).toBeLessThan(-3);
  });
});

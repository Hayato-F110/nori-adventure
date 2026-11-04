// 固定刻みのループ。描画のフレーム間隔（ばらつく）とシミュレーションの刻み（一定）を切り離す。

export type AdvanceResult = {
  /** このフレームで進めた刻みの数 */
  steps: number;
  /** 前の刻みと次の刻みの間のどこにいるか（0〜1）。描画の補間に使う */
  alpha: number;
};

// 浮動小数の誤差で、ちょうど1刻み分の時間が「わずかに足りない」と判定されるのを防ぐ
const EPSILON = 1e-9;

export const createFixedStepper = (fixedDt: number, maxStepsPerFrame: number) => {
  let accumulator = 0;
  return {
    advance(frameSeconds: number, step: () => void): AdvanceResult {
      accumulator += Math.max(0, frameSeconds);
      let steps = 0;
      while (accumulator + EPSILON >= fixedDt && steps < maxStepsPerFrame) {
        step();
        accumulator -= fixedDt;
        steps++;
      }
      // 上限で打ち切ったときは、残りの時間を捨てる（裏から戻ったときに早送りしない）
      if (steps === maxStepsPerFrame) accumulator = Math.min(accumulator, fixedDt);
      return { steps, alpha: Math.min(1, Math.max(0, accumulator / fixedDt)) };
    },
  };
};

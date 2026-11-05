// ゲーム状態の型。Three.js や DOM に依存しない。JSON にそのまま保存できる形だけを使う。

/** 1刻み（1/60秒）分の入力。キーボード・タッチ・ゲームパッドは、すべてこの形に変換する */
export type InputFrame = {
  /** -1（後ろ）〜 1（前） */
  throttle: number;
  /** -1（左）〜 1（右） */
  steer: number;
};

/** 上から見た位置と向き。heading は +Y 軸まわりの角度で、0 のとき −Z を向く */
export type Pose2D = {
  x: number;
  z: number;
  heading: number;
};

export type CarState = Pose2D & {
  /** 進行方向の速度（m/s）。後退は負 */
  speed: number;
  /** 実際に効いているハンドル（-1〜1）。入力に少しずつ近づく */
  steer: number;
  /** 建物・木に触れているか。当たった瞬間（false → true）だけ減速するために覚えておく */
  touching: boolean;
};

export type GameState = {
  /** 進めた刻みの数 */
  tick: number;
  car: CarState;
};

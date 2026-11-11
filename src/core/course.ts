// ステージ1のコース：ほし・チェックポイント・ゴール（docs/game-rules.md「コース」「コースの道すじ」。NORI-25）。
// 純粋な関数だけ。同じ状態・位置 → 同じ結果。元の状態は書き換えない。

export type Point = { readonly x: number; readonly z: number };

export type CourseState = {
  /** ほしごとに、取ったか（順番は starPositions と同じ） */
  stars: boolean[];
  /** 次に通るチェックポイントの番号（0 から）。checkpointCount になったら、次はゴール */
  nextCheckpoint: number;
  /** ゴールを通った刻み（まだなら null） */
  finishTick: number | null;
};

export type CourseConfig = {
  readonly route: readonly Point[];
  readonly starCount: number;
  readonly starStart: number;
  readonly starSpacing: number;
  readonly starPickupRadius: number;
  readonly checkpointCount: number;
  readonly checkpointRadius: number;
};

export const createCourseState = (starCount: number): CourseState => ({
  stars: Array.from({ length: starCount }, () => false),
  nextCheckpoint: 0,
  finishTick: null,
});

export const routeLength = (route: readonly Point[]): number =>
  route.slice(1).reduce((sum, p, i) => {
    const q = route[i] as Point;
    return sum + Math.hypot(p.x - q.x, p.z - q.z);
  }, 0);

/** 道すじの最初から distance m 進んだ点（最後の点より先は、最後の点） */
export const pointAlong = (route: readonly Point[], distance: number): Point => {
  let left = distance;
  for (let i = 1; i < route.length; i++) {
    const a = route[i - 1] as Point;
    const b = route[i] as Point;
    const length = Math.hypot(b.x - a.x, b.z - a.z);
    if (left <= length) {
      const t = length > 0 ? left / length : 0;
      return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t };
    }
    left -= length;
  }
  const last = route[route.length - 1] ?? { x: 0, z: 0 };
  return { x: last.x, z: last.z };
};

/** ほしの場所：道すじの最初から start m、そこから spacing m おき */
export const starPositions = (
  route: readonly Point[],
  count: number,
  start: number,
  spacing: number,
): Point[] => Array.from({ length: count }, (_, i) => pointAlong(route, start + spacing * i));

/** from から to を向く heading（heading 0 のとき −Z を向く。左回りが正） */
export const headingToward = (from: Point, to: Point): number =>
  Math.atan2(-(to.x - from.x), -(to.z - from.z));

/** 次の行き先（チェックポイント、全部通ったあとはゴール） */
export const nextTarget = (course: CourseState, config: CourseConfig): Point =>
  config.route[Math.min(config.route.length - 1, course.nextCheckpoint + 1)] ?? { x: 0, z: 0 };

/**
 * 復活の位置：今向かっている区間（最後に通った門、なければスタート 〜 次の行き先）の道の中心線で、
 * car に一番近い点。向きは次の行き先（11/11 にオーナーが変更）
 */
export const respawnPose = (course: CourseState, config: CourseConfig, car: Point) => {
  const from = config.route[Math.min(course.nextCheckpoint, config.route.length - 1)] ?? { x: 0, z: 0 };
  const to = nextTarget(course, config);
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const lengthSq = dx * dx + dz * dz;
  const t =
    lengthSq > 0 ? Math.max(0, Math.min(1, ((car.x - from.x) * dx + (car.z - from.z) * dz) / lengthSq)) : 0;
  const at = { x: from.x + dx * t, z: from.z + dz * t };
  return { x: at.x, z: at.z, heading: headingToward(from, to) };
};

const near = (a: Point, b: Point, radius: number) => Math.hypot(a.x - b.x, a.z - b.z) <= radius;

/** 車の位置で、ほしを取り、チェックポイント・ゴールを進める */
export const stepCourse = (
  course: CourseState,
  car: Point,
  tick: number,
  config: CourseConfig,
  stars: readonly Point[] = starPositions(
    config.route,
    config.starCount,
    config.starStart,
    config.starSpacing,
  ),
): CourseState => {
  const collected = course.stars.map((got, i) => got || near(car, stars[i] ?? car, config.starPickupRadius));
  let { nextCheckpoint, finishTick } = course;
  if (finishTick === null && near(car, nextTarget(course, config), config.checkpointRadius)) {
    if (nextCheckpoint < config.checkpointCount) nextCheckpoint += 1;
    else finishTick = tick;
  }
  return { stars: collected, nextCheckpoint, finishTick };
};

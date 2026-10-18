import { VIEW_WIDTH } from './constants';

export interface Vec {
  x: number;
  y: number;
}

/** 곡선을 잘게 샘플링한 꺾은선. 누적 길이로 등속 이동한다. */
export interface Path {
  points: Vec[];
  cumulative: number[];
  length: number;
}

function catmullRom(p0: Vec, p1: Vec, p2: Vec, p3: Vec, t: number): Vec {
  const t2 = t * t;
  const t3 = t2 * t;
  const f = (a: number, b: number, c: number, d: number) =>
    0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
  return { x: f(p0.x, p1.x, p2.x, p3.x), y: f(p0.y, p1.y, p2.y, p3.y) };
}

/** 제어점을 모두 지나는 부드러운 곡선(캣멀-롬)을 만든다 */
export function buildPath(controls: Vec[], samplesPerSegment = 16): Path {
  const points: Vec[] = [controls[0]];
  for (let i = 0; i < controls.length - 1; i++) {
    const p0 = controls[Math.max(0, i - 1)];
    const p3 = controls[Math.min(controls.length - 1, i + 2)];
    for (let s = 1; s <= samplesPerSegment; s++) {
      points.push(catmullRom(p0, controls[i], controls[i + 1], p3, s / samplesPerSegment));
    }
  }
  const cumulative = [0];
  for (let i = 1; i < points.length; i++) {
    cumulative.push(cumulative[i - 1] + Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y));
  }
  return { points, cumulative, length: cumulative[cumulative.length - 1] };
}

/** 시작점에서 distance만큼 이동한 위치와 진행 방향(라디안, 위쪽이 0) */
export function pointAt(path: Path, distance: number): Vec & { angle: number } {
  const { points, cumulative } = path;
  const d = Math.max(0, Math.min(path.length, distance));
  let lo = 0;
  let hi = cumulative.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (cumulative[mid] <= d) lo = mid;
    else hi = mid;
  }
  const a = points[lo];
  const b = points[hi];
  const span = cumulative[hi] - cumulative[lo] || 1;
  const t = (d - cumulative[lo]) / span;
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
    angle: headingOf(b.x - a.x, b.y - a.y),
  };
}

/** 스프라이트가 위를 보고 그려져 있으므로 위쪽 방향을 0으로 하는 각도 */
export const headingOf = (dx: number, dy: number) => Math.atan2(dx, -dy);

export const mirror = (controls: Vec[]): Vec[] => controls.map((p) => ({ x: VIEW_WIDTH - p.x, y: p.y }));

export const translate = (controls: Vec[], dx: number, dy: number): Vec[] =>
  controls.map((p) => ({ x: p.x + dx, y: p.y + dy }));

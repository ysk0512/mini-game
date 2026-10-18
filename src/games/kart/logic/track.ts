import { CatmullRomCurve3, Vector3 } from 'three';
import type { CourseDef } from './courses';

export interface TrackSample {
  pos: Vector3;
  /** 진행 방향 단위벡터 */
  tangent: Vector3;
  /** 수평 옆 방향 단위벡터 (tangent와 수직, 진행 방향 기준 왼쪽) */
  side: Vector3;
  /** 출발선부터의 거리 */
  dist: number;
}

export interface Track {
  course: CourseDef;
  samples: TrackSample[];
  length: number;
  spacing: number;
  /** 중앙선에서 벽까지의 거리 */
  wallOffset: number;
  boostPads: { index: number; dist: number }[];
  itemRows: number[];
}

export interface Location {
  index: number;
  /** 출발선부터 트랙을 따라 잰 거리 (0 ~ length) */
  along: number;
  /** 중앙선에서 옆으로 떨어진 거리 (+면 side 방향) */
  lateral: number;
  /** 그 지점의 트랙 높이 */
  height: number;
}

const UP = new Vector3(0, 1, 0);
const SAMPLE_SPACING = 2;
const SEARCH_WINDOW = 15;

export function buildTrack(course: CourseDef): Track {
  const curve = new CatmullRomCurve3(
    course.points.map(([x, y, z]) => new Vector3(x, y, z)),
    true,
    'centripetal',
  );
  const length = curve.getLength();
  const count = Math.round(length / SAMPLE_SPACING);
  const spacing = length / count;
  const samples: TrackSample[] = [];
  for (let i = 0; i < count; i++) {
    const u = i / count;
    const pos = curve.getPointAt(u);
    const tangent = curve.getTangentAt(u).normalize();
    const flat = new Vector3(tangent.x, 0, tangent.z).normalize();
    const side = new Vector3().crossVectors(UP, flat).normalize();
    samples.push({ pos, tangent, side, dist: i * spacing });
  }

  const track: Track = {
    course,
    samples,
    length,
    spacing,
    wallOffset: course.width / 2 + course.grass,
    boostPads: [],
    itemRows: [],
  };
  const nearestTo = ([x, z]: [number, number]) => locate(track, new Vector3(x, 0, z)).index;
  track.boostPads = course.boostPads.map(nearestTo).map((index) => ({ index, dist: samples[index].dist }));
  track.itemRows = course.itemRows.map(nearestTo);
  return track;
}

export const wrapIndex = (track: Track, i: number) => ((i % track.samples.length) + track.samples.length) % track.samples.length;

/** -length/2 ~ length/2 로 감은 거리 차이 */
export function wrapDistance(track: Track, d: number) {
  const L = track.length;
  return ((((d + L / 2) % L) + L) % L) - L / 2;
}

/**
 * pos가 트랙의 어디쯤인지 찾는다.
 * hint(직전 인덱스)가 있으면 그 주변만 찾아서, 가까이 지나가는 다른 구간과 헷갈리지 않는다.
 */
export function locate(track: Track, pos: Vector3, hint?: number): Location {
  const { samples } = track;
  let best = 0;
  let bestD = Infinity;
  const check = (i: number) => {
    const d = samples[i].pos.distanceToSquared(pos);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  };
  if (hint === undefined) {
    for (let i = 0; i < samples.length; i++) check(i);
  } else {
    for (let o = -SEARCH_WINDOW; o <= SEARCH_WINDOW; o++) check(wrapIndex(track, hint + o));
  }

  // 앞뒤 구간 중 pos가 투영되는 쪽에서 보간
  const s = samples[best];
  const toPos = new Vector3().subVectors(pos, s.pos);
  const forward = toPos.dot(s.tangent) >= 0;
  const a = forward ? s : samples[wrapIndex(track, best - 1)];
  const b = forward ? samples[wrapIndex(track, best + 1)] : s;
  const seg = new Vector3().subVectors(b.pos, a.pos);
  const segLen = seg.length() || 1;
  const t = Math.max(0, Math.min(1, new Vector3().subVectors(pos, a.pos).dot(seg) / (segLen * segLen)));
  const center = a.pos.clone().lerp(b.pos, t);
  const side = a.side.clone().lerp(b.side, t).normalize();
  const along = (a.dist + t * segLen) % track.length;
  return {
    index: best,
    along,
    lateral: new Vector3(pos.x - center.x, 0, pos.z - center.z).dot(side),
    height: center.y,
  };
}

/** 트랙 위의 한 지점 (along 거리, lateral 옆 거리) */
export function pointOnTrack(track: Track, index: number, lateral: number): Vector3 {
  const s = track.samples[wrapIndex(track, index)];
  return s.pos.clone().addScaledVector(s.side, lateral);
}

/** 진행 방향 단위벡터 → 카트 heading 각도 (forward = (sin h, 0, cos h)) */
export const headingOf = (dir: Vector3) => Math.atan2(dir.x, dir.z);

export const isOffroad = (track: Track, loc: Location) => Math.abs(loc.lateral) > track.course.width / 2;

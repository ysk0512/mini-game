import type { Rect } from './types';

export interface Hit {
  /** 사각형 → 원 방향의 법선 */
  nx: number;
  ny: number;
  /** 겹친 깊이 */
  depth: number;
}

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

/** 원과 사각형의 충돌 검사. 겹치지 않으면 null. */
export function circleRect(cx: number, cy: number, r: number, rect: Rect): Hit | null {
  const closestX = clamp(cx, rect.x, rect.x + rect.w);
  const closestY = clamp(cy, rect.y, rect.y + rect.h);
  const ddx = cx - closestX;
  const ddy = cy - closestY;
  const d2 = ddx * ddx + ddy * ddy;
  if (d2 > r * r) return null;

  if (d2 === 0) {
    // 중심이 사각형 안에 들어간 경우: 가장 얕게 들어온 면으로 밀어낸다
    const left = cx - rect.x;
    const right = rect.x + rect.w - cx;
    const top = cy - rect.y;
    const bottom = rect.y + rect.h - cy;
    const m = Math.min(left, right, top, bottom);
    if (m === left) return { nx: -1, ny: 0, depth: left + r };
    if (m === right) return { nx: 1, ny: 0, depth: right + r };
    if (m === top) return { nx: 0, ny: -1, depth: top + r };
    return { nx: 0, ny: 1, depth: bottom + r };
  }

  const d = Math.sqrt(d2);
  return { nx: ddx / d, ny: ddy / d, depth: r - d };
}

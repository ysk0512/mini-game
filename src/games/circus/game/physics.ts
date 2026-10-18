import { CHARLIE_HALF_WIDTH, CHARLIE_HEIGHT, GRAVITY, JUMP_SPEED, MIN_X } from './constants';
import type { Input, Player, Rect } from './types';

export type Rng = () => number;

/** 스테이지 한 프레임의 결과: 사망 원인, 클리어, 또는 계속 진행(null) */
export type StepResult = 'hit' | 'fall' | 'clear' | null;

export const randRange = (rng: Rng, [min, max]: [number, number]) => min + rng() * (max - min);

export const overlaps = (a: Rect, b: Rect) =>
  a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

export const charlieRect = (p: Player): Rect => ({
  x: p.x - CHARLIE_HALF_WIDTH,
  y: p.y - CHARLIE_HEIGHT,
  w: CHARLIE_HALF_WIDTH * 2,
  h: CHARLIE_HEIGHT,
});

export function newPlayer(x: number, y: number): Player {
  return { x, y, vx: 0, vy: 0, grounded: true, anim: 0 };
}

/**
 * 땅(또는 줄) 위를 달리는 스테이지 공통 이동.
 * 원작처럼 점프 중에는 도약 순간의 가로 속도가 고정된다.
 */
export function runPlayer(p: Player, dt: number, input: Input, forward: number, back: number, groundY: number) {
  if (p.grounded) {
    p.vx = input.right ? forward : input.left ? -back : 0;
    if (input.jump) {
      p.vy = -JUMP_SPEED;
      p.grounded = false;
    }
  }
  p.x = Math.max(MIN_X, p.x + p.vx * dt);
  if (!p.grounded) {
    p.vy += GRAVITY * dt;
    p.y += p.vy * dt;
    if (p.y >= groundY) {
      p.y = groundY;
      p.vy = 0;
      p.grounded = true;
    }
  }
  if (p.grounded && p.vx !== 0) p.anim += dt;
}

export const reachedGoal = (p: Player, length: number) => p.grounded && p.x >= length;

import {
  CATCH_RADIUS,
  HANG_LENGTH,
  MIN_X,
  PLATFORM_JUMP_VX,
  PLATFORM_JUMP_VY,
  PLATFORM_TOP,
  PLATFORM_WALK_SPEED,
  RELEASE_BOOST_X,
  RELEASE_BOOST_Y,
  START_PLATFORM_END,
  TRAPEZE_ANCHOR_Y,
  TRAPEZE_COUNT,
  TRAPEZE_FIRST_X,
  TRAPEZE_GRAVITY,
  TRAPEZE_OMEGA,
  TRAPEZE_ROPE,
  TRAPEZE_SCORE,
  TRAPEZE_SPACING,
  VIEW_HEIGHT,
} from '../constants';
import type { StepResult } from '../physics';
import type { CircusState, Input, Player, Trapeze, TrapezeLevel } from '../types';

/** 골 발판이 시작되는 x */
export const TRAPEZE_GOAL_X = TRAPEZE_FIRST_X + (TRAPEZE_COUNT - 1) * TRAPEZE_SPACING + 200;

/** 이웃한 그네끼리 흔들리는 박자를 어긋나게 한다 */
const PHASE_STEP = 2.2;

const angle = (t: Trapeze, time: number) => t.amp * Math.sin(TRAPEZE_OMEGA * time + t.phase);

export function barPosition(t: Trapeze, time: number) {
  const theta = angle(t, time);
  return { x: t.ax + TRAPEZE_ROPE * Math.sin(theta), y: t.ay + TRAPEZE_ROPE * Math.cos(theta) };
}

export function barVelocity(t: Trapeze, time: number) {
  const theta = angle(t, time);
  const omega = t.amp * TRAPEZE_OMEGA * Math.cos(TRAPEZE_OMEGA * time + t.phase);
  return { x: TRAPEZE_ROPE * omega * Math.cos(theta), y: -TRAPEZE_ROPE * omega * Math.sin(theta) };
}

export function createTrapeze(): TrapezeLevel {
  const trapezes = Array.from({ length: TRAPEZE_COUNT }, (_, i) => ({
    ax: TRAPEZE_FIRST_X + i * TRAPEZE_SPACING,
    ay: TRAPEZE_ANCHOR_Y,
    amp: 0.5 + 0.02 * i,
    phase: i * PHASE_STEP,
  }));
  return { kind: 'trapeze', trapezes, holding: null, standing: true, lastReleased: null, releaseTimer: 0, checkpoint: -1 };
}

export function respawnTrapeze(level: TrapezeLevel) {
  level.lastReleased = null;
  level.releaseTimer = 0;
  level.holding = level.checkpoint >= 0 ? level.checkpoint : null;
  level.standing = level.checkpoint < 0;
}

/** 그네(또는 시작 발판)에 맞춰 플레이어 위치를 맞춘다 */
export function placeOnTrapeze(p: Player, level: TrapezeLevel, time: number) {
  if (level.holding !== null) {
    const bar = barPosition(level.trapezes[level.holding], time);
    p.x = bar.x;
    p.y = bar.y + HANG_LENGTH;
    p.vx = 0;
    p.vy = 0;
    p.grounded = false;
  } else if (level.standing) {
    p.y = PLATFORM_TOP;
    p.grounded = true;
  }
}

export function updateTrapeze(s: CircusState, level: TrapezeLevel, dt: number, input: Input): StepResult {
  const p = s.player;

  if (level.holding !== null) {
    if (!input.jump) {
      placeOnTrapeze(p, level, s.time);
      return null;
    }
    // 그네가 움직이는 속도를 그대로 이어받아 날아간다
    const v = barVelocity(level.trapezes[level.holding], s.time);
    p.vx = v.x + RELEASE_BOOST_X;
    p.vy = v.y - RELEASE_BOOST_Y;
    level.lastReleased = level.holding;
    level.releaseTimer = 0.4;
    level.holding = null;
  } else if (level.standing) {
    if (!input.jump) {
      p.vx = input.right ? PLATFORM_WALK_SPEED : input.left ? -PLATFORM_WALK_SPEED : 0;
      p.x = Math.max(MIN_X, Math.min(START_PLATFORM_END - 10, p.x + p.vx * dt));
      if (p.vx !== 0) p.anim += dt;
      placeOnTrapeze(p, level, s.time);
      return null;
    }
    p.vx = PLATFORM_JUMP_VX;
    p.vy = -PLATFORM_JUMP_VY;
    p.grounded = false;
    level.standing = false;
  }

  // 공중
  level.releaseTimer -= dt;
  const prevX = p.x;
  const prevY = p.y;
  p.x += p.vx * dt;
  p.vy += TRAPEZE_GRAVITY * dt;
  p.y += p.vy * dt;

  for (let i = 0; i < level.trapezes.length; i++) {
    if (i === level.lastReleased && level.releaseTimer > 0) continue;
    const bar = barPosition(level.trapezes[i], s.time);
    if (Math.hypot(bar.x - p.x, bar.y - (p.y - HANG_LENGTH)) < CATCH_RADIUS) {
      level.holding = i;
      if (i > level.checkpoint) {
        level.checkpoint = i;
        s.score += TRAPEZE_SCORE;
      }
      placeOnTrapeze(p, level, s.time);
      return null;
    }
  }

  if (p.vy > 0 && prevY <= PLATFORM_TOP && p.y >= PLATFORM_TOP) {
    if (p.x >= TRAPEZE_GOAL_X) {
      p.y = PLATFORM_TOP;
      p.vx = 0;
      p.grounded = true;
      return 'clear';
    }
    if (p.x <= START_PLATFORM_END) {
      level.standing = true;
      placeOnTrapeze(p, level, s.time);
      return null;
    }
  }
  // 골 발판 옆면에 부딪히면 미끄러져 떨어진다
  if (prevX < TRAPEZE_GOAL_X && p.x >= TRAPEZE_GOAL_X && p.y > PLATFORM_TOP) {
    p.x = TRAPEZE_GOAL_X - 1;
    p.vx = 0;
  }

  return p.y > VIEW_HEIGHT + 80 ? 'fall' : null;
}

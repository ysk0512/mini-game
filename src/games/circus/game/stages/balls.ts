import {
  BALL_BACK_SPEED,
  BALL_INTERVAL,
  BALL_PUSH_SPEED,
  BALL_RADIUS,
  BALL_ROLL_SPEED,
  BALL_SCORE,
  BALL_TOP,
  FLOOR_Y,
  GRAVITY,
  JUMP_SPEED,
  MIN_X,
  VIEW_WIDTH,
} from '../constants';
import { randRange, type Rng, type StepResult } from '../physics';
import type { BallLevel, CircusState, Input } from '../types';

export function createBalls(checkpointX: number): BallLevel {
  const level: BallLevel = { kind: 'balls', balls: [], ridingId: null, nextId: 0, spawnTimer: 0 };
  respawnBalls(level, checkpointX);
  return level;
}

export function respawnBalls(level: BallLevel, checkpointX: number) {
  const ball = { id: level.nextId++, x: checkpointX, vx: 0, scored: true };
  level.balls = [ball];
  level.ridingId = ball.id;
  level.spawnTimer = 1.5;
}

export function updateBalls(
  s: CircusState,
  level: BallLevel,
  dt: number,
  input: Input,
  rng: Rng,
  length: number,
): StepResult {
  const p = s.player;
  let riding = level.balls.find((b) => b.id === level.ridingId);

  if (riding) {
    riding.vx = input.right ? BALL_PUSH_SPEED : input.left ? -BALL_BACK_SPEED : 0;
    if (input.jump) {
      // 주인을 잃은 공은 다른 공처럼 왼쪽으로 굴러간다
      p.vx = riding.vx;
      riding.vx = -BALL_ROLL_SPEED;
      p.vy = -JUMP_SPEED;
      p.grounded = false;
      level.ridingId = null;
      riding = undefined;
    }
  }

  for (const b of level.balls) b.x += b.vx * dt;

  if (riding) {
    riding.x = Math.max(MIN_X, riding.x);
    p.x = riding.x;
    p.y = BALL_TOP;
    if (riding.vx !== 0) p.anim += dt;
  } else {
    const prevY = p.y;
    p.x = Math.max(MIN_X, p.x + p.vx * dt);
    p.vy += GRAVITY * dt;
    p.y += p.vy * dt;

    if (p.vy > 0 && prevY <= BALL_TOP && p.y >= BALL_TOP) {
      // 골 단상은 공 꼭대기와 같은 높이
      if (p.x >= length) {
        p.y = BALL_TOP;
        p.grounded = true;
        return 'clear';
      }
      const landing = level.balls
        .filter((b) => Math.abs(b.x - p.x) < BALL_RADIUS)
        .sort((a, b) => Math.abs(a.x - p.x) - Math.abs(b.x - p.x))[0];
      if (landing) {
        if (!landing.scored) {
          landing.scored = true;
          s.score += BALL_SCORE;
        }
        level.ridingId = landing.id;
        riding = landing;
        p.x = landing.x;
        p.y = BALL_TOP;
        p.vy = 0;
        p.grounded = true;
      }
    }
    if (p.y >= FLOOR_Y) {
      p.y = FLOOR_Y;
      return 'fall';
    }
  }

  level.spawnTimer -= dt;
  if (level.spawnTimer <= 0) {
    const spawnX = s.cameraX + VIEW_WIDTH + 40;
    if (spawnX < length - 150) {
      level.balls.push({ id: level.nextId++, x: spawnX, vx: -BALL_ROLL_SPEED, scored: false });
    }
    level.spawnTimer = randRange(rng, BALL_INTERVAL);
  }

  if (riding) {
    for (const b of level.balls) {
      if (b !== riding && Math.abs(b.x - riding.x) < BALL_RADIUS * 2 - 2) return 'hit';
    }
  }
  level.balls = level.balls.filter((b) => b.id === level.ridingId || b.x > s.cameraX - 60);

  return riding && p.x >= length ? 'clear' : null;
}

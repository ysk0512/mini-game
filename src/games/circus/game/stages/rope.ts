import {
  BLUE_HOP_DISTANCE,
  BLUE_HOP_SPEED,
  BLUE_MONKEY_CHANCE,
  BLUE_MONKEY_SCORE,
  BLUE_MONKEY_SPEED,
  CHARLIE_HALF_WIDTH,
  GRAVITY,
  MONKEY_HALF_WIDTH,
  MONKEY_HEIGHT,
  MONKEY_INTERVAL,
  MONKEY_SCORE,
  MONKEY_SPEED,
  ROPE_Y,
  VIEW_WIDTH,
  WALK_BACK_SPEED,
  WALK_SPEED,
} from '../constants';
import { charlieRect, overlaps, randRange, reachedGoal, runPlayer, type Rng, type StepResult } from '../physics';
import type { CircusState, Input, Monkey, Rect, RopeLevel } from '../types';

export const monkeyRect = (m: Monkey): Rect => ({
  x: m.x - MONKEY_HALF_WIDTH,
  y: m.y - MONKEY_HEIGHT,
  w: MONKEY_HALF_WIDTH * 2,
  h: MONKEY_HEIGHT,
});

export function createRope(): RopeLevel {
  return { kind: 'rope', monkeys: [], spawnTimer: 1 };
}

export function respawnRope(level: RopeLevel) {
  level.monkeys = [];
  level.spawnTimer = 1;
}

export function updateRope(
  s: CircusState,
  level: RopeLevel,
  dt: number,
  input: Input,
  rng: Rng,
  length: number,
): StepResult {
  const p = s.player;
  runPlayer(p, dt, input, WALK_SPEED, WALK_BACK_SPEED, ROPE_Y);

  level.spawnTimer -= dt;
  if (level.spawnTimer <= 0) {
    const spawnX = s.cameraX + VIEW_WIDTH + 40;
    if (spawnX < length - 150) {
      level.monkeys.push({ x: spawnX, y: ROPE_Y, vy: 0, blue: rng() < BLUE_MONKEY_CHANCE, scored: false });
    }
    level.spawnTimer = randRange(rng, MONKEY_INTERVAL);
  }

  const body = charlieRect(p);
  for (const m of level.monkeys) {
    m.x -= (m.blue ? BLUE_MONKEY_SPEED : MONKEY_SPEED) * dt;

    // 파란 원숭이는 빠르게 달리다가 앞의 갈색 원숭이를 뛰어넘는다
    const onRope = m.y >= ROPE_Y && m.vy === 0;
    if (m.blue && onRope && level.monkeys.some((o) => !o.blue && o.x < m.x && m.x - o.x < BLUE_HOP_DISTANCE)) {
      m.vy = -BLUE_HOP_SPEED;
    }
    if (m.vy !== 0) {
      m.vy += GRAVITY * dt;
      m.y += m.vy * dt;
      if (m.y >= ROPE_Y) {
        m.y = ROPE_Y;
        m.vy = 0;
      }
    }

    if (overlaps(body, monkeyRect(m))) return 'hit';
    if (!m.scored && m.x + MONKEY_HALF_WIDTH < p.x - CHARLIE_HALF_WIDTH) {
      m.scored = true;
      s.score += m.blue ? BLUE_MONKEY_SCORE : MONKEY_SCORE;
    }
  }
  level.monkeys = level.monkeys.filter((m) => m.x > s.cameraX - 60);

  return reachedGoal(p, length) ? 'clear' : null;
}

import {
  FLOOR_Y,
  LION_BACK_SPEED,
  LION_HALF_LENGTH,
  LION_HEIGHT,
  LION_SPEED,
  MARKER_SPACING,
  POT_HALF_WIDTH,
  POT_HEIGHT,
  POT_SCORE,
  RIDER_BOTTOM,
  RIDER_TOP,
  RING_BOTTOM,
  RING_EDGE_HALF,
  RING_INTERVAL,
  RING_SCORE,
  RING_SPEED,
  RING_TOP,
  VIEW_WIDTH,
} from '../constants';
import { overlaps, randRange, reachedGoal, runPlayer, type Rng, type StepResult } from '../physics';
import type { CircusState, Input, LionLevel, Player, Pot, Rect, Ring } from '../types';

export const lionRect = (p: Player): Rect => ({
  x: p.x - LION_HALF_LENGTH,
  y: p.y - LION_HEIGHT,
  w: LION_HALF_LENGTH * 2,
  h: LION_HEIGHT,
});

export const riderRect = (p: Player): Rect => ({ x: p.x - 10, y: p.y - RIDER_TOP, w: 20, h: RIDER_TOP - RIDER_BOTTOM });

/** 불링은 옆에서 보면 얇으므로 위·아래 테두리만 충돌 판정한다 */
const ringEdge = (ring: Ring, y: number): Rect => ({
  x: ring.x - 4,
  y: y - RING_EDGE_HALF,
  w: 8,
  h: RING_EDGE_HALF * 2,
});

export const potRect = (pot: Pot): Rect => ({
  x: pot.x - POT_HALF_WIDTH,
  y: FLOOR_Y - POT_HEIGHT,
  w: POT_HALF_WIDTH * 2,
  h: POT_HEIGHT,
});

export function createLion(length: number, rng: Rng): LionLevel {
  const pots: Pot[] = [];
  // 표지판(체크포인트) 사이 구간 가운데쯤에 불항아리를 놓는다
  for (let m = MARKER_SPACING; m < length - MARKER_SPACING / 2; m += MARKER_SPACING) {
    if (rng() < 0.85) pots.push({ x: m + MARKER_SPACING / 2 + (rng() * 2 - 1) * 60, scored: false });
  }
  return { kind: 'lion', rings: [], pots, spawnTimer: 1 };
}

export function respawnLion(level: LionLevel, checkpointX: number) {
  level.rings = [];
  level.spawnTimer = 1;
  for (const pot of level.pots) if (pot.x > checkpointX) pot.scored = false;
}

export function updateLion(
  s: CircusState,
  level: LionLevel,
  dt: number,
  input: Input,
  rng: Rng,
  length: number,
): StepResult {
  const p = s.player;
  runPlayer(p, dt, input, LION_SPEED, LION_BACK_SPEED, FLOOR_Y);

  level.spawnTimer -= dt;
  if (level.spawnTimer <= 0) {
    const spawnX = s.cameraX + VIEW_WIDTH + 40;
    if (spawnX < length - 150) level.rings.push({ x: spawnX, scored: false });
    level.spawnTimer = randRange(rng, RING_INTERVAL);
  }

  const body = lionRect(p);
  const rider = riderRect(p);
  for (const ring of level.rings) {
    ring.x -= RING_SPEED * dt;
    const bottom = ringEdge(ring, RING_BOTTOM);
    const top = ringEdge(ring, RING_TOP);
    if (overlaps(body, bottom) || overlaps(rider, bottom) || overlaps(rider, top)) return 'hit';
    if (!ring.scored && ring.x < p.x - LION_HALF_LENGTH) {
      ring.scored = true;
      s.score += RING_SCORE;
    }
  }
  level.rings = level.rings.filter((r) => r.x > s.cameraX - 60);

  for (const pot of level.pots) {
    if (overlaps(body, potRect(pot))) return 'hit';
    if (!pot.scored && pot.x + POT_HALF_WIDTH < p.x - LION_HALF_LENGTH) {
      pot.scored = true;
      s.score += POT_SCORE;
    }
  }

  return reachedGoal(p, length) ? 'clear' : null;
}

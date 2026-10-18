import { COURSES, type Vec3 } from './courses';

export const MARBLE_RADIUS = 0.36;
export const MARBLE_HIGHSCORE_KEY = 'marble-highscore';
export const STEP = 1 / 60;
export type Phase = 'ready' | 'playing' | 'paused' | 'falling' | 'clear' | 'victory';
export type MarbleEvent = 'gem' | 'checkpoint' | 'fall' | 'respawn' | 'clear' | 'locked' | 'spring';
export interface MarbleGame {
  stage: number; phase: Phase; resumePhase: 'playing' | 'falling';
  time: number; clock: number; falls: number; score: number; bonus: number; stars: number;
  collected: Set<number>; checkpoint: number; position: Vec3; respawn: Vec3 | null;
  fallTimer: number; jumpCooldown: number; notice: string; noticeTime: number;
}
export interface MarbleInput { x: number; y: number; brake: boolean; jump: boolean }
export interface Velocity { x: number; y: number; z: number }

export function createMarble(stage = 0, score = 0): MarbleGame {
  const start = COURSES[stage].start;
  return {
    stage, phase: 'ready', resumePhase: 'playing', time: 0, clock: 0, falls: 0,
    score, bonus: 0, stars: 0, collected: new Set(), checkpoint: -1,
    position: [start[0], start[1] + MARBLE_RADIUS + 0.04, start[2]], respawn: null,
    fallTimer: 0, jumpCooldown: 0, notice: '', noticeTime: 0,
  };
}

export function togglePause(game: MarbleGame) {
  if (game.phase === 'playing' || game.phase === 'falling') {
    game.resumePhase = game.phase;
    game.phase = 'paused';
  } else if (game.phase === 'paused') game.phase = game.resumePhase;
}

/** Camera-aligned steering, normalized so diagonals are not faster. */
export function movement(input: MarbleInput): { x: number; z: number } {
  const length = Math.max(1, Math.hypot(input.x, input.y));
  const x = input.x / length;
  const y = input.y / length;
  return { x: 0.8 * x + 0.6 * y, z: -0.6 * x + 0.8 * y };
}

export function drive(velocity: Velocity, input: MarbleInput, dt: number): Velocity {
  const direction = movement(input);
  const drag = Math.exp(-(input.brake ? 8 : 0.65) * dt);
  let x = velocity.x * drag + direction.x * (input.brake ? 4 : 10) * dt;
  let z = velocity.z * drag + direction.z * (input.brake ? 4 : 10) * dt;
  const speed = Math.hypot(x, z);
  if (speed > 5.1) { x *= 5.1 / speed; z *= 5.1 / speed; }
  return { x, y: velocity.y, z };
}

export function tick(game: MarbleGame, dt: number) {
  if (game.phase !== 'playing' && game.phase !== 'falling') return;
  game.time += dt;
  game.clock += dt;
  game.jumpCooldown = Math.max(0, game.jumpCooldown - dt);
  game.noticeTime = Math.max(0, game.noticeTime - dt);
  if (game.phase === 'falling') {
    game.fallTimer -= dt;
    if (game.fallTimer <= 0) {
      const course = COURSES[game.stage];
      const at = game.checkpoint < 0 ? course.start : course.checkpoints[game.checkpoint];
      game.respawn = [at[0], at[1] + MARBLE_RADIUS + 0.1, at[2]];
      game.phase = 'playing';
    }
  }
}

function near(position: Vec3, at: Vec3, radius: number, height = 1.4) {
  return Math.hypot(position[0] - at[0], position[2] - at[2]) < radius
    && position[1] > at[1] - 0.2 && position[1] < at[1] + height;
}
function notice(game: MarbleGame, text: string) { game.notice = text; game.noticeTime = 2.5; }

export function inspectPosition(game: MarbleGame, position: Vec3): MarbleEvent[] {
  game.position = position;
  if (game.phase !== 'playing') return [];
  const events: MarbleEvent[] = [];
  const course = COURSES[game.stage];
  if (position[1] < -4) {
    game.falls++;
    game.phase = 'falling';
    game.fallTimer = 0.7;
    notice(game, game.checkpoint < 0 ? '괜찮아요. 출발점에서 다시!' : '체크포인트에서 다시 출발!');
    return ['fall'];
  }
  course.gems.forEach((at, index) => {
    if (!game.collected.has(index) && near(position, at, 0.78, 2)) {
      game.collected.add(index);
      game.score += 100;
      events.push('gem');
      if (game.collected.size === course.gems.length) notice(game, '보석을 모두 모았어요! 빛나는 골로 가세요.');
    }
  });
  course.checkpoints.forEach((at, index) => {
    if (index > game.checkpoint && near(position, at, 0.8)) {
      game.checkpoint = index;
      notice(game, '체크포인트 저장!');
      events.push('checkpoint');
    }
  });
  if (course.springs.some(at => near(position, at, 0.65, 0.8)) && game.jumpCooldown === 0) {
    game.jumpCooldown = 1;
    events.push('spring');
  }
  if (near(position, course.goal, 0.9)) {
    if (game.collected.size === course.gems.length) {
      game.bonus = Math.max(200, 1000 + Math.floor(Math.max(0, course.par - game.time) * 20) - game.falls * 100);
      game.score += game.bonus;
      game.stars = 1 + Number(game.falls === 0) + Number(game.falls === 0 && game.time <= course.par);
      game.phase = game.stage === COURSES.length - 1 ? 'victory' : 'clear';
      events.push('clear');
    } else if (game.noticeTime <= 0) {
      notice(game, `보석 ${course.gems.length - game.collected.size}개를 더 모아 주세요.`);
      events.push('locked');
    }
  }
  return events;
}

export function formatTime(time: number) {
  return `${String(Math.floor(time / 60)).padStart(2, '0')}:${String(Math.floor(time % 60)).padStart(2, '0')}`;
}
